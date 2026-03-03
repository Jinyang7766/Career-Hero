from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass(frozen=True)
class IntentDecision:
    intent: str
    confidence: float
    slots: Dict[str, str]
    route: str


class RuleIntentRouter:
    """规则版意图路由（Sprint 1 最小实现）。"""

    _ROLE_PATTERNS = [
        (re.compile(r"(后端|backend)", re.IGNORECASE), "backend"),
        (re.compile(r"(前端|front\s*-?\s*end)", re.IGNORECASE), "frontend"),
        (re.compile(r"(全栈|full\s*-?\s*stack)", re.IGNORECASE), "fullstack"),
        (re.compile(r"(算法|algorithm)", re.IGNORECASE), "algorithm"),
        (re.compile(r"(数据|data)", re.IGNORECASE), "data"),
        (re.compile(r"(产品|product)", re.IGNORECASE), "product"),
        (re.compile(r"(运营|operations?)", re.IGNORECASE), "operations"),
        (re.compile(r"(测试|qa|quality)", re.IGNORECASE), "qa"),
    ]

    _RULES = [
        (
            "update_career_profile",
            "update_career_profile",
            0.94,
            [
                "职业画像",
                "更新画像",
                "完善画像",
                "career profile",
                "profile update",
                "工作经历整理",
            ],
        ),
        (
            "apply_suggestion",
            "apply_suggestion",
            0.92,
            [
                "应用建议",
                "一键应用",
                "按建议改",
                "套用建议",
                "apply suggestion",
                "apply recommendations",
            ],
        ),
        (
            "resume_optimize",
            "run_resume_diagnosis",
            0.93,
            [
                "优化简历",
                "简历优化",
                "简历诊断",
                "resume optimize",
                "resume diagnosis",
                "resume review",
                "改简历",
            ],
        ),
        (
            "mock_interview",
            "run_mock_interview",
            0.95,
            [
                "模拟面试",
                "面试练习",
                "mock interview",
                "interview practice",
                "面试题",
                "开始面试",
            ],
        ),
        (
            "job_match_advice",
            "search_knowledge",
            0.88,
            [
                "岗位匹配",
                "职位匹配",
                "投递建议",
                "match job",
                "job match",
                "岗位建议",
                "公司匹配",
            ],
        ),
    ]

    def route(self, *, text: str, context: Optional[dict] = None) -> IntentDecision:
        normalized = self._normalize_text(text)
        slots: Dict[str, str] = {}
        target_role = self._extract_target_role(normalized)
        if target_role:
            slots["target_role"] = target_role

        for intent, route, confidence, keywords in self._RULES:
            if self._contains_any(normalized, keywords):
                return IntentDecision(
                    intent=intent,
                    confidence=confidence,
                    slots=slots,
                    route=route,
                )

        return IntentDecision(
            intent="unknown",
            confidence=0.2,
            slots=slots,
            route="ask_clarification",
        )

    def _contains_any(self, text: str, keywords: List[str]) -> bool:
        for keyword in keywords:
            if keyword.lower() in text:
                return True
        return False

    def _normalize_text(self, text: str) -> str:
        return str(text or "").strip().lower()

    def _extract_target_role(self, normalized_text: str) -> Optional[str]:
        for pattern, role in self._ROLE_PATTERNS:
            if pattern.search(normalized_text):
                return role
        return None
