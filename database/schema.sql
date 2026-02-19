-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Create resumes table
CREATE TABLE IF NOT EXISTS resumes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    resume_data JSONB NOT NULL,
    score INTEGER DEFAULT 0,
    has_dot BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI suggestion feedback table
CREATE TABLE IF NOT EXISTS ai_suggestion_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resume_id UUID REFERENCES resumes(id) ON DELETE SET NULL,
    suggestion_id VARCHAR(255) NOT NULL,
    rating VARCHAR(10) NOT NULL CHECK (rating IN ('up', 'down')),
    title VARCHAR(255),
    reason_masked TEXT,
    original_value_masked JSONB,
    suggested_value_masked JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON resumes(user_id);
CREATE INDEX IF NOT EXISTS idx_resumes_created_at ON resumes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_user_id ON ai_suggestion_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_resume_id ON ai_suggestion_feedback(resume_id);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_created_at ON ai_suggestion_feedback(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_suggestion_feedback ENABLE ROW LEVEL SECURITY;

-- Create policies for users table (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'Users can view own profile'
    ) THEN
        CREATE POLICY "Users can view own profile" ON users
            FOR SELECT USING (auth.uid()::text = id::text);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'Users can update own profile'
    ) THEN
        CREATE POLICY "Users can update own profile" ON users
            FOR UPDATE USING (auth.uid()::text = id::text);
    END IF;
END $$;

-- Create policies for resumes table (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'resumes' AND policyname = 'Users can view own resumes'
    ) THEN
        CREATE POLICY "Users can view own resumes" ON resumes
            FOR SELECT USING (auth.uid()::text = user_id::text);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'resumes' AND policyname = 'Users can create own resumes'
    ) THEN
        CREATE POLICY "Users can create own resumes" ON resumes
            FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'resumes' AND policyname = 'Users can update own resumes'
    ) THEN
        CREATE POLICY "Users can update own resumes" ON resumes
            FOR UPDATE USING (auth.uid()::text = user_id::text);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'resumes' AND policyname = 'Users can delete own resumes'
    ) THEN
        CREATE POLICY "Users can delete own resumes" ON resumes
            FOR DELETE USING (auth.uid()::text = user_id::text);
    END IF;
END $$;

-- Create policies for ai_suggestion_feedback table (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'ai_suggestion_feedback' AND policyname = 'Users can view own ai feedback'
    ) THEN
        CREATE POLICY "Users can view own ai feedback" ON ai_suggestion_feedback
            FOR SELECT USING (auth.uid()::text = user_id::text);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'ai_suggestion_feedback' AND policyname = 'Users can create own ai feedback'
    ) THEN
        CREATE POLICY "Users can create own ai feedback" ON ai_suggestion_feedback
            FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'ai_suggestion_feedback' AND policyname = 'Users can delete own ai feedback'
    ) THEN
        CREATE POLICY "Users can delete own ai feedback" ON ai_suggestion_feedback
            FOR DELETE USING (auth.uid()::text = user_id::text);
    END IF;
END $$;

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_resumes_updated_at ON resumes;
CREATE TRIGGER update_resumes_updated_at BEFORE UPDATE ON resumes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
