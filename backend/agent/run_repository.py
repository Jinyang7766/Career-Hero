from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional
from uuid import UUID

from .run_service import RunRepository, RunSnapshot


def _parse_dt(raw: Any) -> datetime:
    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.replace(tzinfo=timezone.utc)
    text = str(raw or "").strip()
    if not text:
        return datetime.now(timezone.utc)
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def _row_to_snapshot(row: Dict[str, Any]) -> RunSnapshot:
    return RunSnapshot(
        id=UUID(str(row["id"])),
        user_id=UUID(str(row["user_id"])),
        state=str(row.get("state") or "queued"),
        attempt_no=int(row.get("attempt_no") or 1),
        intent=str(row.get("intent") or ""),
        trace_id=str(row.get("trace_id") or ""),
        created_at=_parse_dt(row.get("created_at")),
        updated_at=_parse_dt(row.get("updated_at")),
        thread_id=UUID(str(row["thread_id"])) if row.get("thread_id") else None,
        goal_id=UUID(str(row["goal_id"])) if row.get("goal_id") else None,
        idempotency_key=row.get("request_idempotency_key"),
    )


class InMemoryRunRepository(RunRepository):
    """用于 mock/dev 的最小内存仓储。"""

    def __init__(self):
        self._runs_by_id: Dict[str, RunSnapshot] = {}
        self._idempotency_to_run_id: Dict[tuple[str, str], str] = {}

    def save(self, snapshot: RunSnapshot) -> RunSnapshot:
        run_id = str(snapshot.id)
        user_id = str(snapshot.user_id)

        if snapshot.idempotency_key:
            idem_key = (user_id, snapshot.idempotency_key)
            existed_run_id = self._idempotency_to_run_id.get(idem_key)
            if existed_run_id and existed_run_id in self._runs_by_id:
                return self._runs_by_id[existed_run_id]
            self._idempotency_to_run_id[idem_key] = run_id

        self._runs_by_id[run_id] = snapshot
        return snapshot

    def get(self, run_id: UUID, user_id: UUID | str) -> Optional[RunSnapshot]:
        run = self._runs_by_id.get(str(run_id))
        if run is None:
            return None
        if str(run.user_id) != str(user_id):
            return None
        return run

    def get_by_request_idempotency(
        self, user_id: UUID | str, request_idempotency_key: str
    ) -> Optional[RunSnapshot]:
        run_id = self._idempotency_to_run_id.get((str(user_id), request_idempotency_key))
        if not run_id:
            return None
        return self._runs_by_id.get(run_id)


class SupabaseRunRepository(RunRepository):
    """Supabase 上的 agent_runs 仓储。"""

    def __init__(self, *, supabase_client, logger=None):
        self._supabase = supabase_client
        self._logger = logger

    def save(self, snapshot: RunSnapshot) -> RunSnapshot:
        row = {
            "id": str(snapshot.id),
            "user_id": str(snapshot.user_id),
            "thread_id": str(snapshot.thread_id) if snapshot.thread_id else None,
            "goal_id": str(snapshot.goal_id) if snapshot.goal_id else None,
            "state": snapshot.state,
            "attempt_no": snapshot.attempt_no,
            "request_idempotency_key": snapshot.idempotency_key,
            "trace_id": snapshot.trace_id,
            "created_at": snapshot.created_at.isoformat(),
            "updated_at": snapshot.updated_at.isoformat(),
        }

        try:
            result = self._supabase.table("agent_runs").upsert(row, on_conflict="id").execute()
            rows = result.data or []
            if rows:
                return _row_to_snapshot(rows[0])
        except Exception as exc:
            if snapshot.idempotency_key:
                existing = self.get_by_request_idempotency(snapshot.user_id, snapshot.idempotency_key)
                if existing is not None:
                    return existing
            if self._logger is not None:
                self._logger.warning("agent_runs save failed: %s", exc)
            raise

        # 某些 supabase 客户端配置下 insert 不回传 rows，这里做一次兜底查询。
        got = self.get(snapshot.id, snapshot.user_id)
        return got if got is not None else snapshot

    def get(self, run_id: UUID, user_id: UUID | str) -> Optional[RunSnapshot]:
        result = (
            self._supabase.table("agent_runs")
            .select("*")
            .eq("id", str(run_id))
            .eq("user_id", str(user_id))
            .limit(1)
            .execute()
        )
        rows = result.data or []
        if not rows:
            return None
        return _row_to_snapshot(rows[0])

    def get_by_request_idempotency(
        self, user_id: UUID | str, request_idempotency_key: str
    ) -> Optional[RunSnapshot]:
        result = (
            self._supabase.table("agent_runs")
            .select("*")
            .eq("user_id", str(user_id))
            .eq("request_idempotency_key", request_idempotency_key)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        if not rows:
            return None
        return _row_to_snapshot(rows[0])


def create_run_repository(*, storage_context, logger=None) -> RunRepository:
    if storage_context is None:
        return InMemoryRunRepository()
    if storage_context.is_mock_mode():
        return InMemoryRunRepository()
    if storage_context.supabase is None:
        if logger is not None:
            logger.warning("storage_context.supabase is None, fallback to in-memory agent run repository")
        return InMemoryRunRepository()
    return SupabaseRunRepository(supabase_client=storage_context.supabase, logger=logger)
