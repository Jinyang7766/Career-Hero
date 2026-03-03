# GuidedFlow 技术规格（Sprint A-D）

- 文档版本：v0.2
- 对齐计划：docs/AI_JOB_SEARCH_AGENT_REFACTOR_PLAN_2026-03-02.md (v5.5)
- 范围：前端 GuidedFlow 编排层（不替换现有 /api/ai/* 业务能力）

## 1. 目标与非目标

目标：
- 提供 Step1-6 强引导编排、门禁、进度可视化。
- 保持旧入口 /ai-analysis 兼容（软提示，不强制阻断）。
- 保持最小侵入：复用 CareerProfile / AiAnalysis / Editor 既有页面。

非目标：
- 不在本期引入“超级聊天入口”取代步骤流。
- 不在本期引入自动抓 JD / 自动投递。

## 2. 编排模型

GuidedFlowStep:
- step1_profile_input
- step2_profile_confirm
- step3_mode_and_resume
- step4_report
- step5_refine
- step6_interview

AiAnalysisStep 映射：
- resume_select, jd_input -> Step3
- analyzing, final_report -> Step4
- chat -> Step4 (isInterviewMode=false) / Step6 (isInterviewMode=true)
- comparison -> Step5
- interview_report_loading, interview_report -> Step6

## 3. 门禁策略

硬门禁（仅主流程）：
- 进入 Step3 前：要求画像完成。
- 进入 Step4-6 前：要求画像完成 + 已选择简历。

软门禁（旧入口兼容）：
- 直接访问 /ai-analysis：画像未完成时仅提示，不阻断进入。

禁阻断规则：
- generic 模式不得因 JD 为空被阻断。

## 4. 数据读写

users.guided_flow_state（用户级恢复态）：
- 字段建议：step, resume_id, jd_key, analysis_mode, updated_at, source
- updated_at 由数据库触发器维护（服务端时间）。

resume_data.analysisMode（简历级真值）：
- analysis_mode 真值以 resume_data.analysisMode 为准。
- guided_flow_state.analysis_mode 仅作恢复 hint。
- 冲突时读取 resume_data.analysisMode 并回写 guided_flow_state。

无 JD 归一：
- 统一以 makeJdKey('__no_jd__') 作为 generic 无 JD key。
- 读取时兼容历史 jd_default。

## 5. 命令链接线

- scripts/test-online.ps1：增加 `-RunAiMainflowApiSmoke` 与 GuidedFlow UI smoke 执行入口。
- scripts/test-step.ps1：增加 `-RunAiMainflowApiSmoke`、`-RunGuidedFlowUiSmoke` 参数并串联执行。

## 6. 验收

最低验收条件：
- Step3/Step4+ 门禁按计划生效。
- 旧入口兼容软提示生效且无进度条跳转。
- analysis_mode 冲突回写可复现且可验证。
- UI smoke 可通过 test-step 命令触发并出结果。
- 自动化覆盖边界与手工断言项遵循 `AI_MAINFLOW_SMOKE_RUNBOOK` 覆盖矩阵。
