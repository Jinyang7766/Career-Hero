from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import secrets
from typing import Optional, Protocol
from uuid import UUID, uuid4

from .run_service import AgentRunService, EventRepository, RunSnapshot


class ToolRuntimeError(Exception):
    """Tool runtime 基础异常。"""


class ToolRunStateError(ToolRuntimeError):
    """run 状态不允许当前动作。"""


class ToolRunNotFoundError(ToolRuntimeError):
    """tool_run 不存在或无权限。"""


class ToolIdempotencyConflictError(ToolRuntimeError):
    """幂等键冲突。"""


class ToolConfirmTokenError(ToolRuntimeError):
    """确认 token 无效。"""


class ToolConfirmExpiredError(ToolRuntimeError):
    """确认 token 已过期。"""


class ToolConfirmNotRequiredError(ToolRuntimeError):
    """当前 tool_run 不需要确认。"""


@dataclass
class ToolRunSnapshot:
    id: UUID
    user_id: UUID
    run_id: UUID
    tool_name: str
    dry_run: bool
    status: str
    thread_id: Optional[UUID] = None
    retry_no: int = 0
    idempotency_key: Optional[str] = None
    trace_id: Optional[str] = None
    input_payload: Optional[dict] = None
    output_payload: Optional[dict] = None
    latency_ms: Optional[int] = None
    error_code: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


@dataclass(frozen=True)
class ToolExecuteResult:
    run: RunSnapshot
    tool_run: ToolRunSnapshot
    requires_confirm: bool
    confirm_token: Optional[str]
    confirm_expires_at: Optional[str]
    idempotent: bool


@dataclass(frozen=True)
class ToolConfirmResult:
    run: RunSnapshot
    tool_run: ToolRunSnapshot
    prev_state: str
    next_state: str
    committed: bool
    idempotent: bool


class ToolRunRepository(Protocol):
    def save(self, snapshot: ToolRunSnapshot) -> ToolRunSnapshot:
        ...

    def get(self, tool_run_id: UUID, user_id: UUID | str) -> Optional[ToolRunSnapshot]:
        ...

    def get_by_idempotency(
        self, *, user_id: UUID | str, tool_name: str, idempotency_key: str
    ) -> Optional[ToolRunSnapshot]:
        ...


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_dt(raw: str | None) -> Optional[datetime]:
    text = str(raw or "").strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


