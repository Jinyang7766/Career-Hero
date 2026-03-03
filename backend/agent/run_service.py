from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional, Protocol
from uuid import UUID, uuid4

from .state_machine import can_transition, is_terminal_state
from .trace_id import generate_trace_id


@dataclass(frozen=True)
class RunCreateCommand:
    user_id: UUID
    intent: str
    thread_id: Optional[UUID] = None
    goal_id: Optional[UUID] = None
    idempotency_key: Optional[str] = None
    slots: Optional[dict] = None
    analysis_mode: Optional[str] = None
    generation_strategy: Optional[str] = None
    jd_key: Optional[str] = None


@dataclass
class RunSnapshot:
    id: UUID
    user_id: UUID
    state: str
    attempt_no: int
    intent: str
    trace_id: str
    created_at: datetime
    updated_at: datetime
    thread_id: Optional[UUID] = None
    goal_id: Optional[UUID] = None
    idempotency_key: Optional[str] = None


@dataclass(frozen=True)
class RunCancelResult:
    run: RunSnapshot
    prev_state: str
    next_state: str
    idempotent: bool


@dataclass(frozen=True)
class RunTransitionResult:
    run: RunSnapshot
    prev_state: str
    next_state: str


class RunRepository(Protocol):
    """Agent run 仓储接口。"""

    def save(self, snapshot: RunSnapshot) -> RunSnapshot:
        ...

    def get(self, run_id: UUID, user_id: UUID | str) -> Optional[RunSnapshot]:
        ...

    def get_by_request_idempotency(
        self, user_id: UUID | str, request_idempotency_key: str
    ) -> Optional[RunSnapshot]:
        ...


class EventRepository(Protocol):
    """Agent 事件仓储接口。"""

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
        ...

    def get_by_idempotency(
        self, *, user_id: UUID | str, event_idempotency_key: str
    ) -> Optional[dict]:
        ...

    def list_by_run(
        self,
        *,
        user_id: UUID | str,
        run_id: UUID | str,
        limit: int = 50,
        cursor: Optional[str] = None,
    ) -> tuple[list[dict], Optional[str]]:
        ...

    def list_by_thread(
        self,
        *,
        user_id: UUID | str,
        thread_id: UUID | str,
        limit: int = 50,
        cursor: Optional[str] = None,
    ) -> tuple[list[dict], Optional[str]]:
        ...


