BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS guided_flow_state JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.users.guided_flow_state IS
  'GuidedFlow recovery state: step/resume_id/jd_key/analysis_mode/source.';

CREATE OR REPLACE FUNCTION public.set_users_updated_at_guided_flow()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'updated_at'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'users'
      AND t.tgname = 'update_users_updated_at_guided_flow'
      AND NOT t.tgisinternal
  ) THEN
    CREATE TRIGGER update_users_updated_at_guided_flow
      BEFORE UPDATE ON public.users
      FOR EACH ROW
      EXECUTE FUNCTION public.set_users_updated_at_guided_flow();
  END IF;
END
$$;

COMMIT;

-- Rollback SQL:
-- BEGIN;
-- DROP TRIGGER IF EXISTS update_users_updated_at_guided_flow ON public.users;
-- DROP FUNCTION IF EXISTS public.set_users_updated_at_guided_flow();
-- ALTER TABLE public.users DROP COLUMN IF EXISTS guided_flow_state;
-- COMMIT;
