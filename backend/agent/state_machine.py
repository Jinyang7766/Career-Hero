from __future__ import annotations

from typing import Dict, Final, Set

AGENT_RUN_STATES: Final[Set[str]] = {
    "queued",
    "running",
    "waiting_confirm",
    "succeeded",
    "failed",
    "canceled",
    "timed_out",
    "expired",
}

TERMINAL_STATES: Final[Set[str]] = {
    "succeeded",
    "failed",
    "canceled",
    "timed_out",
    "expired",
}

# Sprint 0.5 状态转移最小闭环；后续可在不破坏接口的前提下扩展。
STATE_TRANSITIONS: Final[Dict[str, Set[str]]] = {
    "queued": {"running", "timed_out", "canceled"},
    "running": {"waiting_confirm", "succeeded", "failed", "timed_out", "canceled"},
    "waiting_confirm": {"running", "succeeded", "expired", "canceled"},
    "failed": {"queued"},
    "timed_out": {"queued"},
    "succeeded": set(),
    "canceled": set(),
    "expired": set(),
}


def is_valid_state(state: str) -> bool:
    return state in AGENT_RUN_STATES


def can_transition(from_state: str, to_state: str) -> bool:
    if from_state not in STATE_TRANSITIONS:
        return False
    return to_state in STATE_TRANSITIONS[from_state]


def is_terminal_state(state: str) -> bool:
    return state in TERMINAL_STATES