class AgentRunService:
    """Sprint 0.5 run service 占位实现（不接入现有业务链路）。"""

    def __init__(
        self,
        repository: Optional[RunRepository] = None,
        event_repository: Optional[EventRepository] = None,
        logger=None,
    ):
        self._repository = repository
        self._event_repository = event_repository
        self._logger = logger

    def _emit_event(
        self,
        *,
        user_id: UUID,
        run_id: Optional[UUID],
        thread_id: Optional[UUID],
        event_type: str,
        trace_id: str,
        event_payload: Optional[dict] = None,
        event_idempotency_key: Optional[str] = None,
    ) -> None:
        if self._event_repository is None:
            return
        try:
            self._event_repository.save_event(
                user_id=user_id,
                run_id=run_id,
                thread_id=thread_id,
                event_type=event_type,
                trace_id=trace_id,
                event_payload=event_payload or {},
                event_idempotency_key=event_idempotency_key,
            )
        except Exception as exc:
            if self._logger is not None:
                self._logger.warning("agent event write failed: %s", exc)

    def create_run(self, command: RunCreateCommand) -> RunSnapshot:
        if (
            self._repository
            and command.idempotency_key
            and hasattr(self._repository, "get_by_request_idempotency")
        ):
            existing = self._repository.get_by_request_idempotency(
                user_id=command.user_id,
                request_idempotency_key=command.idempotency_key,
            )
            if existing is not None:
                return existing

        now = datetime.now(timezone.utc)
        snapshot = RunSnapshot(
            id=uuid4(),
            user_id=command.user_id,
            state="queued",
            attempt_no=1,
            intent=command.intent,
            trace_id=generate_trace_id(),
            created_at=now,
            updated_at=now,
            thread_id=command.thread_id,
            goal_id=command.goal_id,
            idempotency_key=command.idempotency_key,
        )
        if self._repository:
            snapshot = self._repository.save(snapshot)

        self._emit_event(
            user_id=snapshot.user_id,
            run_id=snapshot.id,
            thread_id=snapshot.thread_id,
            event_type="run_created",
            trace_id=snapshot.trace_id,
            event_payload={
                "intent": command.intent,
                "thread_id": str(command.thread_id) if command.thread_id else None,
                "goal_id": str(command.goal_id) if command.goal_id else None,
                "state": snapshot.state,
                "attempt_no": snapshot.attempt_no,
                "idempotency_key": snapshot.idempotency_key,
                **(
                    {"analysis_mode": command.analysis_mode}
                    if command.analysis_mode
                    else {}
                ),
                **(
                    {"generation_strategy": command.generation_strategy}
                    if command.generation_strategy
                    else {}
                ),
                **({"jd_key": command.jd_key} if command.jd_key else {}),
                **({"slots": dict(command.slots)} if command.slots else {}),
            },
        )
        return snapshot

    def get_run_by_request_idempotency(
        self, user_id: UUID | str, request_idempotency_key: str
    ) -> Optional[RunSnapshot]:
        if not self._repository:
            return None
        if not hasattr(self._repository, "get_by_request_idempotency"):
            return None
        return self._repository.get_by_request_idempotency(
            user_id=user_id,
            request_idempotency_key=request_idempotency_key,
        )

    def retry_run(self, run: RunSnapshot, *, request_idempotency_key: Optional[str] = None) -> RunSnapshot:
        prev_state = run.state
        if not can_transition(run.state, "queued"):
            raise ValueError(f"invalid retry transition: {run.state} -> queued")

        run.state = "queued"
        run.attempt_no += 1
        run.updated_at = datetime.now(timezone.utc)

        if self._repository:
            run = self._repository.save(run)

        self._emit_event(
            user_id=run.user_id,
            run_id=run.id,
            thread_id=run.thread_id,
            event_type="run_retried",
            trace_id=run.trace_id,
            event_payload={
                "prev_state": prev_state,
                "next_state": run.state,
                "attempt_no": run.attempt_no,
            },
            event_idempotency_key=request_idempotency_key,
        )
        return run

    def start_run(
        self, run: RunSnapshot, *, request_idempotency_key: Optional[str] = None
    ) -> RunTransitionResult:
        prev_state = run.state
        if not can_transition(prev_state, "running"):
            raise ValueError(f"invalid start transition: {prev_state} -> running")

        run.state = "running"
        run.updated_at = datetime.now(timezone.utc)
        if self._repository:
            run = self._repository.save(run)

        self._emit_event(
            user_id=run.user_id,
            run_id=run.id,
            thread_id=run.thread_id,
            event_type="run_started",
            trace_id=run.trace_id,
            event_payload={
                "prev_state": prev_state,
                "next_state": run.state,
                "attempt_no": run.attempt_no,
            },
            event_idempotency_key=request_idempotency_key,
        )
        return RunTransitionResult(
            run=run,
            prev_state=prev_state,
            next_state=run.state,
        )

    def wait_for_confirmation(
        self, run: RunSnapshot, *, request_idempotency_key: Optional[str] = None
    ) -> RunTransitionResult:
        prev_state = run.state
        if not can_transition(prev_state, "waiting_confirm"):
            raise ValueError(f"invalid waiting_confirm transition: {prev_state} -> waiting_confirm")

        run.state = "waiting_confirm"
        run.updated_at = datetime.now(timezone.utc)
        if self._repository:
            run = self._repository.save(run)

        self._emit_event(
            user_id=run.user_id,
            run_id=run.id,
            thread_id=run.thread_id,
            event_type="run_waiting_confirm",
            trace_id=run.trace_id,
            event_payload={
                "prev_state": prev_state,
                "next_state": run.state,
                "attempt_no": run.attempt_no,
            },
            event_idempotency_key=request_idempotency_key,
        )
        return RunTransitionResult(
            run=run,
            prev_state=prev_state,
            next_state=run.state,
        )

    def succeed_run(
        self, run: RunSnapshot, *, request_idempotency_key: Optional[str] = None
    ) -> RunTransitionResult:
        prev_state = run.state
        if not can_transition(prev_state, "succeeded"):
            raise ValueError(f"invalid succeed transition: {prev_state} -> succeeded")

        run.state = "succeeded"
        run.updated_at = datetime.now(timezone.utc)
        if self._repository:
            run = self._repository.save(run)

        self._emit_event(
            user_id=run.user_id,
            run_id=run.id,
            thread_id=run.thread_id,
            event_type="run_succeeded",
            trace_id=run.trace_id,
            event_payload={
                "prev_state": prev_state,
                "next_state": run.state,
                "attempt_no": run.attempt_no,
            },
            event_idempotency_key=request_idempotency_key,
        )
        return RunTransitionResult(
            run=run,
            prev_state=prev_state,
            next_state=run.state,
        )

    def cancel_run(
        self,
        run: RunSnapshot,
        *,
        reason: Optional[str] = None,
        request_idempotency_key: Optional[str] = None,
    ) -> RunCancelResult:
        prev_state = run.state
        if is_terminal_state(prev_state):
            self._emit_event(
                user_id=run.user_id,
                run_id=run.id,
                thread_id=run.thread_id,
                event_type="run_canceled",
                trace_id=run.trace_id,
                event_payload={
                    "prev_state": prev_state,
                    "next_state": prev_state,
                    "reason": reason or "",
                    "idempotent": True,
                },
                event_idempotency_key=request_idempotency_key,
            )
            return RunCancelResult(
                run=run,
                prev_state=prev_state,
                next_state=prev_state,
                idempotent=True,
            )

        if not can_transition(prev_state, "canceled"):
            raise ValueError(f"invalid cancel transition: {prev_state} -> canceled")

        run.state = "canceled"
        run.updated_at = datetime.now(timezone.utc)
        if self._repository:
            run = self._repository.save(run)

        self._emit_event(
            user_id=run.user_id,
            run_id=run.id,
            thread_id=run.thread_id,
            event_type="run_canceled",
            trace_id=run.trace_id,
            event_payload={
                "prev_state": prev_state,
                "next_state": run.state,
                "reason": reason or "",
                "idempotent": False,
            },
            event_idempotency_key=request_idempotency_key,
        )
        return RunCancelResult(
            run=run,
            prev_state=prev_state,
            next_state=run.state,
            idempotent=False,
        )

    def get_run(self, run_id: UUID, user_id: UUID | str) -> Optional[RunSnapshot]:
        if not self._repository:
            return None
        return self._repository.get(run_id=run_id, user_id=user_id)
