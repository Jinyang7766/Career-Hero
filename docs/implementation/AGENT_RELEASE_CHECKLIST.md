# Agent Release Checklist (Sprint 0.5 -> Sprint 1)

Use this checklist before enabling Agent APIs in any non-dev environment.

Scope of this checklist:

- `POST /api/agent/intent`
- `POST /api/agent/runs`
- `GET /api/agent/runs/{run_id}`
- `POST /api/agent/execute`
- `POST /api/agent/runs/{run_id}/confirm`
- `POST /api/agent/runs/{run_id}/retry`
- `POST /api/agent/runs/{run_id}/cancel`
- `GET /api/agent/runs/{run_id}/events`
- `GET /api/agent/timeline`
- `POST /api/agent/feedback`

## 1. Preflight Config

1. Required backend env vars:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_KEY`
- `JWT_SECRET`

2. Agent feature flags:
- `AGENT_API_ENABLED=0` (default before migration/smoke)
- `AGENT_INTENT_CONFIDENCE_THRESHOLD=0.45` (recommended baseline)
- `AGENT_MOCK_WORKER_ENABLED=0` (recommended for non-dev)

3. Optional test env vars:
- `AGENT_SMOKE_USER_ID`
- `AGENT_API_SMOKE_TOKEN`
- `CAREER_HERO_TEST_EMAIL`
- `CAREER_HERO_TEST_PASSWORD`

## 2. Database Readiness

1. Apply migration:
- `database/migrations/2026-03-02-agent-sprint0_5.sql`

2. Run DB smoke:

```powershell
python scripts/agent_db_smoke.py --user-id "<existing-users-id-uuid>"
```

3. Success criteria:
- Script ends with `[smoke] success`.
- Duplicate `agent_events.event_idempotency_key` conflict check passes.

## 3. API Readiness

1. Keep `AGENT_API_ENABLED=0`.
2. Deploy backend build with latest code.
3. Enable Agent route flag in target environment:
- `AGENT_API_ENABLED=1`

4. Run API smoke:

```powershell
python scripts/agent_api_smoke.py --backend-url "https://your-backend.example.com" --token "<bearer-token>"
```

5. Success criteria:
- Script ends with `[api-smoke] success`.
- `execute` returns dry_run preview + confirmation token.
- `confirm` commits successfully and resumes run state.
- `cancel` idempotent replay returns same payload.
- `events` endpoint returns list and supports cursor.
- `timeline` endpoint returns list and supports cursor.

## 4. Combined Step Gate (Optional)

Single command pipeline:

```powershell
pwsh -File scripts/test-step.ps1 `
  -FrontendUrl "https://your-frontend.example.com" `
  -BackendUrl "https://your-backend.example.com" `
  -RunAgentApiSmoke `
  -RunAgentDbSmoke `
  -AgentSmokeUserId "<existing-users-id-uuid>"
```

## 5. Rollout Plan

1. Stage environment:
- Enable `AGENT_API_ENABLED=1`.
- Run DB + API smoke.
- Verify no 5xx spikes on `/api/agent/*`.

2. Production initial rollout:
- Enable `AGENT_API_ENABLED=1` for first release window.
- Keep `AGENT_INTENT_CONFIDENCE_THRESHOLD` conservative (0.45 or higher).
- Monitor error logs for:
  - `AGENT_INTERNAL_ERROR`
  - `AGENT_IDEMPOTENCY_CONFLICT`
  - `AGENT_INVALID_STATE_TRANSITION`

3. Stabilization window:
- Track 24h error rate and retry/cancel success behavior.
- Keep rollback ready (section 6).

## 6. Rollback Procedure

1. Immediate rollback switch:
- Set `AGENT_API_ENABLED=0`.
- Redeploy backend.

2. Validation after rollback:
- Existing non-Agent APIs remain healthy.
- `/api/agent/*` should no longer be exposed.

3. Data rollback:
- No destructive DB rollback required for immediate service recovery.
- Preserve `agent_*` tables for audit and postmortem unless explicitly requested.

## 7. Exit Criteria

Release can be considered ready when all are true:

1. Migration applied in target environment.
2. DB smoke passes.
3. API smoke passes.
4. `scripts/test-local.ps1 -SkipInstall` passes on release commit.
5. Rollback switch tested at least once in non-prod.
