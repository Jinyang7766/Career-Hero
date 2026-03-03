# AI Mainflow API Contract（/api/ai/*）

- 文档版本：v0.3
- 对齐计划：`docs/AI_JOB_SEARCH_AGENT_REFACTOR_PLAN_2026-03-02.md`（v5.5）
- 范围：仅覆盖主链路 `/api/ai/*`；不覆盖治理层 `/api/agent/*`。

## 0. 通用约定

请求头：
- `Content-Type: application/json`
- `Authorization: Bearer <token>`

业务约束：
- 严禁虚构事实；主链路输出必须以用户画像/简历事实为边界。
- `generic` 模式允许 `jobDescription` 为空，不得被 JD 空值阻断。

## 1) POST /api/ai/organize-career-profile

用途：
- 将用户语音/文字经历整理为结构化职业画像（Step1-2）。

最小请求：
```json
{
  "rawExperienceText": "我有3年后端经验，做过支付与风控系统",
  "existingProfile": {
    "summary": "已有画像摘要"
  }
}
```

成功响应（200）：
```json
{
  "success": true,
  "profile": {
    "id": "career_profile_1740880800000",
    "summary": "...",
    "experiences": []
  },
  "analysis_model": "gemini-2.5-flash",
  "note": "可选提示"
}
```

错误示例（400）：
```json
{
  "error": "请先填写职业经历信息"
}
```

说明：
- `rawExperienceText` 为真实入参字段（不是 `rawInput`）。
- 返回字段是 `profile`（不是 `careerProfile`）。

## 2) POST /api/ai/transcribe

用途：
- 语音转文字（Step1 语音输入链路）。

JSON 请求示例：
```json
{
  "audio": {
    "mime_type": "audio/webm",
    "data": "<base64-or-data-uri>"
  },
  "lang": "zh-CN"
}
```

成功响应示例（200）：
```json
{
  "success": true,
  "text": "我做过支付系统重构",
  "provider": "gemini:gemini-2.5-flash-lite"
}
```

验证错误示例（400）：
```json
{
  "success": false,
  "text": "",
  "error": "缺少音频数据"
}
```

说明：
- 支持 `multipart/form-data`（`file`）快速上传路径。
- 当转写模型不可用时，可能返回 `200 + success=false`（业务可降级处理）。

## 3) POST /api/ai/analyze

用途：
- 生成评分、缺口与建议（Step4）。

最小请求：
```json
{
  "resumeData": {"personalInfo": {}},
  "jobDescription": "",
  "targetCompany": "",
  "careerProfile": {}
}
```

最小响应（200）：
```json
{
  "score": 78,
  "summary": "...",
  "suggestions": [],
  "analysis_model": "gemini-2.5-flash",
  "resumeData": {}
}
```

说明：
- `jobDescription=""` 走 `generic` 分析链路，不阻断。

## 4) POST /api/ai/generate-resume

用途：
- 基于建议与上下文生成优化版简历（Step5）。

最小请求：
```json
{
  "resumeData": {},
  "chatHistory": [],
  "score": 78,
  "suggestions": [],
  "careerProfile": {}
}
```

最小响应（200）：
```json
{
  "resumeData": {}
}
```

## 5) POST /api/ai/chat

用途：
- 报告解释、简历改写、面试对话（Step4/5/6）。

最小请求：
```json
{
  "message": "请解释我的主要短板",
  "mode": "analysis",
  "resumeData": {},
  "jobDescription": "",
  "chatHistory": []
}
```

最小响应（200）：
```json
{
  "response": "..."
}
```

## 6) POST /api/ai/chat/stream

用途：
- 面试/对话流式输出（SSE）。

说明：
- 请求字段与 `/api/ai/chat` 基本一致。
- 正常返回：`Content-Type: text/event-stream`，事件类型含 `start/chunk/done/error`。
- 早期校验失败时，保留 JSON 返回（非 SSE），便于前端降级处理。

## 7. 边界与验收

- `/api/ai/*` 是 GuidedFlow 主链路验收接口。
- `/api/agent/*` 是治理层接口，不能替代主链路业务验收。
