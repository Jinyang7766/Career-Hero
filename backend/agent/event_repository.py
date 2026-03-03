from __future__ import annotations

import base64
import json
from datetime import datetime, timezone
from typing import Dict, List, Optional
from uuid import UUID, uuid4

from .run_service import EventRepository


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _event_sort_key(event: dict) -> tuple[str, str]:
    return (str(event.get("created_at") or ""), str(event.get("id") or ""))


def _encode_cursor(*, created_at: str, event_id: str) -> str:
    payload = {"created_at": created_at, "event_id": event_id}
    raw = json.dumps(payload, ensure_ascii=True, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii")


def _decode_cursor(cursor: str) -> tuple[str, str]:
    text = str(cursor or "").strip()
    if not text:
        raise ValueError("invalid cursor")
    try:
        padded = text + "=" * (-len(text) % 4)
        decoded = base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8")
        obj = json.loads(decoded)
    except Exception as exc:
        raise ValueError("invalid cursor") from exc
    created_at = str(obj.get("created_at") or "").strip()
    event_id = str(obj.get("event_id") or "").strip()
    if not created_at or not event_id:
        raise ValueError("invalid cursor")
    return created_at, event_id


class InMemoryEventRepository(EventRepository):
    """用于 mock/dev 的最小内存事件仓储。"""

    def __init__(self):
        self.events: List[Dict] = []

    def save_event(
        self,
        *,
        user_id: UUID,
        run_id: Optional[UUID] = None,
        thread_id: Optional[UUID] = None,
        event_type: str,
        trace_id: str,
        event_payload: Optional[dict] = None,
        source: str = "agent_runtime",
        event_idempotency_key: Optional[str] = None,
    ) -> dict:
        if run_id is None and thread_id is None:
            raise ValueError("run_id or thread_id is required")

        if event_idempotency_key:
            existing = self.get_by_idempotency(
                user_id=user_id, event_idempotency_key=event_idempotency_key
            )
            if existing is not None:
                return existing

        record = {
            "id": str(uuid4()),
            "user_id": str(user_id),
            "run_id": str(run_id) if run_id is not None else None,
            "thread_id": str(thread_id) if thread_id is not None else None,
            "event_type": event_type,
            "event_payload": event_payload or {},
            "source": source,
            "trace_id": trace_id,
            "event_idempotency_key": event_idempotency_key,
            "created_at": _utc_now_iso(),
        }
        self.events.append(record)
        return record

    def get_by_idempotency(
        self, *, user_id: UUID | str, event_idempotency_key: str
    ) -> Optional[dict]:
        for event in reversed(self.events):
            if (
                event.get("user_id") == str(user_id)
                and event.get("event_idempotency_key") == event_idempotency_key
            ):
                return event
        return None

    def list_by_run(
        self,
        *,
        user_id: UUID | str,
        run_id: UUID | str,
        limit: int = 50,
        cursor: Optional[str] = None,
    ) -> tuple[list[dict], Optional[str]]:
        rows = [
            event
            for event in self.events
            if event.get("user_id") == str(user_id) and event.get("run_id") == str(run_id)
        ]
        rows.sort(key=_event_sort_key, reverse=True)

        if cursor:
            cursor_created_at, cursor_event_id = _decode_cursor(cursor)
            rows = [
                row
                for row in rows
                if _event_sort_key(row) < (cursor_created_at, cursor_event_id)
            ]

        page_size = max(1, limit)
        has_more = len(rows) > page_size
        page = rows[:page_size]
        next_cursor = None
        if has_more and page:
            last = page[-1]
            next_cursor = _encode_cursor(
                created_at=str(last.get("created_at") or ""),
                event_id=str(last.get("id") or ""),
            )
        return page, next_cursor

    def list_by_thread(
        self,
        *,
        user_id: UUID | str,
        thread_id: UUID | str,
        limit: int = 50,
        cursor: Optional[str] = None,
    ) -> tuple[list[dict], Optional[str]]:
        rows = [
            event
            for event in self.events
            if event.get("user_id") == str(user_id)
            and event.get("thread_id") == str(thread_id)
        ]
        rows.sort(key=_event_sort_key, reverse=True)

        if cursor:
            cursor_created_at, cursor_event_id = _decode_cursor(cursor)
            rows = [
                row
                for row in rows
                if _event_sort_key(row) < (cursor_created_at, cursor_event_id)
            ]

        page_size = max(1, limit)
        has_more = len(rows) > page_size
        page = rows[:page_size]
        next_cursor = None
        if has_more and page:
            last = page[-1]
            next_cursor = _encode_cursor(
                created_at=str(last.get("created_at") or ""),
                event_id=str(last.get("id") or ""),
            )
        return page, next_cursor


class SupabaseEventRepository(EventRepository):
    """Supabase 上的 agent_events 仓储。"""

    def __init__(self, *, supabase_client):
        self._supabase = supabase_client

    def save_event(
        self,
        *,
        user_id: UUID,
        run_id: Optional[UUID] = None,
        thread_id: Optional[UUID] = None,
        event_type: str,
        trace_id: str,
        event_payload: Optional[dict] = None,
        source: str = "agent_runtime",
        event_idempotency_key: Optional[str] = None,
    ) -> dict:
        if run_id is None and thread_id is None:
            raise ValueError("run_id or thread_id is required")

        if event_idempotency_key:
            existing = self.get_by_idempotency(
                user_id=user_id, event_idempotency_key=event_idempotency_key
            )
            if existing is not None:
                return existing

        payload = {
            "user_id": str(user_id),
            "run_id": str(run_id) if run_id is not None else None,
            "thread_id": str(thread_id) if thread_id is not None else None,
            "event_type": event_type,
            "event_payload": event_payload or {},
            "source": source,
            "trace_id": trace_id,
            "event_idempotency_key": event_idempotency_key,
        }

        try:
            result = self._supabase.table("agent_events").insert(payload).execute()
            rows = result.data or []
            if rows:
                return rows[0]
        except Exception:
            if event_idempotency_key:
                existing = self.get_by_idempotency(
                    user_id=user_id, event_idempotency_key=event_idempotency_key
                )
                if existing is not None:
                    return existing
            raise

        return payload

    def get_by_idempotency(
        self, *, user_id: UUID | str, event_idempotency_key: str
    ) -> Optional[dict]:
        result = (
            self._supabase.table("agent_events")
            .select("*")
            .eq("user_id", str(user_id))
            .eq("event_idempotency_key", event_idempotency_key)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return rows[0] if rows else None

    def _query_events_by_anchor(
        self,
        *,
        user_id: UUID | str,
        anchor_field: str,
        anchor_value: UUID | str,
        limit: int,
        created_at_lt: Optional[str] = None,
        created_at_eq: Optional[str] = None,
        id_lt: Optional[str] = None,
    ) -> list[dict]:
        query = (
            self._supabase.table("agent_events")
            .select("*")
            .eq("user_id", str(user_id))
            .eq(anchor_field, str(anchor_value))
        )
        if created_at_lt is not None:
            query = query.lt("created_at", created_at_lt)
        if created_at_eq is not None:
            query = query.eq("created_at", created_at_eq)
        if id_lt is not None:
            query = query.lt("id", id_lt)
        result = query.order("created_at", desc=True).order("id", desc=True).limit(limit).execute()
        return result.data or []

    def _list_by_anchor(
        self,
        *,
        user_id: UUID | str,
        anchor_field: str,
        anchor_value: UUID | str,
        limit: int = 50,
        cursor: Optional[str] = None,
    ) -> tuple[list[dict], Optional[str]]:
        page_size = max(1, limit)
        fetch_size = page_size + 1

        if not cursor:
            rows = self._query_events_by_anchor(
                user_id=user_id,
                anchor_field=anchor_field,
                anchor_value=anchor_value,
                limit=fetch_size,
            )
        else:
            cursor_created_at, cursor_event_id = _decode_cursor(cursor)
            older_rows = self._query_events_by_anchor(
                user_id=user_id,
                anchor_field=anchor_field,
                anchor_value=anchor_value,
                limit=fetch_size,
                created_at_lt=cursor_created_at,
            )
            tie_rows = self._query_events_by_anchor(
                user_id=user_id,
                anchor_field=anchor_field,
                anchor_value=anchor_value,
                limit=fetch_size,
                created_at_eq=cursor_created_at,
                id_lt=cursor_event_id,
            )
            merged: Dict[str, dict] = {}
            for row in older_rows + tie_rows:
                merged[str(row.get("id") or uuid4())] = row
            rows = list(merged.values())
            rows.sort(key=_event_sort_key, reverse=True)

        has_more = len(rows) > page_size
        page = rows[:page_size]
        next_cursor = None
        if has_more and page:
            last = page[-1]
            next_cursor = _encode_cursor(
                created_at=str(last.get("created_at") or ""),
                event_id=str(last.get("id") or ""),
            )
        return page, next_cursor

    def list_by_run(
        self,
        *,
        user_id: UUID | str,
        run_id: UUID | str,
        limit: int = 50,
        cursor: Optional[str] = None,
    ) -> tuple[list[dict], Optional[str]]:
        return self._list_by_anchor(
            user_id=user_id,
            anchor_field="run_id",
            anchor_value=run_id,
            limit=limit,
            cursor=cursor,
        )

    def list_by_thread(
        self,
        *,
        user_id: UUID | str,
        thread_id: UUID | str,
        limit: int = 50,
        cursor: Optional[str] = None,
    ) -> tuple[list[dict], Optional[str]]:
        return self._list_by_anchor(
            user_id=user_id,
            anchor_field="thread_id",
            anchor_value=thread_id,
            limit=limit,
            cursor=cursor,
        )


def create_event_repository(*, storage_context):
    if storage_context is None:
        return InMemoryEventRepository()
    if storage_context.is_mock_mode():
        return InMemoryEventRepository()
    if storage_context.supabase is None:
        return InMemoryEventRepository()
    return SupabaseEventRepository(supabase_client=storage_context.supabase)