class AgentToolRuntimeService:
    def __init__(
        self,
        *,
        run_service: AgentRunService,
        repository: Optional[ToolRunRepository] = None,
        event_repository: Optional[EventRepository] = None,
        logger=None,
        confirm_ttl_seconds: int = 86400,
    ):
        self._run_service = run_service
        self._repository = repository
        self._event_repository = event_repository
        self._logger = logger
        self._confirm_ttl_seconds = int(confirm_ttl_seconds)

    def _emit_event(
        self,
        *,
        user_id: UUID,
        run: RunSnapshot,
        event_type: str,
        event_payload: Optional[dict] = None,
        event_idempotency_key: Optional[str] = None,
    ) -> None:
        if self._event_repository is None:
            return
        try:
            self._event_repository.save_event(
                user_id=user_id,
                run_id=run.id,
                thread_id=run.thread_id,
                event_type=event_type,
                trace_id=run.trace_id,
                event_payload=event_payload or {},
                source="tool_runtime",
                event_idempotency_key=event_idempotency_key,
            )
        except Exception as exc:
            if self._logger is not None:
                self._logger.warning("tool runtime event write failed: %s", exc)

    def _build_preview(self, *, tool_name: str, input_payload: dict) -> dict:
        changed_fields = sorted(str(k) for k in (input_payload or {}).keys())
        return {
            "tool_name": tool_name,
            "changed_fields": changed_fields,
            "summary": f"{tool_name} dry-run preview generated",
        }

    def _generate_confirm_token(self) -> str:
        return f"cfm_{secrets.token_urlsafe(12)}"

    def execute(
        self,
        *,
        run: RunSnapshot,
        user_id: UUID,
        tool_name: str,
        dry_run: bool = True,
        input_payload: Optional[dict] = None,
        idempotency_key: Optional[str] = None,
    ) -> ToolExecuteResult:
        tool_name_clean = str(tool_name or "").strip()
        if not tool_name_clean:
            raise ValueError("tool_name is required")

        payload = input_payload or {}
        if not isinstance(payload, dict):
            raise ValueError("input must be a JSON object")

        if (
            idempotency_key
            and self._repository is not None
            and hasattr(self._repository, "get_by_idempotency")
        ):
            existing = self._repository.get_by_idempotency(
                user_id=user_id,
                tool_name=tool_name_clean,
                idempotency_key=idempotency_key,
            )
            if existing is not None:
                existing_payload = existing.input_payload or {}
                if (
                    existing.run_id != run.id
                    or bool(existing.dry_run) != bool(dry_run)
                    or existing_payload != payload
                ):
                    raise ToolIdempotencyConflictError("idempotency key already used")
                output_payload = existing.output_payload or {}
                return ToolExecuteResult(
                    run=run,
                    tool_run=existing,
                    requires_confirm=bool(output_payload.get("requires_confirm")),
                    confirm_token=output_payload.get("confirm_token"),
                    confirm_expires_at=output_payload.get("confirm_expires_at"),
                    idempotent=True,
                )

        if run.state == "queued":
            run = self._run_service.start_run(run).run

        if run.state != "running":
            raise ToolRunStateError(f"invalid execute state: {run.state}")

        now = _utc_now()
        preview = self._build_preview(tool_name=tool_name_clean, input_payload=payload)
        confirm_token = None
        confirm_expires_at = None
        output_payload = {
            "preview": preview,
            "requires_confirm": bool(dry_run),
            "committed": not dry_run,
        }
        if dry_run:
            confirm_token = self._generate_confirm_token()
            confirm_deadline = now + timedelta(seconds=self._confirm_ttl_seconds)
            confirm_expires_at = confirm_deadline.isoformat()
            output_payload["confirm_token"] = confirm_token
            output_payload["confirm_expires_at"] = confirm_expires_at
        else:
            output_payload["committed_at"] = now.isoformat()

        tool_run = ToolRunSnapshot(
            id=uuid4(),
            user_id=user_id,
            run_id=run.id,
            thread_id=run.thread_id,
            tool_name=tool_name_clean,
            dry_run=bool(dry_run),
            status="succeeded",
            idempotency_key=idempotency_key,
            trace_id=run.trace_id,
            input_payload=payload,
            output_payload=output_payload,
            latency_ms=0,
            created_at=now,
            updated_at=now,
        )
        if self._repository is not None:
            tool_run = self._repository.save(tool_run)

        if dry_run:
            run = self._run_service.wait_for_confirmation(run).run

        self._emit_event(
            user_id=user_id,
            run=run,
            event_type="tool_run_succeeded",
            event_payload={
                "tool_run_id": str(tool_run.id),
                "tool_name": tool_run.tool_name,
                "dry_run": tool_run.dry_run,
                "requires_confirm": bool(dry_run),
            },
            event_idempotency_key=idempotency_key,
        )
        return ToolExecuteResult(
            run=run,
            tool_run=tool_run,
            requires_confirm=bool(dry_run),
            confirm_token=confirm_token,
            confirm_expires_at=confirm_expires_at,
            idempotent=False,
        )

    def confirm(
        self,
        *,
        run: RunSnapshot,
        user_id: UUID,
        tool_run_id: UUID,
        confirm_token: str,
    ) -> ToolConfirmResult:
        if self._repository is None:
            raise ToolRunNotFoundError("tool run repository is unavailable")

        tool_run = self._repository.get(tool_run_id=tool_run_id, user_id=user_id)
        if tool_run is None or tool_run.run_id != run.id:
            raise ToolRunNotFoundError("tool run not found")

        payload = tool_run.output_payload or {}
        if not bool(payload.get("requires_confirm")):
            raise ToolConfirmNotRequiredError("tool run does not require confirmation")

        expected_token = str(payload.get("confirm_token") or "").strip()
        provided_token = str(confirm_token or "").strip()
        if not expected_token or expected_token != provided_token:
            raise ToolConfirmTokenError("confirm token is invalid")

        expires_at = _parse_dt(payload.get("confirm_expires_at"))
        if expires_at is not None and _utc_now() > expires_at:
            raise ToolConfirmExpiredError("confirm token expired")

        if bool(payload.get("committed")):
            return ToolConfirmResult(
                run=run,
                tool_run=tool_run,
                prev_state=run.state,
                next_state=run.state,
                committed=True,
                idempotent=True,
            )

        if run.state != "waiting_confirm":
            raise ToolRunStateError(f"invalid confirm state: {run.state}")

        state_result = self._run_service.start_run(run)
        run = state_result.run

        committed_payload = dict(payload)
        committed_payload["committed"] = True
        committed_payload["committed_at"] = _utc_now().isoformat()
        tool_run.output_payload = committed_payload
        tool_run.updated_at = _utc_now()
        tool_run = self._repository.save(tool_run)

        self._emit_event(
            user_id=user_id,
            run=run,
            event_type="tool_run_confirmed",
            event_payload={
                "tool_run_id": str(tool_run.id),
                "tool_name": tool_run.tool_name,
            },
        )

        return ToolConfirmResult(
            run=run,
            tool_run=tool_run,
            prev_state=state_result.prev_state,
            next_state=state_result.next_state,
            committed=True,
            idempotent=False,
        )
