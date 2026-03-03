from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional
from uuid import UUID

from .tool_runtime import ToolRunRepository, ToolRunSnapshot


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


def _row_to_snapshot(row: Dict[str, Any]) -> ToolRunSnapshot:
    return ToolRunSnapshot(
        id=UUID(str(row["id"])),
        user_id=UUID(str(row["user_id"])),
        run_id=UUID(str(row["run_id"])),
        thread_id=UUID(str(row["thread_id"])) if row.get("thread_id") else None,
        tool_name=str(row.get("tool_name") or ""),
        dry_run=bool(row.get("dry_run")),
        status=str(row.get("status") or "queued"),
        retry_no=int(row.get("retry_no") or 0),
        idempotency_key=row.get("idempotency_key"),
        trace_id=row.get("trace_id"),
        input_payload=row.get("input_payload") or {},
        output_payload=row.get("output_payload") or {},
        latency_ms=row.get("latency_ms"),
        error_code=row.get("error_code"),
        created_at=_parse_dt(row.get("created_at")),
        updated_at=_parse_dt(row.get("updated_at")),
    )


class InMemoryToolRunRepository(ToolRunRepository):
    def __init__(self):
        self._rows_by_id: Dict[str, ToolRunSnapshot] = {}
        self._idem_to_tool_run_id: Dict[tuple[str, str, str], str] = {}

    def save(self, snapshot: ToolRunSnapshot) -> ToolRunSnapshot:
        row_id = str(snapshot.id)
        user_id = str(snapshot.user_id)
        tool_name = str(snapshot.tool_name)

        if snapshot.idempotency_key:
            idem_key = (user_id, tool_name, snapshot.idempotency_key)
            existing_row_id = self._idem_to_tool_run_id.get(idem_key)
            if existing_row_id and existing_row_id in self._rows_by_id:
                return self._rows_by_id[existing_row_id]
            self._idem_to_tool_run_id[idem_key] = row_id

        self._rows_by_id[row_id] = snapshot
        return snapshot

    def get(self, tool_run_id: UUID, user_id: UUID | str) -> Optional[ToolRunSnapshot]:
        got = self._rows_by_id.get(str(tool_run_id))
        if got is None:
            return None
        if str(got.user_id) != str(user_id):
            return None
        return got

    def get_by_idempotency(
        self, *, user_id: UUID | str, tool_name: str, idempotency_key: str
    ) -> Optional[ToolRunSnapshot]:
        row_id = self._idem_to_tool_run_id.get((str(user_id), str(tool_name), idempotency_key))
        if not row_id:
            return None
        return self._rows_by_id.get(row_id)


class SupabaseToolRunRepository(ToolRunRepository):
    def __init__(self, *, supabase_client, logger=None):
        self._supabase = supabase_client
        self._logger = logger

    def save(self, snapshot: ToolRunSnapshot) -> ToolRunSnapshot:
        row = {
            "id": str(snapshot.id),
            "user_id": str(snapshot.user_id),
            "run_id": str(snapshot.run_id),
            "thread_id": str(snapshot.thread_id) if snapshot.thread_id else None,
            "tool_name": snapshot.tool_name,
            "dry_run": snapshot.dry_run,
            "status": snapshot.status,
            "retry_no": snapshot.retry_no,
            "idempotency_key": snapshot.idempotency_key,
            "trace_id": snapshot.trace_id,
            "input_payload": snapshot.input_payload or {},
            "output_payload": snapshot.output_payload or {},
            "latency_ms": snapshot.latency_ms,
            "error_code": snapshot.error_code,
            "created_at": (snapshot.created_at or datetime.now(timezone.utc)).isoformat(),
            "updated_at": (snapshot.updated_at or datetime.now(timezone.utc)).isoformat(),
        }

        try:
            result = self._supabase.table("agent_tool_runs").upsert(row, on_conflict="id").execute()
            rows = result.data or []
            if rows:
                return _row_to_snapshot(rows[0])
        except Exception as exc:
            if snapshot.idempotency_key:
                existing = self.get_by_idempotency(
                    user_id=snapshot.user_id,
                    tool_name=snapshot.tool_name,
                    idempotency_key=snapshot.idempotency_key,
                )
                if existing is not None:
                    return existing
            if self._logger is not None:
                self._logger.warning("agent_tool_runs save failed: %s", exc)
            raise

        got = self.get(snapshot.id, snapshot.user_id)
        return got if got is not None else snapshot

    def get(self, tool_run_id: UUID, user_id: UUID | str) -> Optional[ToolRunSnapshot]:
        result = (
            self._supabase.table("agent_tool_runs")
            .select("*")
            .eq("id", str(tool_run_id))
            .eq("user_id", str(user_id))
            .limit(1)
            .execute()
        )
        rows = result.data or []
        if not rows:
            return None
        return _row_to_snapshot(rows[0])

    def get_by_idempotency(
        self, *, user_id: UUID | str, tool_name: str, idempotency_key: str
    ) -> Optional[ToolRunSnapshot]:
        result = (
            self._supabase.table("agent_tool_runs")
            .select("*")
            .eq("user_id", str(user_id))
            .eq("tool_name", str(tool_name))
            .eq("idempotency_key", idempotency_key)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        if not rows:
            return None
        return _row_to_snapshot(rows[0])


def create_tool_run_repository(*, storage_context, logger=None) -> ToolRunRepository:
    if storage_context is None:
        return InMemoryToolRunRepository()
    if storage_context.is_mock_mode():
        return InMemoryToolRunRepository()
    if storage_context.supabase is None:
        if logger is not None:
            logger.warning("storage_context.supabase is None, fallback to in-memory agent tool run repository")
        return InMemoryToolRunRepository()
    return SupabaseToolRunRepository(supabase_client=storage_context.supabase, logger=logger)
