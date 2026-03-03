from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional

BudgetAction = Literal["allow", "warn", "reject", "fallback"]


@dataclass(frozen=True)
class BudgetLimits:
    max_input_tokens: int = 6000
    max_output_tokens: int = 3000
    max_total_cost_usd: float = 0.8


@dataclass(frozen=True)
class BudgetUsage:
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0


@dataclass(frozen=True)
class BudgetDecision:
    action: BudgetAction
    reason: str
    exceeded_field: Optional[str] = None


class BudgetGuard:
    """Sprint 0.5 预算护栏占位实现。

    默认策略：
    - warn_only=True 时超限仅告警，不阻断。
    - warn_only=False 时超限返回 reject。
    """

    def __init__(self, limits: Optional[BudgetLimits] = None, warn_only: bool = True):
        self._limits = limits or BudgetLimits()
        self._warn_only = warn_only

    def evaluate(self, usage: BudgetUsage) -> BudgetDecision:
        if usage.input_tokens > self._limits.max_input_tokens:
            return self._over_limit("input_tokens")
        if usage.output_tokens > self._limits.max_output_tokens:
            return self._over_limit("output_tokens")
        if usage.cost_usd > self._limits.max_total_cost_usd:
            return self._over_limit("cost_usd")
        return BudgetDecision(action="allow", reason="within_budget")

    def _over_limit(self, field: str) -> BudgetDecision:
        if self._warn_only:
            return BudgetDecision(action="warn", reason="budget_exceeded_warn_only", exceeded_field=field)
        return BudgetDecision(action="reject", reason="budget_exceeded", exceeded_field=field)
