-- Sprint 0.5 Agent 最小可运行迁移草案
-- 范围：agent_runs / agent_run_checkpoints / agent_events / agent_tool_runs / agent_token_usage
-- 原则：可执行、可回滚默认、最小侵入（不依赖尚未落地的 agent_threads/agent_goals）

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS agent_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    thread_id UUID,
    goal_id UUID,
    state TEXT NOT NULL CHECK (
        state IN (
            'queued',
            'running',
            'waiting_confirm',
            'succeeded',
            'failed',
            'canceled',
            'timed_out',
            'expired'
        )
    ),
    attempt_no INT NOT NULL DEFAULT 1 CHECK (attempt_no >= 1),
    max_retries INT NOT NULL DEFAULT 3 CHECK (max_retries >= 0),
    queue_timeout_sec INT NOT NULL DEFAULT 300 CHECK (queue_timeout_sec > 0),
    run_timeout_sec INT NOT NULL DEFAULT 1800 CHECK (run_timeout_sec > 0),
    budget_input_tokens INT,
    budget_output_tokens INT,
    budget_cost_usd NUMERIC(12, 4) CHECK (budget_cost_usd IS NULL OR budget_cost_usd >= 0),
    request_idempotency_key TEXT,
    trace_id TEXT NOT NULL,
    error_code TEXT,
    final_error_detail JSONB,
    confirm_expires_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_agent_runs_time CHECK (
        started_at IS NULL OR ended_at IS NULL OR ended_at >= started_at
    ),
    CONSTRAINT ck_agent_runs_waiting_confirm_ttl CHECK (
        state <> 'waiting_confirm' OR confirm_expires_at IS NOT NULL
    )
);

CREATE TABLE IF NOT EXISTS agent_run_checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
    attempt_no INT NOT NULL CHECK (attempt_no >= 1),
    step_no INT NOT NULL CHECK (step_no >= 1),
    step_name TEXT NOT NULL,
    checkpoint_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_agent_run_checkpoint_step UNIQUE (run_id, attempt_no, step_no)
);

CREATE TABLE IF NOT EXISTS agent_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    run_id UUID REFERENCES agent_runs(id) ON DELETE CASCADE,
    thread_id UUID,
    event_type TEXT NOT NULL,
    event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    source TEXT,
    event_idempotency_key TEXT,
    trace_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_agent_events_anchor CHECK (run_id IS NOT NULL OR thread_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS agent_tool_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
    thread_id UUID,
    tool_name TEXT NOT NULL,
    dry_run BOOLEAN NOT NULL DEFAULT TRUE,
    status TEXT NOT NULL CHECK (
        status IN ('queued', 'running', 'succeeded', 'failed', 'canceled', 'timed_out', 'skipped')
    ),
    retry_no INT NOT NULL DEFAULT 0 CHECK (retry_no >= 0),
    idempotency_key TEXT,
    trace_id TEXT,
    input_payload JSONB,
    output_payload JSONB,
    latency_ms INT CHECK (latency_ms IS NULL OR latency_ms >= 0),
    error_code TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_token_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    run_id UUID REFERENCES agent_runs(id) ON DELETE CASCADE,
    model TEXT NOT NULL,
    pricing_version TEXT,
    prompt_tokens INT CHECK (prompt_tokens IS NULL OR prompt_tokens >= 0),
    completion_tokens INT CHECK (completion_tokens IS NULL OR completion_tokens >= 0),
    total_tokens INT GENERATED ALWAYS AS (COALESCE(prompt_tokens, 0) + COALESCE(completion_tokens, 0)) STORED,
    cost_usd NUMERIC(12, 6) CHECK (cost_usd IS NULL OR cost_usd >= 0),
    budget_exceeded BOOLEAN NOT NULL DEFAULT FALSE,
    trace_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 更新时间戳函数与触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 更新时间戳触发器
DROP TRIGGER IF EXISTS update_agent_runs_updated_at ON agent_runs;
CREATE TRIGGER update_agent_runs_updated_at
BEFORE UPDATE ON agent_runs
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_agent_run_checkpoints_updated_at ON agent_run_checkpoints;
CREATE TRIGGER update_agent_run_checkpoints_updated_at
BEFORE UPDATE ON agent_run_checkpoints
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_agent_tool_runs_updated_at ON agent_tool_runs;
CREATE TRIGGER update_agent_tool_runs_updated_at
BEFORE UPDATE ON agent_tool_runs
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 幂等约束
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_runs_request_idempotency
    ON agent_runs (user_id, request_idempotency_key)
    WHERE request_idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_tool_runs_idempotency
    ON agent_tool_runs (user_id, tool_name, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_events_idempotency
    ON agent_events (user_id, event_idempotency_key)
    WHERE event_idempotency_key IS NOT NULL;

-- 核心查询索引
CREATE INDEX IF NOT EXISTS idx_agent_runs_user_created_at
    ON agent_runs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_runs_user_state_updated_at
    ON agent_runs (user_id, state, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_runs_trace_id
    ON agent_runs (trace_id);

CREATE INDEX IF NOT EXISTS idx_agent_checkpoints_run_created_at
    ON agent_run_checkpoints (run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_events_run_created_at
    ON agent_events (run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_events_user_created_at
    ON agent_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_tool_runs_run_created_at
    ON agent_tool_runs (run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_tool_runs_trace_id
    ON agent_tool_runs (trace_id);

CREATE INDEX IF NOT EXISTS idx_agent_token_usage_run_created_at
    ON agent_token_usage (run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_token_usage_user_created_at
    ON agent_token_usage (user_id, created_at DESC);

COMMIT;
