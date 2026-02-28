-- Ensure users table exists
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Referral & quota columns (idempotent)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referred_by UUID;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS diagnoses_remaining INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS interviews_remaining INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS points_balance INTEGER NOT NULL DEFAULT 30;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS membership_tier TEXT NOT NULL DEFAULT 'FREE';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deletion_pending_until TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS analysis_dossier_latest JSONB;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS analysis_dossier_history JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS career_profile_latest JSONB;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS career_profile_history JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_referred_by_fkey'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_referred_by_fkey
      FOREIGN KEY (referred_by) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- referral_code unique index (NULL allowed)
CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_key
  ON public.users(referral_code)
  WHERE referral_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS users_deletion_pending_until_idx
  ON public.users(deletion_pending_until)
  WHERE deletion_pending_until IS NOT NULL;

-- Reward event ledger for idempotency (one invited user can be rewarded once)
CREATE TABLE IF NOT EXISTS public.referral_reward_events (
  invited_user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  inviter_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL,
  inviter_diagnosis_bonus INTEGER NOT NULL DEFAULT 0,
  inviter_interview_bonus INTEGER NOT NULL DEFAULT 0,
  invited_diagnosis_bonus INTEGER NOT NULL DEFAULT 0,
  invited_interview_bonus INTEGER NOT NULL DEFAULT 0,
  inviter_points_bonus INTEGER NOT NULL DEFAULT 0,
  invited_points_bonus INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.referral_reward_events ADD COLUMN IF NOT EXISTS inviter_points_bonus INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.referral_reward_events ADD COLUMN IF NOT EXISTS invited_points_bonus INTEGER NOT NULL DEFAULT 0;

-- Points ledger for billing/usage transparency
CREATE TABLE IF NOT EXISTS public.points_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  action TEXT NOT NULL,
  source_type TEXT,
  source_id TEXT,
  note TEXT,
  balance_after INTEGER,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS points_ledger_user_created_idx
  ON public.points_ledger(user_id, created_at DESC);

-- Generate deterministic invite code from UUID (uppercase 8 chars)
CREATE OR REPLACE FUNCTION public.generate_referral_code(p_user_id UUID)
RETURNS TEXT AS $$
BEGIN
  RETURN UPPER(SUBSTRING(REPLACE(p_user_id::TEXT, '-', '') FROM 1 FOR 8));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create user row + apply referral rewards (idempotent)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_name TEXT;
  v_referral_code_input TEXT;
  v_self_referral_code TEXT;
  v_inviter_id UUID;
  v_reward_inserted UUID;
  -- reward policy (you can adjust these four numbers)
  v_inviter_diagnosis_bonus INTEGER := 3;
  v_inviter_interview_bonus INTEGER := 1;
  v_invited_diagnosis_bonus INTEGER := 1;
  v_invited_interview_bonus INTEGER := 0;
  v_inviter_points_bonus INTEGER := 100;
  v_invited_points_bonus INTEGER := 100;
BEGIN
  v_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'name', ''), 'User');
  v_referral_code_input := UPPER(TRIM(COALESCE(NEW.raw_user_meta_data->>'referral_code', '')));
  v_self_referral_code := public.generate_referral_code(NEW.id);

  INSERT INTO public.users (
    id,
    email,
    name,
    referral_code,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_name,
    v_self_referral_code,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    name = COALESCE(NULLIF(EXCLUDED.name, ''), public.users.name),
    referral_code = COALESCE(public.users.referral_code, EXCLUDED.referral_code),
    updated_at = NOW();

  -- No referral code supplied or self-referral: skip reward.
  IF v_referral_code_input IS NULL OR v_referral_code_input = '' OR v_referral_code_input = v_self_referral_code THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_inviter_id
  FROM public.users
  WHERE referral_code = v_referral_code_input
  LIMIT 1;

  IF v_inviter_id IS NULL OR v_inviter_id = NEW.id THEN
    RETURN NEW;
  END IF;

  UPDATE public.users
  SET referred_by = v_inviter_id,
      updated_at = NOW()
  WHERE id = NEW.id;

  INSERT INTO public.referral_reward_events (
    invited_user_id,
    inviter_user_id,
    referral_code,
    inviter_diagnosis_bonus,
    inviter_interview_bonus,
    invited_diagnosis_bonus,
    invited_interview_bonus,
    inviter_points_bonus,
    invited_points_bonus
  )
  VALUES (
    NEW.id,
    v_inviter_id,
    v_referral_code_input,
    v_inviter_diagnosis_bonus,
    v_inviter_interview_bonus,
    v_invited_diagnosis_bonus,
    v_invited_interview_bonus,
    v_inviter_points_bonus,
    v_invited_points_bonus
  )
  ON CONFLICT (invited_user_id) DO NOTHING
  RETURNING invited_user_id INTO v_reward_inserted;

  IF v_reward_inserted IS NOT NULL THEN
    UPDATE public.users
    SET
      diagnoses_remaining = COALESCE(diagnoses_remaining, 0) + v_inviter_diagnosis_bonus,
      interviews_remaining = COALESCE(interviews_remaining, 0) + v_inviter_interview_bonus,
      points_balance = COALESCE(points_balance, 0) + v_inviter_points_bonus,
      updated_at = NOW()
    WHERE id = v_inviter_id;

    INSERT INTO public.points_ledger (user_id, delta, action, source_type, source_id, note, balance_after, metadata, created_at)
    SELECT
      v_inviter_id,
      v_inviter_points_bonus,
      'referral_inviter_bonus',
      'referral',
      NEW.id::TEXT,
      '邀请好友奖励积分',
      points_balance,
      jsonb_build_object('invited_user_id', NEW.id, 'referral_code', v_referral_code_input),
      NOW()
    FROM public.users
    WHERE id = v_inviter_id;

    UPDATE public.users
    SET
      diagnoses_remaining = COALESCE(diagnoses_remaining, 0) + v_invited_diagnosis_bonus,
      interviews_remaining = COALESCE(interviews_remaining, 0) + v_invited_interview_bonus,
      points_balance = COALESCE(points_balance, 0) + v_invited_points_bonus,
      updated_at = NOW()
    WHERE id = NEW.id;

    INSERT INTO public.points_ledger (user_id, delta, action, source_type, source_id, note, balance_after, metadata, created_at)
    SELECT
      NEW.id,
      v_invited_points_bonus,
      'referral_invited_bonus',
      'referral',
      v_inviter_id::TEXT,
      '被邀请注册奖励积分',
      points_balance,
      jsonb_build_object('inviter_user_id', v_inviter_id, 'referral_code', v_referral_code_input),
      NOW()
    FROM public.users
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: run on new auth.users rows
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backup RPC: create user row on demand
CREATE OR REPLACE FUNCTION public.create_user_record(
  user_id UUID,
  user_email TEXT,
  user_name TEXT DEFAULT 'User'
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.users (id, email, name, referral_code, created_at, updated_at)
  VALUES (
    user_id,
    user_email,
    COALESCE(NULLIF(user_name, ''), 'User'),
    public.generate_referral_code(user_id),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    name = COALESCE(NULLIF(EXCLUDED.name, ''), public.users.name),
    referral_code = COALESCE(public.users.referral_code, EXCLUDED.referral_code),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 设置RLS策略（如果需要的话）
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_reward_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.points_ledger ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'users'
      AND policyname = 'Users can view own profile'
  ) THEN
    CREATE POLICY "Users can view own profile" ON public.users
      FOR SELECT USING (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'users'
      AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile" ON public.users
      FOR UPDATE USING (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'users'
      AND policyname = 'Enable insert for authenticated users'
  ) THEN
    CREATE POLICY "Enable insert for authenticated users" ON public.users
      FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- referral_reward_events: only owner can read own reward records
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'referral_reward_events'
      AND policyname = 'Users can view own referral rewards'
  ) THEN
    CREATE POLICY "Users can view own referral rewards"
      ON public.referral_reward_events
      FOR SELECT
      USING (auth.uid() = invited_user_id OR auth.uid() = inviter_user_id);
  END IF;
END $$;

-- points_ledger: user can read own ledger and insert own usage rows
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'points_ledger'
      AND policyname = 'Users can view own points ledger'
  ) THEN
    CREATE POLICY "Users can view own points ledger"
      ON public.points_ledger
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'points_ledger'
      AND policyname = 'Users can insert own points ledger'
  ) THEN
    CREATE POLICY "Users can insert own points ledger"
      ON public.points_ledger
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
