from __future__ import annotations

import uuid
from datetime import datetime, timezone


TRACE_PREFIX = "trc"


def generate_trace_id() -> str:
    """生成可读 trace_id。

    示例：trc_20260302T101530Z_9f2a1c3d4e5f
    """
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    suffix = uuid.uuid4().hex[:12]
    return f"{TRACE_PREFIX}_{ts}_{suffix}"
