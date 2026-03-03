# API Contract（Sprint 0.5 草案）

- 版本：`v0-draft+impl-20260301-r1`
- 适用阶段：Sprint 0.5（最小可运行）
- 对齐文档：`docs/AI_JOB_SEARCH_AGENT_REFACTOR_PLAN_2026-03-02.md`
- 说明：本文件以“先冻结核心、后增量扩展”为原则；当前已覆盖 10 个正式接口 + 1 个开发态演示接口。

## 0. 通用约定

### 0.1 Header
- `Content-Type: application/json`
- `Authorization: Bearer <token>`
- `Idempotency-Key: <string>`（写接口建议；若未走 Header，可放入 body 的 `idempotency_key`）

### 0.2 通用错误结构
```json
{
  "error": {
    "code": "AGENT_INVALID_STATE_TRANSITION",
    "message": "run is already terminal",
    "retryable": false,
    "run_id": "7afbcfd7-75a6-4446-b456-fcc99f1b58ed",
    "trace_id": "trc_01JYXYZ"
  }
}
```

### 0.3 Sprint 0.5 错误码最小集
- `AGENT_RUN_NOT_FOUND`（404）
- `AGENT_INVALID_STATE_TRANSITION`（409）
- `AGENT_BUDGET_EXCEEDED`（429）
- `AGENT_CONFIDENCE_TOO_LOW`（422）
- `AGENT_IDEMPOTENCY_CONFLICT`（409）
- `AGENT_CONFIRMATION_REQUIRED`（409）
- `AGENT_CONFIRMATION_EXPIRED`（410）
- `AGENT_INVALID_REQUEST`（422）
- `AGENT_INTERNAL_ERROR`（500）

---

## 1) POST /api/agent/runs
创建一个新的 run（初始状态 `queued`）。

### 请求示例
```json
{
  "thread_id": "a8f1b7c1-9d39-4b73-9d7f-2b81d0c9a101",
  "intent": "resume_optimize",
  "analysis_mode": "targeted",
  "generation_strategy": "create_new",
  "jd_key": "jd_20260302_backend",
  "slots": {
    "target_role": "backend"
  },
  "idempotency_key": "create-run-20260302-001"
}
```

### 请求字段约束（新增）
- `analysis_mode`（可选）：`generic | targeted`
- `generation_strategy`（可选）：`reuse | create_new | overwrite`
- `jd_key`（可选）：非空字符串（推荐和前端 `makeJdKey` 规则保持一致）
- `slots`（可选）：JSON object；用于记录槽位与上下文透传
- 以上字段会写入 `run_created` 事件的 `event_payload`，用于链路追踪与 smoke 校验

### 成功响应示例（200）
```json
{
  "run_id": "7afbcfd7-75a6-4446-b456-fcc99f1b58ed",
  "state": "queued",
  "attempt_no": 1,
  "trace_id": "trc_01JYRUN001"
}
```

### 错误响应示例（409）
```json
{
  "error": {
    "code": "AGENT_IDEMPOTENCY_CONFLICT",
    "message": "idempotency key already used for another create payload",
    "retryable": false,
    "run_id": null,
    "trace_id": "trc_01JYRUN001"
  }
}
```

---

## 2) GET /api/agent/runs/{id}
查询 run 当前状态与最小执行信息。

### 请求示例
- 路径参数：`/api/agent/runs/7afbcfd7-75a6-4446-b456-fcc99f1b58ed`

### 成功响应示例（200）
```json
{
  "run_id": "7afbcfd7-75a6-4446-b456-fcc99f1b58ed",
  "state": "running",
  "attempt_no": 1,
  "error_code": null,
  "trace_id": "trc_01JYRUN001"
}
```

### 错误响应示例（404）
```json
{
  "error": {
    "code": "AGENT_RUN_NOT_FOUND",
    "message": "run not found or no permission",
    "retryable": false,
    "run_id": "7afbcfd7-75a6-4446-b456-fcc99f1b58ed",
    "trace_id": "trc_01JYRUN001"
  }
}
```

---

