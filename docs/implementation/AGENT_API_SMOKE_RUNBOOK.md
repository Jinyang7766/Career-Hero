# Agent API Smoke Runbook

This runbook validates the minimum Agent API lifecycle in a running backend environment.

Covered endpoints:

- `POST /api/agent/intent`
- `POST /api/agent/runs`
- `GET /api/agent/runs/{run_id}`
- `POST /api/agent/execute`
- `POST /api/agent/runs/{run_id}/confirm`
- `POST /api/agent/feedback`
- `POST /api/agent/runs/{run_id}/retry`
- `POST /api/agent/runs/{run_id}/cancel`
- `GET /api/agent/runs/{run_id}/events`
- `GET /api/agent/timeline`

## 1. Preconditions

1. Backend is reachable and healthy.
2. Agent routes enabled in backend:
- `AGENT_API_ENABLED=1`
3. Authentication available:
- Either provide `AGENT_API_SMOKE_TOKEN`, or
- Provide valid `CAREER_HERO_TEST_EMAIL` and `CAREER_HERO_TEST_PASSWORD`.

## 2. Command

Use existing token:

```powershell
$env:AGENT_SMOKE_BACKEND_URL="https://your-backend.example.com"
$env:AGENT_API_SMOKE_TOKEN="<bearer-token>"
python scripts/agent_api_smoke.py `
  --analysis-mode targeted `
  --generation-strategy create_new `
  --jd-key "jd_api_smoke_targeted"
```

Use login credentials:

```powershell
python scripts/agent_api_smoke.py `
  --backend-url "https://your-backend.example.com" `
  --email "tester@example.com" `
  --password "***"
```

Optional lifecycle demo (dev only):

```powershell
python scripts/agent_api_smoke.py `
  --backend-url "https://your-backend.example.com" `
  --token "<bearer-token>" `
  --simulate-lifecycle
```

Requires:
- `AGENT_API_ENABLED=1`
- `AGENT_MOCK_WORKER_ENABLED=1`

## 3. What It Verifies

1. Auth works (token or login).
2. `intent` endpoint responds with routeable output or controlled low-confidence rejection.
3. `runs` create/get works.
4. `run_created` 事件携带 `analysis_mode / generation_strategy / jd_key` 元数据透传。
5. `execute` dry_run returns `tool_run_id + confirm_token` and run enters `waiting_confirm`.
6. `confirm` succeeds and resumes run state.
7. `feedback` supports both run-level and thread-level writes.
8. `retry` rejects invalid transition with `409 AGENT_INVALID_STATE_TRANSITION` for non-failed run.
9. `cancel` works and supports idempotency replay (same key -> same payload).
10. `events` list works with limit; second-page request is validated when `next_cursor` exists.
11. `timeline` thread list works with limit/cursor pagination.
12. Optional: lifecycle demo endpoint can drive `queued -> running -> succeeded`.

## 4. Success Criteria

Expected output includes:

- `[api-smoke] auth: ok`
- `[api-smoke] create_run: ok (...)`
- `[api-smoke] get_run: ok`
- `[api-smoke] run_created_metadata: ok`
- `[api-smoke] execute_tool: ok`
- `[api-smoke] confirm_tool: ok`
- `[api-smoke] feedback: ok`
- `[api-smoke] thread_feedback: ok`
- `[api-smoke] retry_run invalid transition: ok`
- `[api-smoke] cancel_run: ok`
- `[api-smoke] cancel_run replay: ok`
- `[api-smoke] timeline_page1: ok`
- `[api-smoke] success`

## 5. Failure Triage

1. `404` on `/api/agent/*`:
- Verify `AGENT_API_ENABLED=1`.

2. Auth failure (`401`):
- Check token validity or email/password correctness.

3. `500` on create/get/cancel/events:
- Check migration is applied and `agent_*` tables are present.
- Verify backend has DB connectivity.

4. `intent` returns low confidence (`422 AGENT_CONFIDENCE_TOO_LOW`):
- This is acceptable for smoke; the script falls back to `resume_optimize` for run creation.

## 6. One-command Step Gate (Optional)

`scripts/test-step.ps1` supports optional smoke flags:

```powershell
pwsh -File scripts/test-step.ps1 `
  -FrontendUrl "https://your-frontend.example.com" `
  -BackendUrl "https://your-backend.example.com" `
  -RunAgentApiSmoke `
  -RunAgentDbSmoke `
  -AgentSmokeUserId "<existing-users-id-uuid>"
```
