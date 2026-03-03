# AI Mainflow Smoke Runbook（/api/ai/*）

- 文档版本：v0.3
- 对齐计划：`docs/AI_JOB_SEARCH_AGENT_REFACTOR_PLAN_2026-03-02.md`（v5.5）

## 0. 目标

定义主链路 8 条验收 smoke，并给出当前自动化覆盖边界：
1) generic
2) targeted
3) targeted 低匹配
4) targeted 多 JD 循环
5) targeted 同 JD 回访
6) 硬门禁验证（GuidedFlow）
7) 旧入口软门禁验证
8) analysis_mode 冲突回写验证

说明：
- 上述 8 条是“验收清单”，不等于“单脚本全自动覆盖”。
- 自动化与手工断言的映射见 `2.4 覆盖矩阵`。

## 1. 前置条件

- 可用前端地址与后端地址。
- 测试账号：`CAREER_HERO_TEST_EMAIL` / `CAREER_HERO_TEST_PASSWORD`。
- 测试库已执行：`database/migrations/2026-03-02-guided-flow-state.sql`。

## 2. 推荐执行顺序

### 2.1 API 闭环 smoke（后端在线）

```powershell
python scripts/ai_mainflow_api_smoke.py --backend-url <BACKEND>
```

通过标准：
- `/api/ai/organize-career-profile` 请求使用 `rawExperienceText` 并成功返回 `success + profile`。
- `/api/ai/transcribe` 验证路径可达（空载荷返回可控 400）。
- `/api/ai/analyze`（generic + targeted）都成功。
- `/api/ai/generate-resume`、`/api/ai/chat` 成功。

说明：
- `scripts/e2e_full_flow.py` 是本地 `Flask test_client` 回归脚本，不计入在线门禁 smoke。

### 2.2 GuidedFlow UI smoke（前端在线）

```powershell
pwsh -File scripts/test-online.ps1 `
  -FrontendUrl <FRONTEND> `
  -BackendUrl <BACKEND> `
  -RunGuidedFlowUiSmoke
```

说明：
- `-RunGuidedFlowUiSmoke` 未执行时，UI 门禁 smoke 不得计为 PASS。
- 如需补跑“旧 `jd_input` 会话恢复后应归一到 `interview_scene`”回归，可追加 `-RunLegacyJdInputMigrationUiSmoke`。
- 该脚本当前自动断言的是“入口可达 + 路由不被错误重定向”，不是完整 GuidedFlow 强门禁回归。

### 2.3 一键步骤门禁（本地 + 在线）

```powershell
pwsh -File scripts/test-step.ps1 `
  -FrontendUrl <FRONTEND> `
  -BackendUrl <BACKEND> `
  -RunAiMainflowApiSmoke `
  -RunGuidedFlowUiSmoke
```

### 2.4 覆盖矩阵（当前实现）

1. `generic`：自动化覆盖（`ai_mainflow_api_smoke.py`）。
2. `targeted`：自动化覆盖（`ai_mainflow_api_smoke.py`）。
3. `targeted 低匹配`：手工断言（当前无稳定阈值断言，避免 flaky）。
4. `targeted 多 JD 循环`：手工断言（需真实会话与版本落库检查）。
5. `targeted 同 JD 回访`：手工断言（需“复用/重生成”交互链路）。
6. `硬门禁验证`：手工断言（GuidedFlow 壳层落地后再补 UI e2e 自动断言）。
7. `旧入口软门禁验证`：自动化部分覆盖（`test-online.ps1 -RunGuidedFlowUiSmoke` 断言 `/ai-analysis` 入口不被错误重定向）。
8. `analysis_mode 冲突回写验证`：手工/集成断言（需构造冲突数据并核对回写结果）。

## 3. 关键断言

- generic：JD 为空可继续。
- hard gate：GuidedFlow 主流程中未完成画像不得进 Step3+；未选简历不得进 Step4+。
- soft gate：旧入口 `/ai-analysis` 仅提示不阻断。
- analysis_mode 回写：`resume_data.analysisMode` 与 `guided_flow_state.analysis_mode` 冲突时，以前者为准并完成回写。

## 4. 失败处理

- 优先记录失败命令、HTTP 状态码、关键响应体。
- 按模块回归：前端门禁、后端 `/api/ai/*`、数据写回分别定位。