## 3) POST /api/agent/runs/{id}/retry
对 `failed/timed_out` 的 run 发起重试。

### 请求示例
```json
{
  "idempotency_key": "retry-run-7afbcfd7-v2",
  "reason": "manual_retry_after_timeout"
}
```

### 成功响应示例（200）
```json
{
  "run_id": "7afbcfd7-75a6-4446-b456-fcc99f1b58ed",
  "prev_state": "timed_out",
  "next_state": "queued",
  "attempt_no": 2,
  "trace_id": "trc_01JYRUN001"
}
```

### 错误响应示例（409）
```json
{
  "error": {
    "code": "AGENT_INVALID_STATE_TRANSITION",
    "message": "retry only allowed for failed or timed_out",
    "retryable": false,
    "run_id": "7afbcfd7-75a6-4446-b456-fcc99f1b58ed",
    "trace_id": "trc_01JYRUN001"
  }
}
```

---

## 4) POST /api/agent/runs/{id}/cancel
取消 run（终态二次取消返回幂等成功）。

### 请求示例
```json
{
  "idempotency_key": "cancel-run-7afbcfd7-001",
  "reason": "manual_cancel"
}
```

### 成功响应示例（200）
```json
{
  "run_id": "7afbcfd7-75a6-4446-b456-fcc99f1b58ed",
  "prev_state": "running",
  "next_state": "canceled",
  "idempotent": false,
  "trace_id": "trc_01JYRUN001"
}
```

### 幂等成功示例（终态再取消，200）
```json
{
  "run_id": "7afbcfd7-75a6-4446-b456-fcc99f1b58ed",
  "prev_state": "succeeded",
  "next_state": "succeeded",
  "idempotent": true,
  "trace_id": "trc_01JYRUN001"
}
```

---

## 5) GET /api/agent/runs/{id}/events
按 run 查询事件，支持 `limit` 与 `cursor`（keyset 分页）。

### 请求示例
- `/api/agent/runs/7afbcfd7-75a6-4446-b456-fcc99f1b58ed/events?limit=20`
- `/api/agent/runs/7afbcfd7-75a6-4446-b456-fcc99f1b58ed/events?limit=20&cursor=<next_cursor>`

### 成功响应示例（200）
```json
{
  "events": [
    {
      "event_id": "evt_01JY...",
      "event_type": "run_canceled",
      "run_id": "7afbcfd7-75a6-4446-b456-fcc99f1b58ed",
      "created_at": "2026-03-02T09:21:12Z",
      "trace_id": "trc_01JYRUN001",
      "source": "agent_runtime",
      "event_payload": {
        "prev_state": "running",
        "next_state": "canceled"
      }
    }
  ],
  "next_cursor": "eyJjcmVhdGVkX2F0Ijoi...\",\"event_id\":\"...\"}",
  "trace_id": "trc_01JYRUN001"
}
```

### 错误响应示例（422）
```json
{
  "error": {
    "code": "AGENT_INVALID_REQUEST",
    "message": "invalid cursor",
    "retryable": false,
    "run_id": "7afbcfd7-75a6-4446-b456-fcc99f1b58ed",
    "trace_id": "trc_01JYRUN001"
  }
}
```

---

## 6) POST /api/agent/intent
意图识别与槽位抽取（Sprint 0.5 允许规则+小模型混合实现）。

### 请求示例
```json
{
  "text": "帮我把简历改成偏后端岗位，重点突出项目性能优化",
  "thread_id": "a8f1b7c1-9d39-4b73-9d7f-2b81d0c9a101",
  "context": {
    "has_resume": true,
    "last_intent": "resume_diagnosis"
  }
}
```

### 成功响应示例（200）
```json
{
  "intent": "resume_optimize",
  "confidence": 0.93,
  "slots": {
    "target_role": "backend",
    "focus": "performance_optimization"
  },
  "route": "run_resume_diagnosis",
  "trace_id": "trc_01JYINT001"
}
```

### 错误响应示例（422）
```json
{
  "error": {
    "code": "AGENT_CONFIDENCE_TOO_LOW",
    "message": "intent confidence is below threshold",
    "retryable": false,
    "run_id": null,
    "trace_id": "trc_01JYINT001"
  }
}
```

