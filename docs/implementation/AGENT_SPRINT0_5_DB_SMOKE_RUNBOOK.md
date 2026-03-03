# Agent Sprint 0.5 DB Smoke Runbook

This runbook validates the minimum database contract for Sprint 0.5:

- `agent_runs`
- `agent_events`
- `agent_tool_runs`
- `agent_token_usage`

It does not replace full integration tests. It is a fast preflight check before enabling Agent API flags.

## 1. Preconditions

1. Migration applied:
- `database/migrations/2026-03-02-agent-sprint0_5.sql`

2. Environment variables:
- `SUPABASE_URL`
- One of:
  - `SUPABASE_SERVICE_ROLE_KEY` (recommended)
  - `SUPABASE_KEY`
  - `SUPABASE_ANON_KEY`
- `AGENT_SMOKE_USER_ID` (or pass `--user-id`)

3. `AGENT_SMOKE_USER_ID` must reference an existing row in `users.id`.

## 2. Command

From repo root:

```powershell
python scripts/agent_db_smoke.py --user-id "<existing-users-id-uuid>"
```

Or with env var:

```powershell
$env:AGENT_SMOKE_USER_ID="<existing-users-id-uuid>"
python scripts/agent_db_smoke.py
```

Keep test data for manual inspection:

```powershell
python scripts/agent_db_smoke.py --user-id "<existing-users-id-uuid>" --keep-data
```

## 3. What It Verifies

1. Insert/select/update on `agent_runs`.
2. Insert on `agent_events`.
3. Duplicate `event_idempotency_key` conflict on `agent_events` unique index.
4. Insert on `agent_tool_runs`.
5. Insert on `agent_token_usage`.
6. Query events by `run_id`.
7. Cleanup via delete on `agent_runs` (cascade check for dependent rows).

## 4. Success Criteria

Expected final output includes:

- `[smoke] agent_runs insert: ok`
- `[smoke] agent_events idempotency unique index: ok`
- `[smoke] agent_tool_runs insert: ok`
- `[smoke] agent_token_usage insert: ok`
- `[smoke] success`

## 5. Failure Triage

1. Foreign key errors on `user_id`:
- Ensure `--user-id` exists in `users.id`.

2. Table/column not found:
- Re-check migration was applied in the target environment.

3. Permission denied:
- Use service role key for smoke run.

4. Duplicate key not failing for `event_idempotency_key`:
- Verify unique index exists:
  - `uq_agent_events_idempotency`

## 6. Suggested CI/Release Gate

Before enabling `AGENT_API_ENABLED=1` in any environment:

1. Apply migration.
2. Run smoke script.
3. Ensure output includes `[smoke] success`.
