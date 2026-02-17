import re
import time
import threading
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Deque, Dict, Iterable, Optional, Tuple


def _parse_csv(value: str) -> Tuple[str, ...]:
    if not value:
        return tuple()
    return tuple(item.strip() for item in str(value).split(",") if item.strip())


@dataclass(frozen=True)
class AntiBotConfig:
    enabled: bool
    mode: str
    global_max_requests: int
    global_window_seconds: int
    auth_max_requests: int
    auth_window_seconds: int
    heavy_max_requests: int
    heavy_window_seconds: int
    block_known_bot_ua: bool
    allowed_ua_keywords: Tuple[str, ...]
    bypass_paths: Tuple[str, ...]


class AntiBotGuard:
    """
    Lightweight in-memory anti-bot guard:
    - Per fingerprint (IP + UA) rate limits
    - Optional known-bot UA blocking
    """

    _KNOWN_BOT_PATTERN = re.compile(
        r"(bot|spider|crawler|scrapy|curl|wget|python-requests|httpclient|aiohttp)",
        re.IGNORECASE,
    )

    def __init__(self, config: AntiBotConfig, logger=None):
        self.config = config
        self.logger = logger
        self._lock = threading.Lock()
        self._buckets: Dict[str, Deque[float]] = defaultdict(deque)

    def should_check(self, path: str, method: str) -> bool:
        if not self.config.enabled:
            return False
        if str(self.config.mode).lower() == "off":
            return False
        if str(method).upper() == "OPTIONS":
            return False
        p = str(path or "")
        if not p.startswith("/api/"):
            return False
        for item in self.config.bypass_paths:
            if p.startswith(item):
                return False
        return True

    def _build_client_fingerprint(self, headers, remote_addr: str) -> str:
        ua = str(headers.get("User-Agent") or "").strip().lower()
        ip = str(remote_addr or "").strip() or "unknown-ip"
        return f"{ip}|{ua[:180]}"

    def _is_known_bot_ua(self, headers) -> bool:
        ua = str(headers.get("User-Agent") or "").strip().lower()
        if not ua:
            return True
        for kw in self.config.allowed_ua_keywords:
            if kw.lower() in ua:
                return False
        return bool(self._KNOWN_BOT_PATTERN.search(ua))

    def _consume(
        self, *, bucket_key: str, max_requests: int, window_seconds: int, now_ts: float
    ) -> Tuple[bool, int]:
        q = self._buckets[bucket_key]
        expire_before = now_ts - float(window_seconds)
        while q and q[0] <= expire_before:
            q.popleft()
        if len(q) >= max_requests:
            retry_after = max(1, int(q[0] + window_seconds - now_ts))
            return False, retry_after
        q.append(now_ts)
        return True, 0

    def check(
        self,
        *,
        path: str,
        method: str,
        headers,
        remote_addr: str,
    ) -> Tuple[bool, Optional[dict], int, Dict[str, str]]:
        """
        Returns:
        - allowed
        - body (only when rejected)
        - status_code
        - extra_headers
        """
        if not self.should_check(path, method):
            return True, None, 200, {}

        if self.config.block_known_bot_ua and self._is_known_bot_ua(headers):
            msg = "访问被安全策略拦截（疑似机器人请求）。"
            if self.logger:
                self.logger.warning("anti-bot blocked by UA: path=%s ip=%s", path, remote_addr)
            if self.config.mode == "log":
                return True, None, 200, {}
            return False, {"error": msg, "code": "ANTI_BOT_UA_BLOCKED"}, 403, {}

        fingerprint = self._build_client_fingerprint(headers, remote_addr)
        now_ts = time.time()

        rules = [
            ("global", self.config.global_max_requests, self.config.global_window_seconds),
        ]
        if str(path).startswith("/api/auth/"):
            rules.append(("auth", self.config.auth_max_requests, self.config.auth_window_seconds))
        if str(path).startswith("/api/ai/") or str(path).startswith("/api/parse-pdf") or str(path).startswith("/api/export-pdf"):
            rules.append(("heavy", self.config.heavy_max_requests, self.config.heavy_window_seconds))

        with self._lock:
            for group_name, max_requests, window_seconds in rules:
                allowed, retry_after = self._consume(
                    bucket_key=f"{group_name}:{fingerprint}",
                    max_requests=max_requests,
                    window_seconds=window_seconds,
                    now_ts=now_ts,
                )
                if allowed:
                    continue
                msg = "请求过于频繁，请稍后重试。"
                if self.logger:
                    self.logger.warning(
                        "anti-bot rate limited: group=%s path=%s ip=%s retry=%ss",
                        group_name,
                        path,
                        remote_addr,
                        retry_after,
                    )
                if self.config.mode == "log":
                    return True, None, 200, {}
                return (
                    False,
                    {"error": msg, "code": "ANTI_BOT_RATE_LIMITED"},
                    429,
                    {"Retry-After": str(retry_after)},
                )

        return True, None, 200, {}


def build_antibot_config_from_env(getenv) -> AntiBotConfig:
    enabled = str(getenv("ANTI_BOT_ENABLED", "1")).strip().lower() in ("1", "true", "yes", "on")
    mode = str(getenv("ANTI_BOT_MODE", "enforce")).strip().lower() or "enforce"
    if mode not in ("off", "log", "enforce"):
        mode = "enforce"

    def _to_int(name: str, default: int) -> int:
        try:
            return max(1, int(getenv(name, str(default))))
        except Exception:
            return default

    block_known_bot_ua = str(getenv("ANTI_BOT_BLOCK_KNOWN_UA", "1")).strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    allowed_ua_keywords = _parse_csv(getenv("ANTI_BOT_ALLOWED_UA_KEYWORDS", "mozilla,chrome,safari,firefox,edg"))
    bypass_paths = _parse_csv(getenv("ANTI_BOT_BYPASS_PATHS", "/api/internal/sweep-expired-deletions"))

    return AntiBotConfig(
        enabled=enabled,
        mode=mode,
        global_max_requests=_to_int("ANTI_BOT_GLOBAL_MAX_REQUESTS", 120),
        global_window_seconds=_to_int("ANTI_BOT_GLOBAL_WINDOW_SECONDS", 60),
        auth_max_requests=_to_int("ANTI_BOT_AUTH_MAX_REQUESTS", 25),
        auth_window_seconds=_to_int("ANTI_BOT_AUTH_WINDOW_SECONDS", 60),
        heavy_max_requests=_to_int("ANTI_BOT_HEAVY_MAX_REQUESTS", 20),
        heavy_window_seconds=_to_int("ANTI_BOT_HEAVY_WINDOW_SECONDS", 60),
        block_known_bot_ua=block_known_bot_ua,
        allowed_ua_keywords=allowed_ua_keywords,
        bypass_paths=bypass_paths,
    )