---

## 7) POST /api/agent/execute
执行一个工具调用（最小版支持 `dry_run -> confirm` 门禁）。

### 请求示例
```json
{
  "run_id": "7afbcfd7-75a6-4446-b456-fcc99f1b58ed",
  "tool_name": "apply_suggestion",
  "dry_run": true,
  "input": {
    "suggestion_ids": ["sug_001"]
  },
  "idempotency_key": "tool-run-7afbcfd7-001"
}
```

### 成功响应示例（200）
```json
{
  "tool_run_id": "tool_01JY...",
  "status": "succeeded",
  "run_id": "7afbcfd7-75a6-4446-b456-fcc99f1b58ed",
  "requires_confirm": true,
  "confirm_token": "cfm_01JY...",
  "confirm_expires_at": "2026-03-03T09:00:00Z",
  "idempotent": false,
  "trace_id": "trc_01JYRUN001"
}
```

### 错误响应示例（409）
```json
{
  "error": {
    "code": "AGENT_IDEMPOTENCY_CONFLICT",
    "message": "idempotency key already used for another execute payload",
    "retryable": false,
    "run_id": "7afbcfd7-75a6-4446-b456-fcc99f1b58ed",
    "trace_id": "trc_01JYRUN001"
  }
}
```

---

## 8) POST /api/agent/runs/{id}/confirm
确认 dry_run 结果并恢复 run 执行。

### 请求示例
```json
{
  "tool_run_id": "tool_01JY...",
  "confirm_token": "cfm_01JY..."
}
```

### 成功响应示例（200）
```json
{
  "run_id": "7afbcfd7-75a6-4446-b456-fcc99f1b58ed",
  "tool_run_id": "tool_01JY...",
  "prev_state": "waiting_confirm",
  "next_state": "running",
  "committed": true,
  "idempotent": false,
  "trace_id": "trc_01JYRUN001"
}
```

### 错误响应示例（410）
```json
{
  "error": {
    "code": "AGENT_CONFIRMATION_EXPIRED",
    "message": "confirmation token expired",
    "retryable": false,
    "run_id": "7afbcfd7-75a6-4446-b456-fcc99f1b58ed",
    "trace_id": "trc_01JYRUN001"
  }
}
```

---

## 9) POST /api/agent/feedback
记录用户反馈事件，支持：
- run 级反馈（传 `run_id`）
- thread 级反馈（仅传 `thread_id`）
- 两者同时传入（会校验 `thread_id` 与 run 归属一致）

### 请求示例
```json
{
  "run_id": "7afbcfd7-75a6-4446-b456-fcc99f1b58ed",
  "thread_id": "a8f1b7c1-9d39-4b73-9d7f-2b81d0c9a101",
  "event_type": "accept",
  "payload": {
    "note": "这个建议很好"
  },
  "idempotency_key": "feedback-7afbcfd7-001"
}
```

### thread-only 请求示例
```json
{
  "thread_id": "a8f1b7c1-9d39-4b73-9d7f-2b81d0c9a101",
  "event_type": "ignore",
  "payload": {
    "note": "先忽略这条建议"
  },
  "idempotency_key": "feedback-thread-001"
}
```

### 成功响应示例（200）
```json
{
  "event_id": "evt_01JY...",
  "event_type": "user_feedback_accept",
  "run_id": "7afbcfd7-75a6-4446-b456-fcc99f1b58ed",
  "thread_id": "a8f1b7c1-9d39-4b73-9d7f-2b81d0c9a101",
  "replayed": false,
  "trace_id": "trc_01JYRUN001"
}
```

### 幂等重放示例（200）
```json
{
  "event_id": "evt_01JY...",
  "event_type": "user_feedback_accept",
  "run_id": "7afbcfd7-75a6-4446-b456-fcc99f1b58ed",
  "thread_id": "a8f1b7c1-9d39-4b73-9d7f-2b81d0c9a101",
  "replayed": true,
  "trace_id": "trc_01JYRUN001"
}
```

---

## 10) GET /api/agent/timeline
按 thread 查询事件时间线，支持 `limit` 与 `cursor`（keyset 分页）。

### 请求示例
- `/api/agent/timeline?thread_id=a8f1b7c1-9d39-4b73-9d7f-2b81d0c9a101&limit=20`
- `/api/agent/timeline?thread_id=a8f1b7c1-9d39-4b73-9d7f-2b81d0c9a101&limit=20&cursor=<next_cursor>`

### 成功响应示例（200）
```json
{
  "events": [
    {
      "event_id": "evt_01JY...",
      "event_type": "run_created",
      "run_id": "7afbcfd7-75a6-4446-b456-fcc99f1b58ed",
      "thread_id": "a8f1b7c1-9d39-4b73-9d7f-2b81d0c9a101",
      "created_at": "2026-03-02T09:00:00Z",
      "trace_id": "trc_01JYRUN001",
      "source": "agent_runtime",
      "event_payload": {
        "state": "queued",
        "attempt_no": 1
      }
    }
  ],
  "next_cursor": "eyJjcmVhdGVkX2F0Ijoi...\",\"event_id\":\"...\"}",
  "trace_id": "trc_01JYRUN001"
}
```

### 错误响应示例（422）
```json
{
  "error": {
    "code": "AGENT_INVALID_REQUEST",
    "message": "invalid cursor",
    "retryable": false,
    "trace_id": "trc_01JYRUN001"
  }
}
```

---

## 11) POST /api/agent/runs/{id}/simulate（Dev-only）
用于开发/演示环境的 mock worker 生命周期推进接口，单次请求将 run 从：
- `queued -> running -> succeeded`
- 或 `running -> succeeded`

> 仅当 `AGENT_MOCK_WORKER_ENABLED=1` 时可用；生产建议保持关闭。

### 请求示例
```json
{}
```

### 成功响应示例（200）
```json
{
  "run_id": "7afbcfd7-75a6-4446-b456-fcc99f1b58ed",
  "prev_state": "queued",
  "next_state": "succeeded",
  "attempt_no": 1,
  "idempotent": false,
  "trace_id": "trc_01JYRUN001"
}
```

### 错误响应示例（409）
```json
{
  "error": {
    "code": "AGENT_INVALID_STATE_TRANSITION",
    "message": "run state does not allow simulate completion",
    "retryable": false,
    "run_id": "7afbcfd7-75a6-4446-b456-fcc99f1b58ed",
    "trace_id": "trc_01JYRUN001"
  }
}
```

---

## 12. 状态语义（Sprint 0.5 最小版）

- `retry` 仅允许：`failed`、`timed_out` -> `queued`
- `cancel` 允许：`queued/running/waiting_confirm -> canceled`；终态二次取消返回幂等成功
- `GET /runs/{id}` 为状态真值来源；前端仅做乐观显示，需以后端状态回写
- `trace_id` 在所有成功/失败响应中必返（便于链路排查）

## 13. 可回滚默认说明

1. 契约先行，服务实现可渐进：
   - 默认返回最小字段集；新增字段不破坏现有字段语义。
2. Header 与 body 的幂等键并存：
   - 默认 body 字段有效；网关透传稳定后可切换 Header 单通道。
3. `intent` 低置信处理：
   - 默认返回 `AGENT_CONFIDENCE_TOO_LOW`，不触发写操作。

## 14. Step3 对齐字段（新增）

用于对齐“强引导 Step3（generic/targeted）+ 同 JD 复用/重生成”的最小字段集：

1. `analysis_mode`
   - `generic`：不强制 JD；按通用优化链路执行。
   - `targeted`：启用 JD 定向匹配和低匹配提醒。
2. `generation_strategy`
   - `reuse`：复用既有版本。
   - `create_new`：强制创建新版本（推荐“重新生成”按钮使用）。
   - `overwrite`：覆盖既有版本（仅对内部运营/特殊场景开放）。
3. `jd_key`
   - 推荐前端按 `makeJdKey` 生成，确保多 JD 分桶一致。
