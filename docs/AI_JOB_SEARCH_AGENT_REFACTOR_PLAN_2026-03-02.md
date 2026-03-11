# Career Hero 重构执行计划（全链路扫描重编版）

- 版本：`v6.28`
- 更新时间：`2026-03-11`
- 目标启动日：`2026-03-02`
- 适用范围：`Career Hero Web（React + TypeScript + Flask + Supabase）`
- 制定方式：`基于现有代码真实链路扫描，做最小侵入重编排，不做推翻式重写`

## 0. 产品方向先定调

本次重构不走“一个超级对话框控制全部模块”。

目标是：

1. **强引导主流程**：用户清楚知道下一步是什么。
2. **对话是工具，不是导航系统**：只在需要解释/改写/面试的阶段出现。
3. **事实先于文案**：所有简历改写都以职业画像事实库为边界。

一句话结论：**主线靠步骤驱动，对话只在关键节点辅助。**

## 0.1 本轮确认后的逻辑边界（2026-03-02）

1. 主流程改为“上传前置、画像优先、诊断后入库”：
   - `Step1 (/career-profile/upload)` 固定为三段：`融合输入页（上传/跳过 + 用户输入） -> 当前页 AI 解析后内嵌追问补充 -> 画像总结页（/career-profile/result/summary）`。
2. 若用户上传简历：
   - AI 需基于解析结果发起定向补齐（经历细节、成果证据、MBTI/性格、工作方式、职业目标）。
3. 画像编辑改为可选分支，不再是 Step1 提交流程的必经阶段：
   - Step1 提交后直接到：`/career-profile/result/summary`（展示最终画像，不再跳转预览页）。
   - 编辑页仅从总结页主动进入：`/career-profile/result/edit`（复用编辑器框架，补齐 MBTI/性格/目标薪资/求职方向等画像字段）。
4. AI 诊断入口默认直达 `Step3 (/ai-analysis/jd)`，不再先做简历选择。
5. `Step3` 只保留“目标岗位 + 分析模式”输入：
   - `generic`：目标岗位必填，JD 不必填。
   - `targeted`：目标岗位必填，JD 必填。
6. 面试链路与 JD 输入页已拆分：
   - 先选简历（`resume_select`），再进入面试场景页（`interview_scene`）。
7. 内部状态语义已更新：面试模式用 `interview_scene`，`jd_input` 仅保留诊断语义；旧会话 `jd_input` 仍兼容恢复。
8. 新建简历策略调整：上传简历不直接入简历库，只有诊断/优化产物入库。
9. 入口调整：
   - `AllResumes` 顶部“新建简历”按钮已移除。
   - 后续补充新简历入口已收口到画像总结页的“AI 引导深度完善”入口（上传能力内置于融合页），不再放在编辑页。
9. 强引导为主、对话为辅保持不变：业务对话主要出现在 Step4-6。
10. 面试场景页收口：
   - 场景类型将 `HR面` 统一改为 `压力面`。
   - 删除“面试模式（simple/comprehensive）”选择，面试改为单一标准流程。
11. 后端出题口径收口：
   - 提示词与回退题库统一采用真实场景规则，不再按 `interview_mode` 分叉题量/难度。
   - `压力面` 重点考察高压追问、冲突处理、临场应变与复盘能力，避免泛化 HR 话术。
12. Dashboard 入口收口：
   - 不新增独立“最近进展”入口卡片，仅保留“强引导”作为主入口。
   - UI 可参考现有“最近进展”卡片视觉样式，但语义与交互统一归入强引导。
13. 强引导不再展示浮层进度条：
   - 取消顶部进度条模块，改为“强引导入口卡片 + 步骤状态自动恢复”的无进度条方案。
   - 步骤状态仅作为系统内部状态与门禁依据，不提供显式进度条点击跳转。
14. 上传入库策略第一轮已落地（数据层）：
   - 非诊断产物简历创建时不再写入 `resumes`，仅保留本地草稿态。
   - 简历库列表仅展示“诊断/优化产物”。
15. 职业画像页顶部“步骤说明卡片”已移除：
   - `Step1-4` 页面不再展示“强引导 Step X”卡片，仅保留轻量说明文本与业务操作区。
16. Dashboard 文案与按钮已去步骤编号化：
   - “进入第4步”已替换为“继续”；首页不再出现“第X步”文案。
17. 新用户首页卡片收口：
   - 对“无画像且无简历”的新注册用户，Dashboard 隐藏“职业画像入口卡片”，只保留主流程入口卡片。
18. 面试入口门禁补强：
   - 面试模式下“未选择诊断产物简历”时，强制停留在 `resume_select`，并提示“请先诊断”；不允许直接进入 `interview_scene`。
19. Step1 追问可见性补强：
   - 点击 `AI解析` 后，即使用户清空输入框，追问建议仍保持显示；仅“提交”按钮按二选一门禁禁用。
20. 画像数据策略收口（2026-03-09 决策）：
   - 主数据源固定为 `draftProfile` 单一映射（编辑/保存/展示都以主字段为准）。
   - `factItems/atomicTags` 降级为派生数据，不再作为后续产品能力主线，不新增“事实治理 UI（合并/拆分/可视化）”开发。
   - 派生数据默认不得反向覆盖主字段（仅保留最小兼容与必要防污染兜底）。
21. 字段唯一归属规则（新增）：
   - 同一语义值必须有唯一主字段归属，禁止在多个字段重复存储（如 `targetRole/jobDirection`、`mbti/personality`、`gender/personalInfo.gender`）。
   - 保存阶段执行冲突清洗与去重，展示阶段只读取主字段，兼容字段仅作回迁来源不作展示真值。
22. 画像总结编辑权限规则（新增）：
   - 总结区默认只读；当内容包含由其他结构字段拼接/推断出来的信息时，禁止在总结区直接编辑。
   - 用户需跳转到对应源字段编辑（如 MBTI/目标岗位/约束），保存后自动回流到总结展示。

## 1. 现状扫描结果（As-Is）

### 1.1 前端入口与路由

已扫描：

1. `ai-resume-builder/App.tsx`
2. `ai-resume-builder/src/app-routing.ts`
3. `ai-resume-builder/components/screens/*`

现状：

1. 应用已经有完整页面体系（Dashboard、CareerProfile、AiAnalysis、Editor 等）。
2. `AiAnalysis` 已按诊断/面试分流：
   - 诊断：`jd_input -> analyzing -> final_report -> comparison`（非面试模式下 `chat` 渲染报告语义）。
   - 面试：`resume_select -> interview_scene -> chat -> interview_report_loading -> interview_report`（兼容旧值 `jd_input`）。
3. 诊断入口已收敛到 `/ai-analysis/jd`，面试入口仍为 `/ai-interview`。
4. 当前处于“强引导主线 + 兼容旧入口并行”阶段。

### 1.2 职业画像链路（已可用）

已扫描：

1. `CareerProfile.tsx`
2. `useCareerProfileComposer.ts`
3. `/api/ai/organize-career-profile`
4. `/api/ai/transcribe`

现状：

1. 支持文字和语音输入职业经历。
2. AI 整理后可入库到 `users.career_profile_latest/history`。
3. 存在最小可信约束（未知留空、不虚构）。

### 1.3 简历导入与编辑链路（已可用）

已扫描：

1. `Editor.tsx`
2. `components/editor/hooks/useEditorImportFlow.ts`
3. `/api/ai/parse-resume`、`/api/parse-pdf`
4. `src/database-service.ts`

现状：

1. 支持文本导入与 PDF 导入解析。
2. 已有 Wizard 编辑体验与自动保存。
3. 简历及分析快照沉淀在 `resumes.resume_data`。

### 1.4 诊断/报告/面试链路（已可用）

已扫描：

1. `AiAnalysis.tsx`
2. `ai-analysis/step-renderer.tsx`
3. `JdInputPage.tsx`、`FinalResumeReportPage.tsx`、`PostInterviewReportPage.tsx`
4. `/api/ai/analyze`、`/api/ai/chat`、`/api/ai/chat/stream`、`/api/ai/generate-resume`

现状：

1. JD 为空时可继续（已有确认逻辑），因此“通用模式”能力事实上存在。
2. 有评分、建议、报告、优化版本保存、面试与面试总结闭环。
3. 已有“可编辑画布（Canvas-like）”基础，支持用户手改与 AI 辅助改写。

### 1.5 Agent 基础设施（已落骨架，默认不抢主流程）

已扫描：

1. `backend/agent/*`
2. `backend/routes/agent_routes.py`
3. `backend/app_monolith.py` 中 `AGENT_API_ENABLED` 挂载逻辑

现状：

1. Agent run/event/tool/idempotency/confirm 基础能力已具备。
2. 默认开关关闭（`AGENT_API_ENABLED=0`）时不影响现网流程。
3. 适合后续做“高风险写操作确认链 + 可观测回放”，不应当前期替代主流程。

## 2. 重构后的目标流程（To-Be）

## 2.1 六步强引导主线

1. `Step 1` 上传与画像融合主流程（可跳过上传）
   - 固定三段：融合输入页（上传/跳过 + 用户输入） -> 当前页 AI 解析后内嵌追问补充 -> 画像总结页。
2. `Step 2` 可选画像结构化编辑（仅在总结页按需进入）
3. `Step 3` 诊断输入与分析模式：`generic`（通用） / `targeted`（定向 JD）
4. `Step 4` 评分与缺口报告解释
5. `Step 5` 简历精修（选区改写 + 手工编辑并存）
6. `Step 6` 模拟面试与复盘（先选诊断产物简历，再设置面试场景）

## 2.2 对话出现边界（最终版）

1. `Step 1-2`：**不放业务聊天框**。
2. `Step 1`：允许“定向追问”，但形态是**内嵌追问卡片/追问提示**，不是独立聊天窗口。
3. `Step 3`：可无 JD（`generic`），不强制填写 JD。
4. `Step 4-5`：开放报告解释与简历改写对话。
5. `Step 6`：开放面试对话。
6. 职业规划咨询：独立入口，不推动主流程状态。

说明：
“关键信息缺失时 AI 定向追问”发生在 **Step 1 融合页**，本质是采集补全，不是自由聊天。

## 3. 关键设计决策（解决你前面提到的争议点）

1. 不做“全阶段对话驱动”。
2. 不用传统长表单做画像，保留“用户说/写，AI 整理入库”。
3. 上传简历前置但可跳过；上传后由 AI 引导补齐画像，不允许“只上传不画像”直接进入诊断。
4. Step3 支持双模式，且 `generic` 永不被 JD 阻断。
5. 低匹配度在 `targeted` 下给“风险提示 + 补强建议 + 可转 generic”，不误导直接投递。
6. 上传简历不直接入简历库；只有诊断/优化后产物入库。
7. 未来“自动筛 JD + 自动制简历 + 用户确认后投递”是终态，但当前阶段不做平台抓取/自动投递。
8. 首页入口仅保留强引导，不并列“最近进展”独立入口；若需保留视觉一致性，仅复用最近进展卡片样式。

## 3.1 多 JD 循环机制（新增）

1. `Step1-2`（画像与基础事实库）默认只需完成一次，后续带新 JD 回来时可直接从 `Step3` 重入。
2. 每个 JD 视为一条独立优化链路，核心是“一个画像，多个 JD，多个定向简历版本”。
3. 同一 JD 二次进入时，提供两种动作：
   - `复用上次结果`（直接打开已有报告/简历版本）
   - `基于最新画像重新生成`（重新分析并产出新版本）
4. 数据分桶规则优先复用现有字段：
   - `analysisSessionByJd`：按 JD 维度保存分析/面试会话
   - `optimizationJdKey`：标记简历版本对应的 JD
   - `optimizedFromId`：标记定向版本来源于哪份基础简历
5. `generic` 与 `targeted` 并存：`generic` 产出通用版本，`targeted` 可针对多个 JD 反复迭代并并行保留。

## 3.2 强引导门禁等级（新增）

1. `硬门禁（Hard Gate）`：仅用于 GuidedFlow 主流程内“结果失真风险高”的场景，按步骤分层：
   - 进入 `Step1` 时允许“上传 / 跳过上传”二选一，不阻断继续补充画像。
   - 进入 `Step3` 前要求“画像完成（Step2 确认）”。
   - 进入 `Step4-5`（报告/精修链路）前要求 `Step3` 必填项完整（目标岗位；若 `targeted` 还需 JD）。
   - 进入 `Step6`（面试链路）前要求“已存在诊断产物简历 + 已选择面试简历”。
   - 不满足条件时阻断并引导返回上一步。
2. `软门禁（Soft Gate）`：用于兼容路径与可补充信息场景，例如用户直接访问旧入口 `/ai-analysis`、或画像细节可补充；允许“先继续，稍后补充”。
3. `禁阻断规则`：`generic` 模式不得因为 JD 为空被阻断。
4. `可中断可续跑`：用户可中途退出，下次按最近有效步骤恢复，不强制从 Step1 重走。

## 3.3 画像完成判定标准（用于门禁，前置定义）

1. `users.career_profile_latest` 存在且为对象。
2. `career_profile_latest.summary` 非空。
3. `career_profile_latest.experiences` 为数组且长度 `>= 1`。
4. 满足以上条件才视为“画像完成”：
   - 在 GuidedFlow 主流程内，未完成画像时阻断进入 Step3+。
   - 在 GuidedFlow 主流程内，若 `Step3` 必填信息不完整，不允许进入 Step4+。
   - 在 GuidedFlow 主流程内，若未选择面试简历或无诊断产物简历，不允许进入 Step6 面试链路。
   - 在旧入口直达（绕过 GuidedFlow）时仅给软提示，保留继续进入能力。

## 4. 代码落地映射（最小侵入）

### 4.1 前端编排层（新增壳，不拆核心能力）

1. 新增 `GuidedFlow` 壳层（仅负责编排步骤、门禁、状态恢复）。
2. 复用现有页面：
   - Step1-2 复用 `CareerProfile`（融合页）+ `CareerProfileResult`（总结/可选编辑）
   - Step3-6 复用 `AiAnalysis` 现有页面组件
3. 新增“聊天可见性门禁函数”：仅 Step5-6 业务聊天可见。

#### GuidedFlow 六步 ↔ 现有组件映射表

| GuidedFlow Step | 对应现有页面/组件 | 对应 AiAnalysisStep | 说明 |
|---|---|---|---|
| Step 1 上传与画像融合 | `CareerProfile`（`/career-profile/upload`） + `ResumeImportDialog` | — | 先上传/跳过，再进入 AI 定向追问补充页 |
| Step 2 画像确认与编辑 | `CareerProfileResult`（`/career-profile/result/edit` + `/summary`） + `CareerProfileStructuredEditor` | — | 编辑画像后进入总结展示页（不走预览） |
| Step 3 诊断输入与分析执行 | `JdInputPage` + `FinalAnalysisLoadingPage` | `jd_input` → `analyzing` | 诊断链路直达，按 `generic/targeted` 分支输入 |
| Step 4 评分报告解释 | `FinalResumeReportPage` +（非面试）`ChatPage` | `report` / `final_report` / `chat` | 评分、缺口、解释与方案建议 |
| Step 5 简历精修 | `PostInterviewReportPage` + `Editor` | `comparison` | 选区改写 + 手工编辑并存 |
| Step 6 模拟面试 | `ResumeSelectPage` + `InterviewScenePage` + `ChatPage` + `InterviewReportLoadingPage` + `InterviewReportPage` | `resume_select` → `interview_scene` → `chat` → `interview_report_loading` → `interview_report` | 面试完整闭环，`interview_scene` 为内部状态语义 |

状态同步策略（修订）：
1. `GuidedFlowStep -> Route/AiAnalysisStep`：用于“系统恢复步骤/下一步动作”时的主动导航。
2. `AiAnalysisStep -> GuidedFlowStep`：用于 AiAnalysis 内部自动流转（如 `analyzing`、`interview_report_loading`）后的被动回写。
3. `GuidedFlow.currentStep` 不再单向覆盖 AiAnalysis 内部状态，避免出现“步骤状态与页面实际状态不一致”。
4. 标准映射表：
   - `jd_input`、`analyzing` -> `Step 3`
   - `report`、`final_report` -> `Step 4`
   - `comparison` -> `Step 5`
   - `chat` -> `Step 4`（`isInterviewMode=false`）/ `Step 6`（`isInterviewMode=true`）
   - `resume_select`、`interview_scene`、`interview_report_loading`、`interview_report` -> `Step 6`

#### GuidedFlow 路由方案

采用**状态 overlay + 路由重定向**方案（最小侵入）：

1. 不新增顶级路由。GuidedFlow 为**全局 context provider + 步骤状态管理**，挂载在 App 最外层。
2. 根据 `guidedFlow.step` 的值，通过 `navigate()` 重定向到对应的现有路由（如 `/career-profile/upload`、`/ai-analysis/jd`）。
3. 现有路由不做任何修改，保持独立可用。
4. 用户直接访问 `/ai-analysis`（绕过 GuidedFlow）时：
   - 若 `VITE_GUIDED_FLOW_ENABLED=1`，检查画像是否已完成；未完成时先给软提示（推荐回到 Step2-3），但保留继续进入能力（该策略仅用于兼容旧入口）。
   - 若 `VITE_GUIDED_FLOW_ENABLED=0`，行为与当前完全一致。
5. 旧入口兼容模式下（绕过 GuidedFlow）：
   - 仅显示软提示，不开放步骤跳转。
   - 只有用户从 Dashboard 主入口进入时，才激活 GuidedFlow 的门禁与状态恢复交互。
6. Dashboard 呈现策略：
   - 仅渲染“强引导”主入口，不再额外渲染“最近进展”独立入口。
   - 强引导入口的 UI 风格可复用现有“最近进展”卡片视觉规范（样式复用，不做信息模块并列）。

### 4.2 Step3 双模式显式化

1. 在 `JdInputPage` 增加显式切换：`generic` / `targeted`。
2. `generic`：JD 输入区可跳过，直接分析通用版。
3. `targeted`：沿用现有 JD 评分、缺口分析、低匹配提醒。
4. 同 JD 二次进入时增加“复用上次 / 重新生成”动作映射：
   - `复用上次` -> 读取既有 `optimizationJdKey` 对应版本
   - `重新生成` -> 强制新版本策略（不复用旧优化结果）
5. 同 JD 检测机制：
   - 检测依赖 `makeJdKey(jdText)` 生成的哈希键（见 `id-utils.ts`）
   - JD 文本标准化规则：`trim + toLowerCase + 去连续空白` 后再做 key（与 `id-utils.ts:normalizeJdText` 一致）
   - 若 `analysisSessionByJd[jdKey]` 已存在且非空，在点击"开始分析"前弹出选择弹窗
   - 弹窗提供两个动作："查看上次结果" / "基于最新画像重新生成"

### 4.2.1 面试内部步骤语义化（已落地）

1. 面试模式的场景页内部步骤名统一为 `interview_scene`，与诊断的 `jd_input` 语义拆开。
2. 兼容策略：
   - 仍允许恢复历史 `jd_input` 会话值，并映射到 `interview_scene`。
   - 路由保持 `/ai-analysis/jd`，只改内部状态名，不改用户可见流程。
3. 回退策略：
   - 面试模式从 `interview_report/final_report` 返回时，回到 `interview_scene`。
   - 诊断模式保持回到 `jd_input`。

### 4.2.2 面试场景与提示词收口（新增）

1. 前端场景页（`InterviewScenePage`）：
   - 面试类型枚举从 `general | technical | hr` 调整为 `general | technical | pressure`。
   - 文案替换：`HR面-文化匹配` -> `压力面`。
   - 删除“面试模式”整块 UI，不再允许用户选择 `simple/comprehensive`。
2. 前端状态与兼容：
   - 新写入统一使用 `pressure`，不再生成新的 `hr` 值。
   - 读取历史会话时保留兼容映射：`hr -> pressure`，避免旧会话无法恢复。
   - 历史 `interviewMode` 字段仅读兼容，不再作为新会话关键决策条件。
3. 后端提示词（`/api/ai/chat`、`/api/ai/chat/stream`、`interview_plan`）：
   - 删除按 `simple/comprehensive` 分叉题量与话术的逻辑，统一为单一标准面试流程。
   - 新增 `pressure` 人设与规则：高压多轮追问、时间压力、信息不完整下的决策、冲突与质疑应对。
   - 约束：高压不等于攻击，不使用侮辱性语言，不引导违法/歧视性提问。
4. 出题真实性规则（统一口径）：
   - 每轮问题应具备“具体场景 + 决策动作 + 结果证据”三要素。
   - 优先围绕候选人真实经历与目标岗位能力项追问，避免空泛人格测试题。
   - 压力面至少覆盖：冲突处理、优先级取舍、失败复盘、反压沟通四类主题。

### 4.3 Step5 精修统一

1. 复用 `PostInterviewReportPage`（在 `comparison` 步骤中用作前后对比展示 + AI 标注编辑）+ `Editor`（手工编辑），抽成统一精修容器。
2. 支持两种改法并存：
   - 用户直接改
   - 选中语句后 AI 定点改写
3. 保存仍沿用 `createResume/updateResume` 现有链路。

### 4.3.1 画像编辑器与简历编辑器融合改造（归档：二阶段取消）

1. 决策状态：
   - 第一阶段（画像主字段单一映射收口）保留并继续维护。
   - 第二阶段（与简历编辑器进一步融合）已取消，不再进入排期。
2. 取消原因（2026-03-11 产品决策）：
   - 简历编辑器能力已并入 Preview 页，继续推进二阶段融合收益不足且会增加迁移与回归成本。
3. 替代现状：
   - 简历编辑主承载：`Preview` 页内编辑。
   - 画像编辑主承载：`CareerProfileStructuredEditor`，保持主字段优先/单一映射策略。
4. 追溯说明：
   - 本节保留作为历史决策记录，后续不再将“二阶段融合”列为未完成项。

### 4.4 后端与数据策略

1. 上传策略改造（本期关键）：
   - 用户“上传已有简历”仅作为画像抽取输入，不直接写入 `resumes` 简历库。
   - 上传结果转为 `career_profile_latest/history` 的事实补充与待确认草稿。
   - 只有经过 Step3-5 诊断与优化产生的简历版本，才允许写入 `resumes`。
2. 新建简历入库约束：
   - 草稿态/导入态简历默认不入库（前端内存态或临时草稿存储）。
   - 持久化写入时增加来源标识建议：`source = diagnosis_generated | interview_refined`（命名可在实现期冻结）。
   - `ResumeSelectPage` 仅展示“诊断后产物简历”，不展示上传原始稿。
3. 主链路继续复用 `/api/ai/*` 与 `/api/resumes*`，不引入大规模新接口。
4. 仅补最小编排字段，按归属分层存储：
   - `guidedFlow.step`：存储在 `users.guided_flow_state`（新增 JSONB 列，用户级，跨简历，可跨设备恢复）
   - DDL：`ALTER TABLE users ADD COLUMN IF NOT EXISTS guided_flow_state JSONB DEFAULT '{}'::jsonb;`
   - `guidedFlow.analysisMode` (`generic|targeted`)：存储在 `resume_data` 内（简历级，不同简历可独立模式）
   - 真值规则：`analysis_mode` 以 `resume_data.analysisMode` 为准；`guided_flow_state.analysis_mode` 仅作为恢复提示（hint）。
   - 冲突处理：若两者不一致，读取 `resume_data.analysisMode` 并回写 `guided_flow_state`，保证后续恢复一致。
   - 本期执行层：沿用前端直连 Supabase 的现状，由前端编排层通过 `DatabaseService.updateUser` 回写 `guided_flow_state`；`/api/user/profile` 本期仍仅承载 `name/phone` 更新。
   - 说明：`step` 状态跟用户会话走而非跟简历走，避免切换简历时步骤状态丢失或竞态
5. 多 JD 场景先复用现有键，不另起新表：
   - `analysisSessionByJd`
   - `optimizationJdKey`
   - `optimizedFromId`
6. 同 JD “重新生成”必须显式走新版本策略（对应 `create_new` 语义），避免被默认复用策略吞掉。
7. `generic` 无 JD 场景默认使用 `makeJdKey('__no_jd__')` 作为会话键（与现有前端实现一致）；读取时兼容历史 `jd_default`，避免旧数据丢失。若后续需要保留多次 generic 历史，再扩展 run 维度键，不在本期引入新表。
   - 实施约束：禁止直接对空字符串调用 `makeJdKey('')`；必须先将无 JD 归一为 `__no_jd__` 再生成 key，防止 `jd_default` 与 `jd_<hash>` 双轨并存。
8. Agent 先保持开关态，不抢主链路。

#### users.guided_flow_state 迁移治理（新增）

1. 必须通过独立 migration 文件落地，不允许在运行时动态改表。
2. 迁移命名建议：`database/migrations/2026-03-02-guided-flow-state.sql`。
3. 回滚 SQL 必须同时提供：
   - `DROP TRIGGER IF EXISTS update_users_updated_at_guided_flow ON public.users;`
   - `DROP FUNCTION IF EXISTS public.set_users_updated_at_guided_flow();`
   - `ALTER TABLE users DROP COLUMN IF EXISTS guided_flow_state;`
4. 并发写入策略（多端）：采用 `updated_at` 比较的 last-write-wins（后写覆盖前写）。
   - `updated_at` 必须由服务端/数据库生成（例如 DB `now()` 或触发器），不信任客户端时间。
   - 客户端请求不得直接写入 `updated_at`；由数据库触发器（如 `update_users_updated_at` / `update_resumes_updated_at`）统一覆盖为服务端时间。
   - 落地动作：前端 `ai-resume-builder/src/database/user-repository.ts` 更新 `users` 时不再主动写入 `updated_at` 字段。
   - 环境门禁：若目标环境缺失 `updated_at` 触发器，阻断发布并先补齐 schema。
5. 字段最小结构建议：
   - `{"step":"step3","resume_id":"r_123","jd_key":"<makeJdKey('__no_jd__')>","analysis_mode":"generic","updated_at":"2026-03-02T10:00:00Z","source":"guided_flow"}`
6. 恢复顺序建议（避免多简历/多 JD 恢复错位）：
   - 优先按 `resume_id + jd_key + analysis_mode` 恢复上下文。
   - 若上下文键缺失或目标记录不存在，则回退到 `step` 级恢复并提示用户重新确认简历/JD。

## 5. 环境变量与开关建议

现有继续使用：

1. `AGENT_API_ENABLED`
2. `AGENT_MOCK_WORKER_ENABLED`
3. `AGENT_INTENT_CONFIDENCE_THRESHOLD`

新增建议（前端编排层）：

1. `VITE_GUIDED_FLOW_ENABLED=0`（默认关闭，灰度开启）
2. `VITE_GUIDED_STEP12_FOLLOWUP_ENABLED=0`（默认关闭；控制 Step2 的"定向追问卡片"显隐，非业务聊天框）
3. `VITE_CAREER_PLANNING_CHAT_ENABLED=0`（默认关闭，按用户分组放量）

## 6. 迭代排期（4 周）

### 6.0 当前完成度（截至 2026-03-03）

已完成（代码与脚本已落地）：
1. `GuidedFlow` 基础模块、路由映射、画像门禁与状态存储（`ai-resume-builder/src/guided-flow/*` + `App.tsx` 接线）。
2. 诊断入口直达 `Step3`：`/ai-analysis/jd`，不再默认进入简历选择。
3. Step3 `generic/targeted` 双模式、同 JD 复用/重生成口径与前端分支测试。
4. 面试场景页独立拆分（`ResumeSelectPage` 与 `InterviewScenePage` 分离）。
5. 面试内部步骤语义化：`jd_input -> interview_scene`（兼容旧会话恢复）。
6. `users.guided_flow_state` 迁移与前端回写接线（含 schema 未就绪提示）。
7. 在线 smoke 命令已接线：`scripts/test-online.ps1` / `scripts/test-step.ps1` 支持 `-RunGuidedFlowUiSmoke` 与 `-RunAiMainflowApiSmoke`。
8. 实施文档已补齐：`GUIDED_FLOW_TECH_SPEC.md`、`AI_MAINFLOW_API_CONTRACT.md`、`AI_MAINFLOW_SMOKE_RUNBOOK.md`、`AGENT_API_SMOKE_RUNBOOK.md`。
9. Dashboard“进度模块”已下线，主入口统一为“强引导卡片”（不展示进度条）。
10. GuidedFlow 顶部浮层进度条已下线，保留步骤状态同步与门禁，不再允许通过进度条点击跳转。
11. Step1 融合页（前端）已接入 `CareerProfile`：
    - 强引导默认入口统一为 `/career-profile/upload`。
    - 已改为固定三段流程：“融合输入页（上传/跳过 + 语音/文本输入） -> 当前页 AI 解析后内嵌追问补充 -> 画像总结页”。
    - 提交后默认进入 `/career-profile/result/summary`，不再自动跳转编辑页。
12. 职业画像主路由已统一：
    - `View.CAREER_PROFILE` 统一指向 `/career-profile/upload`。
    - `guidedFlowStepToPath(step1)` 与门禁回跳统一为 `/career-profile/upload`，`/career-profile` 仅保留兼容跳转。
13. 上传入库策略第一轮（前端数据层）已完成：
    - 新增 `resume-storage-policy`，对“是否可入简历库”进行统一判定。
    - `DatabaseService.createResume` 已对非诊断产物启用“本地草稿成功返回 + 跳过远端写库”。
    - `DatabaseService.getUserResumes / getUserResumesExportHistory` 已只返回诊断/优化产物。
    - 诊断/面试产物写入增加 `source` 标记：`diagnosis_generated / interview_refined`。
14. 旧兼容键与面试步名收口（第一阶段）已完成：
    - 诊断链路不再读取 `ai_analysis_force_resume_select`、`ai_result_wait_resume_select` 作为行为分支，仅做清理删除。
    - 面试渲染层不再接受 `jd_input` 作为场景页步骤，统一以 `interview_scene` 渲染。
    - 面试模式下若恢复到 legacy `jd_input`，在 UI effect 层自动归一到 `interview_scene`。
15. 上传入库策略第二轮（后端 API 层）已完成：
    - 新增 `backend/services/resume_storage_policy.py`，统一后端入库判定口径。
    - `resume_crud_service.list_resumes` 仅返回诊断/优化产物。
    - `resume_crud_service.create/update` 对非诊断产物返回 `422 resume_not_persistable`。
    - 新增后端单测 `backend/tests/test_resume_storage_policy.py` 覆盖策略与 CRUD 门禁。
16. 面试入口 guard 已补齐：
    - 面试模式下若无已选简历，`jd_input/interview_scene` 会自动回到 `resume_select`，并在选择页空状态提示“请先诊断”。
17. Step1 追问可见性回归已修复：
    - `AI解析` 后追问区域持续可见；清空输入不会导致追问消失，提交按钮仍遵守“上传/输入二选一”门禁。
18. GuidedFlow 在线 smoke 已新增 Step1 断言：
    - 覆盖“输入后可点击 AI解析 -> 追问出现 -> 清空输入后追问仍在 -> 提交按钮禁用”链路。
19. GuidedFlow 在线 smoke 已新增“上传后追问补齐”断言：
    - 覆盖“上传简历（mock parse）-> 已上传标题展示 -> AI解析 -> 追问出现”的主链路。
20. 职业画像“单一映射主线”第一阶段已落地：
    - 编辑态已改为直改 `draftProfile` 主字段，减少 `resumeData/extras` 中转映射。
    - 入库链路改为主字段直持久化优先，派生数据仅保留兼容用途。
21. 字段一致性修复第一轮已完成：
    - 已修复 MBTI 回填与约束污染问题，避免“展示有值但主字段为空”与“值落错字段”。
    - 已修复 `atomicTags` stale 回灌污染主字段的问题（仅手动来源可覆盖）。
22. 字段一致性测试已补齐并通过：
    - 新增/更新职业画像字段映射与展示回归用例，覆盖主字段优先、派生不反写。
    - 本地基线通过（frontend/backend 关键链路回归通过）。
23. Step1 解析触发点已收口为“显式点击 AI 智能解析”：
    - `ResumeImportDialog` 改为仅采集输入（文本/PDF），不做即时解析。
    - `GuidedCareerProfileFusionStep` 在点击 `AI 智能解析` 后才执行上传内容解析与追问生成。
    - 已补 `fusion-upload-parser` 定向单测与本地基线回归。
24. 画像总结页已收口为“统一结构编辑器（主字段优先）”：
    - `CareerProfileQuickConfirm` 分支已下线，结果页统一渲染 `CareerProfileStructuredEditor`。
    - 总结页以主字段展示为准，派生信息仅作兼容显示，不作为独立编辑主线。
    - 后续按“总结区只读优先”继续收口，避免用户在总结区编辑到非源字段内容。
25. 旧会话步名迁移逻辑已抽离并加固测试：
    - `useInterviewSessionRecovery` 已抽离 `normalizeInterviewRecoveryStep`，统一 `jd_input -> interview_scene`、`report -> final_report` 映射。
    - 新增 `interview-session-step-migration.test.ts`，覆盖 legacy 映射与非法步骤保护。
26. Step1 上传弹窗移动端适配已落地：
    - `ResumeImportDialog` 已完成安全区适配、可滚动区收口、窄屏高度策略与键盘场景可达性优化。
27. 编辑入口已收口到预览页：
    - `/editor` 与 `/templates` 已改为 `Preview(forceEditMode)`，不再走独立模块化编辑页流程。
    - 预览画布已支持就地文本编辑，保留预览/编辑同页切换。
28. 预览画布编辑能力已补齐第一阶段：
    - 已支持新增条目、自动聚焦、撤销/前进历史栈。
    - 删除按钮已按产品口径隐藏，避免误删；后续按需求再评估可恢复性。
29. 职业画像编辑字段映射已收口为“编辑态直改 draftProfile”：
    - `CareerProfileStructuredEditor` 编辑态字段改为直接绑定持久化字段（`personalInfo/summary/targetRole/jobDirection/experiences/projects/educations`）。
    - `experiences` 从“公司/职位/时间/描述投影回写”改为直接编辑 `organization/title/period/actions/results`，避免二次投影串字段。
    - `projects/educations` 编辑态改为直接写 `period/school/degree/major/link` 等原字段，移除编辑态经 `resumeData` 结构的回写依赖。
30. 结构化保存流程已改为“draftProfile 直持久化优先”：
    - `CareerProfileStructuredEditor.handleSave` 不再依赖 `resumeData/extras` 回写；当前以 `draftProfile` 为主组装持久化对象，派生结构仅作兼容输入。
    - `useCareerProfileComposer.saveStructuredCareerProfile` 入库前仅做必要 normalize/校验，并补齐 `personalInfo.title/gender` 与 `targetRole/jobDirection` 一致性。
31. 职业画像展示字段一致性巡检（第一轮）已完成：
    - 已修复 MBTI 在“总结/求职约束”中出现但 MBTI 区缺失的问题；新增从 `summary/personality/workStyle/careerGoal/constraints` 推断 MBTI 的回填逻辑。
    - 已修复“MBTI 文本误落到求职约束”的污染问题，展示层对 MBTI-only 文本做过滤并保留真实约束。
32. `atomicTags` 反向污染主字段问题已修复：
    - `createCareerProfileEditorDraft` 改为“仅手动编辑来源（`sourcePaths=atomicTags.<category>`）才允许覆盖主字段”，避免 stale tags 回灌造成字段回弹/删不掉。
    - `identity` 解析增加姓名过滤，避免 `男/女/MBTI` 等 token 被误识别为姓名。
33. 预览页基础信息映射与编辑收口（第二轮）已完成：
    - 预览编辑态基础信息改为画布内直改（与工作经历/项目等一致交互），不再依赖外部表单。
    - 基础信息从画像主字段严格映射并做有效值校验（性别/邮箱/年龄）；未填写字段不注入、不展示。
    - 每份简历首次预览按画像主字段做一次强制同步，随后通过本地 sync key 防止覆盖用户手改。
34. 预览页眉与导出锁定文案收口已完成：
    - 编辑态保留页眉栏，仅隐藏“简历预览”标题文本；返回与操作按钮保留。
    - 清理页眉残余乱码文案，并删除“当前处于编辑态，导出已锁定。请先完成并保存编辑。”提示句。
35. AI 诊断生成简历技能清洗链路已统一：
    - 后端新增 `skill_cleanup_service.py`，对技能做标准化去重、噪音过滤与数量上限控制（默认 10，范围钳制 8~12）。
    - 前端展示前与落库前双守卫接入 `sanitizeResumeSkills`，防止旧脏数据继续放大。
    - 覆盖 analyze / generate / post-interview 链路，并补齐前后端相关测试。
36. JD 上下文隔离与复用键收口已完成：
    - 诊断缓存/复用键补齐 `analysisMode + jdKey + targetRole` 维度，避免 `generic/targeted` 或不同目标岗位误命中同一份报告。
    - `generic` 模式不再回退复用 `lastJdText`；空 JD 与有 JD 结果隔离，避免“填/不填 JD 结果相同”。
    - 会话恢复与报告快照恢复增加模式与 JD 键一致性校验，阻断 stale snapshot 复用。
37. 诊断性能与定向口径收口已完成：
    - 后端 `analyze` 增加阶段计时（timings）观测，定位 LLM 与后处理耗时占比。
    - `final_report` 默认关闭非必要 verify 二次生成（`enable_verify_pass=False`），缩短生成链路耗时。
    - JD 定向模式提示词强化为“JD 匹配差距 + 定向改写策略”主叙事，降低“简历整体评价”口径暴露。
38. 针对 JD 定向链路的回归测试已补齐：
    - 新增/更新 `analysis_mode`、`jd-key-compat`、`analysis-execution-result` 前端用例。
    - 后端补充 JD 定向提示词与关键词对齐覆盖（`test_parse_endpoint_service.py`）。
39. CareerProfileResult 导航条恢复与图标一致化已完成：
    - 已完成：恢复 icon-only 顶部导航，区分导航条与页头视觉层级，并统一导航图标与锚点 id 口径（`3427ab5`、`45aac4e`、`ab7bd1d`）。
    - 影响：模块跳转更稳定，导航识别成本降低。
40. P0/P1/P2 UI 优化串联收口已完成：
    - 已完成：结果页状态反馈、CTA 语义、信息密度与文案口径优化（`6430a83`、`a849d3b`、`c1e6aa3`、`e55ffa1`、`115df8d`）。
    - 影响：结果页层级更清晰，主动作更聚焦。
41. 编辑器输入框与基础信息样式统一已完成：
    - 已完成：输入控件统一为卡片视觉语言，基础信息模块按“无底色 + 模块风格一致”收口（`f076ea0`、`f6d6211`、`599c596`、`9a9796f`）。
    - 影响：编辑态跨模块视觉更一致，样式回归风险下降。
42. MBTI 编辑态回填一致化与人格字段清洗已完成：
    - 已完成：统一 MBTI 编辑态 hydration，补齐 personality 清洗与回归测试（`2e86e37`）。
    - 影响：减少 MBTI/人格字段错位与回弹。
43. 旧语义兼容债务主链路收口已完成：
    - 已完成：下线面试 legacy `jd_input` 恢复分支，移除诊断 `resume_select` 冗余恢复路径，完成 `targetRole` 命名迁移（`f49fd12`、`5f5914c`、`83ee0bd`）。
    - 影响：步骤语义与字段命名一致，恢复链路排障成本下降。
44. 画像主字段写入校验已完成后端加固：
    - 已完成：写入前主字段校验与后端测试补齐（`620c691`）。
    - 影响：入库结构漂移风险下降。
45. 计划书 A 组与 Step2/Step5 收口项已落地并可追踪：
    - 已完成：A 组工程化测试/观测补齐（`accad3a`）；Step5 选区改写边界与写回路径收口（`e8b3b5e`）；Step2 追问入口与文案语义统一（`19ce78c`）。
    - 影响：v6.26 剩余清单中的三项关键收口项已完成并推送 main。
46. 近期 UI 修复已完成并推送：
    - 已完成：移除“跳过并生成”相关提示文案（`c2ce204`）；预览页编辑态滚动与画布高度修复（`9d55689`）；AllResumes 菜单浮层裁切修复（`ab3572c`）。
    - 影响：Step1/预览页/简历列表的关键可用性问题已关闭。
47. 画像入库 Schema 校验加固（主字段优先）已完成：
    - 已完成：后端主字段校验失败 fallback 仍保持“旧画像优先不覆盖”；`factItems/main_fields` 两类校验日志统一补齐稳定字段路径（count/paths/types）；`organize-career-profile` 输出补齐 `personalInfo` 对象化与主字段 guard（`v6.27` 已落地）。
    - 影响：主字段单一映射策略下，入库失败可观测性与回退稳定性提升。
48. 低匹配策略第一阶段（风险等级 + generic 快捷路径）已完成：
    - 已完成：Step3 输入页与报告页新增 Low/Medium/High 低匹配风险等级呈现；在 targeted 中风险/高风险场景提供“转为 generic”快捷入口（`256651e`）。
    - 影响：用户可在输入/报告两个关键节点快速识别低匹配风险并切换到更稳妥路径，减少无效定向迭代。

部分完成（可用但仍需收口）：
1. 多 JD 循环与复用链路已打通，但还缺线上行为埋点与长期回归看板。
2. 强引导与旧入口兼容并行，仍有少量历史会话兼容逻辑待逐步收口（见 §8.1）。
3. 上传后 AI 引导补齐画像与“上传不入库”策略已形成前后端一致约束；待线上灰度观察与提示文案优化。
4. 画像编辑融合进入第二阶段：已完成“编辑态直改 `draftProfile` + 保存直持久化优先”，后续聚焦字段一致性与编辑体验稳定性，不再扩展事实治理 UI。

未完成（后续必须推进）：
1. “上传简历前置（可跳过）”主流程已完成前端入口改造，待补数据治理与线上迁移说明闭环。
2. 独立职业规划咨询入口（`/career-planning`）及隔离会话上下文。
3. 面试场景收口专项：`HR面 -> 压力面`、移除面试模式、后端提示词改造与兼容迁移。

已取消（产品决策，保留追溯）：
1. “画像编辑器与简历编辑器第二阶段融合改造”从待办下线。
   - 取消原因：简历编辑器能力已并入 Preview 页，继续推进二阶段融合收益不足且会引入额外迁移成本。
   - 替代现状：统一以“Preview 页编辑”为简历编辑主承载；画像编辑继续沿用 `CareerProfileStructuredEditor` 的主字段单一映射策略，不再推进与简历编辑器的组件级二阶段融合。

### Sprint A（2026-03-02 到 2026-03-08，状态：核心完成（含上传融合页））

1. 上线 `GuidedFlow` 壳层。
2. 接入现有页面，不改 AI 核心逻辑。
3. 完成 Step1-6 显式步骤状态与前后步导航。
4. 完成 Step2 聊天门禁（仅采集，不开业务聊天）。
5. DDL 迁移：`users` 表新增 `guided_flow_state JSONB DEFAULT '{}'::jsonb`。
6. 完成 `docs/implementation/GUIDED_FLOW_TECH_SPEC.md` 初版。

验收标准：
1. 从 Dashboard 有且仅有一个入口进入 GuidedFlow。
2. Dashboard 不出现与强引导并列的“最近进展”独立入口；若保留卡片视觉，仅作为强引导样式实现。
3. 进入后可顺序通过 Step1 → Step2 → Step3 → Step4 → Step5 → Step6，步骤状态可正确恢复与流转（无需进度条展示）。
4. Step1-3 页面不出现独立聊天窗口（Step2 定向追问卡片不受此限制）。
5. Step2 完成后可正确流转到 Step3。
6. 直接访问 `/ai-analysis`（绕过 GuidedFlow）时行为正常（兼容旧入口）。
7. 在 GuidedFlow 主流程内，未完成画像时尝试进入 Step3+ 被阻断；`Step3` 必填项不完整时尝试进入 Step4+ 被阻断；未选择面试简历时尝试进入 Step6 被阻断。
8. `scripts/test-online.ps1` 提供主链路 API smoke 与 GuidedFlow UI smoke 执行入口，且 `scripts/test-step.ps1 -RunAiMainflowApiSmoke -RunGuidedFlowUiSmoke` 可串联执行。

说明：
- “一个入口”指主推荐入口，不代表删除旧模块直达入口（兼容路径保留）。

### Sprint B（2026-03-09 到 2026-03-15，状态：已完成）

1. Step3 增加 `generic/targeted` 显式模式。
2. `generic` 全链路跑通，无 JD 也可产出报告与简历版本。
3. `targeted` 维持评分与缺口分析。
4. 画像入库增加 JSON Schema 校验（§8 第 4 条风险缓解）。

验收标准：
1. JdInputPage 出现显式 `generic/targeted` 切换 UI。
2. 选择 `generic` 后无需填 JD 即可点击"开始分析"。
3. `generic` 分析完成后可产出报告、进入精修和面试。
4. `targeted` 流程回归通过，不受影响。
5. 画像入库校验失败时提示重试，不覆盖已有画像。

门禁口径说明：
1. 画像完成判定标准见 `§3.3`，并已在 Sprint A 的 GuidedFlow 主流程门禁启用。
2. Sprint B 在此基础上做“画像入库 JSON Schema 校验”加固，不改变门禁判定本身。

### Sprint C（2026-03-16 到 2026-03-22，状态：部分完成）

1. 统一精修画布（选区改写 + 手工编辑）。
2. （已取消）画像编辑器与简历编辑器第二阶段融合。
3. 增加“事实来源提示”与改写边界提示。
4. 保存新版本后可无缝进入模拟面试。

验收标准：
1. 精修容器中可同时使用手工编辑和 AI 选区改写。
2. （取消）不再以“编辑器二阶段融合复用率”作为验收条件。
3. 改写内容附带事实来源提示，不脱离画像事实库。
4. 保存后生成新版本简历，可直接进入 Step 6 面试。
5. 保存的版本正确关联 `optimizedFromId` 和 `optimizationJdKey`。

### Sprint D（2026-03-23 到 2026-03-29，状态：未开始）

1. 增加独立“职业规划咨询”入口。
   - 预期路由：`/career-planning`（需在 `View` 枚举 + `app-routing.ts` 中新增）。
   - 复用 `ChatPage` 组件，但使用独立的对话上下文（不与分析/面试共享会话）。
2. 补齐关键埋点（步骤漏斗、模式分流、对话触发）。
3. Agent 仅做埋点/确认链灰度桥接（不替代主流程）。

验收标准：
1. `/career-planning` 路由可正常访问。
2. 咨询对话不影响 GuidedFlow 步骤状态和 `guided_flow_state`。
3. 咨询对话不与分析/面试共享 `analysisSessionByJd` 会话。
4. 步骤漏斗埋点可在 Analytics 中查看各步骤转化率。

## 7. 测试与验收门禁

### 7.1 必测路径（Smoke）

1. `上传可跳过路径`：Step1 选择跳过上传，补充画像并提交，完成 Step2 后进入 Step3。
2. `上传引导补齐路径`：Step1 上传后出现 AI 定向追问建议，用户补充后提交并进入 Step2 校对。
3. `generic`：画像（Step1-2） -> 通用分析（Step3） -> 报告（Step4） -> 精修（Step5） -> 面试（Step6）。
4. `targeted`：画像（Step1-2） -> JD 分析（Step3） -> 评分报告（Step4） -> 精修（Step5） -> 面试（Step6）。
5. `targeted 低匹配`：出现风险提示并可转通用方案。
6. `targeted 多 JD 循环`：同一用户连续输入 JD-A 与 JD-B，均可生成独立版本且互不覆盖。
7. `targeted 同 JD 回访`：可选择“复用上次”或“重新生成”，结果符合预期。
8. `上传不入库验证`：上传后 `resumes` 不新增记录；仅诊断产物写入 `resumes`。
9. `硬门禁验证`：在 GuidedFlow 主流程内，未完成画像时阻断 Step3+；`Step3` 必填项不完整时阻断 Step4+；未选择面试简历时阻断 Step6。
10. `旧入口软门禁验证`：直接访问 `/ai-analysis` 且画像未完成时，出现软提示但允许继续。
11. `analysis_mode 冲突回写验证`：当 `guided_flow_state.analysis_mode` 与 `resume_data.analysisMode` 不一致时，读取以 `resume_data` 为准并完成回写纠正。
12. `压力面收口验证`：面试场景页仅存在 `初试/复试/压力面` 三类，且不存在“面试模式”选择控件。
13. `提示词与题单验证`：`pressure` 场景下生成的问题覆盖冲突/压力/取舍/复盘，且不出现旧 `HR面` 或 `simple/comprehensive` 口径。
14. `字段唯一归属验证`：同一语义值不会同时落到多个字段（例如 `targetRole/jobDirection`、`mbti/personality`、`gender/personalInfo.gender`）。
15. `总结区只读守卫验证`：当总结内容包含其他字段拼接/推断信息时，总结区不可编辑，用户需改源字段后回流展示。

补充口径（避免验收误判）：
1. `generic/targeted` 作为业务 smoke 用例，目标是覆盖到 Step5/Step6 闭环。
2. 当前自动化脚本 `scripts/ai_mainflow_api_smoke.py` 仅覆盖 API 层（`analyze/generate/chat`），不能单独替代业务闭环签收。
3. Step5/Step6 闭环需由 UI e2e 或手工/集成记录补齐签收证据。

### 7.2 自动化建议

1. 前端 UI e2e（GuidedFlow）：当前先通过 `scripts/test-online.ps1 -RunGuidedFlowUiSmoke` 的内嵌 Playwright CLI 场景覆盖入口可达与软门禁断言；后续再外置为独立脚本（如 `scripts/e2e_guided_flow_ui.playwright.ts`）覆盖更完整门禁回归。
2. AI 主链路 API smoke（`/api/ai/*`）：使用 `scripts/ai_mainflow_api_smoke.py --backend-url ...` 在线验证主链路接口；`scripts/e2e_full_flow.py` 仅作为本地进程内回归，不计入线上门禁。
3. Agent 治理层 smoke（`/api/agent/*`）：使用 `scripts/agent_api_smoke.py`，仅验证 run/idempotency/trace/confirm 等治理能力，不作为 GuidedFlow 主链路验收替代。
4. `analysis_mode` 冲突回写验证：归属前端集成测试（状态恢复链路）+ 数据层回读断言（`users.guided_flow_state` / `resumes.resume_data`），不依赖 `/api/user/profile`。
5. 门禁命令链接线：`scripts/test-online.ps1` 增加 `-RunAiMainflowApiSmoke` 与 GuidedFlow UI smoke 执行入口；`scripts/test-step.ps1` 增加 `-RunAiMainflowApiSmoke`、`-RunGuidedFlowUiSmoke` 参数并串联执行。
6. 验收约束：若 `-RunGuidedFlowUiSmoke` 未接线或未执行，本期 UI 门禁 smoke 不得标记为通过；若 `-RunAiMainflowApiSmoke` 未执行，不得标记主链路 API smoke 全通过。
7. 自动化覆盖边界：15 条 smoke 属于验收清单，当前自动化覆盖以 runbook 覆盖矩阵为准；低匹配、多 JD 回访、上传不入库、强门禁、analysis_mode 冲突回写保留手工/集成断言。
8. 后端：`/api/ai/*` 回归测试 + Agent foundation 测试常绿。
9. 面试场景专项回归：增加 `pressure` 类型映射与兼容（`hr -> pressure`）测试，确保旧会话可恢复。

## 8. 风险与回滚

1. 风险：入口收敛导致旧跳转路径失效。
   回滚：`VITE_GUIDED_FLOW_ENABLED=0` 立即回退旧入口。
2. 风险：Step3 双模式引发状态分叉。
   回滚：先保留原 JD 页面逻辑，模式只做 UI 开关不改后端协议。
3. 风险：聊天门禁影响面试/报告页可达性。
   回滚：门禁只作用 Step1-2，不改 Step3-6 原路由。
4. 风险：Step2 画像入库数据异常（AI 输出格式错误/字段缺失导致 JSON 损坏）。
   缓解：入库前增加 JSON Schema 校验；校验失败时保留原始文本并提示用户重试，不覆盖已有画像。
5. 风险：上传不入库策略切换期，用户误以为“上传内容丢失”。
   缓解：在 Step1-3 增加明确提示“上传内容已用于画像抽取，诊断后才生成并保存简历版本”。
6. 风险（已关闭）：画像编辑器与简历编辑器第二阶段融合导致编辑体验回归。
   现状：该项已按产品决策取消（见 §4.3.1），风险随待办下线同步关闭。
7. 风险：移除面试模式后，历史缓存键包含 `simple/comprehensive` 导致会话错配。
   缓解：读取层保留 mode 兼容解析；新写入不再依赖 mode，统一归一到单一流程键。
8. 风险：`hr` 改名 `pressure` 导致旧数据/埋点口径断裂。
   缓解：数据读取时做 `hr -> pressure` 映射，并在埋点层保留一版迁移映射统计。
9. 风险：历史 `factItems/atomicTags` 派生数据仍可能对展示层造成噪音或字段污染。
   缓解：保持“主字段优先 + 派生不反写主字段”，并在展示层增加防污染过滤与回归测试。
10. 风险：主字段入库校验缺失时，跨端写入可能出现结构漂移。
    缓解：补充主字段 JSON Schema 校验与容错回退，写入失败时不覆盖旧画像并记录可追踪日志。

### 8.1 旧逻辑收口状态（2026-03-11）

已修复：
1. `CareerProfile` 同页混合“上传入口 + 画像输入”旧逻辑已拆除：
   - 现状：强引导 Step1 统一为 `/career-profile/upload` 固定三段流程；提交后默认进入 `/career-profile/result/summary`。
2. Step1 路由双口径已收口：
   - 现状：`View.CAREER_PROFILE`、`guidedFlowStepToPath(step1)`、硬门禁回跳均统一到 `/career-profile/upload`。
   - 兼容：`/career-profile` 仅保留历史入口兼容并自动跳转。
3. Step1 旧 fallback 路径已修正：
   - 现状：`guidedFlowStepToPath` 默认 fallback 已从 `/career-profile` 更新为 `/career-profile/upload`。
4. 诊断旧强制跳转 key 已降级为“仅清理，不参与逻辑”：
   - 现状：`ai_analysis_force_resume_select`、`ai_result_wait_resume_select` 不再作为诊断流程读取条件。
   - 收益：老缓存不会再触发“强制回旧入口/旧分支”。
5. 面试 `jd_input` 渲染分支已收口：
   - 现状：`step-renderer` 仅以 `interview_scene` 渲染面试场景页。
   - 兼容：若历史会话回到 `jd_input`，会先在 UI 层归一到 `interview_scene`。
6. 职业画像独立旧页已下线：
   - 现状：`CareerProfileLegacyInputPage` 已删除，画像流程收口至“融合输入 -> 追问补充 -> 总结（编辑可选）”。
7. 简历入口收口：
   - 现状：`AllResumes` 顶部“新建简历”按钮已下线；后续补充新简历入口已收口到画像总结页“AI 引导深度完善”（上传能力在融合页内）。
   - 现状：`CareerProfileStructuredEditor` 编辑态已移除“上传新简历”按钮与导入弹窗，编辑页只保留画像字段维护。
   - 影响：上传动作只在 Step1 融合输入页触发，避免“编辑页再上传”造成流程分叉。
8. Step3 必填口径已统一（前端）：
   - 现状：`generic/targeted` 两种模式下“目标岗位”均为必填，`targeted` 仍额外要求 JD。
   - 验收：`scripts/test-online.ps1 -RunGuidedFlowUiSmoke` 已补充 Step3 generic/targeted 分支断言（角色必填 + JD 必填组合）。
9. Step3 目标岗位写库口径已补齐（前端数据层）：
   - 现状：诊断链 `generic/targeted` 均会将目标岗位写入 `targetRole`，并与 `targetCompany` 兼容共存。
   - 影响：同一用户在 targeted 下填写的目标岗位可被后续报告/复用链稳定恢复。
10. 诊断会话与本地快照已补 `targetRole`（兼容读写）：
   - 现状：`analysisSessionByJd` 会话快照与 `ai_last_analysis_snapshot` 在写入时同步携带 `targetRole`。
   - 恢复口径：报告恢复页优先使用 `targetRole` 回填 Step3 目标岗位，`targetCompany` 保留兼容回退。
11. 诊断步骤 checkpoint 写入口径已补 `targetRole`：
   - 现状：`useAnalysisStepCheckpoint` 在 `jd_ready/analyzing/report_ready` 持久化时同步写入 `targetRole`，避免仅写 `targetCompany` 导致的语义漂移。
   - 影响：诊断中断恢复时，Step3 目标岗位回填与会话快照字段口径保持一致。
12. 诊断结果快照构建口径已补 `effectiveTargetRole`：
   - 现状：`buildAnalysisResultSnapshot` 明确返回 `effectiveTargetRole`，`useAnalysisExecution` 在 `snapshot/saveLastAnalysis/report_ready` 持久化时统一复用该值。
   - 影响：减少 `targetCompany -> targetRole` 的重复拼装逻辑，降低诊断链字段偏移风险。
13. 诊断复用快照口径已补 `targetRole`：
   - 现状：`analysis-reuse` 的复用快照结果新增 `targetRole`，并在读取时优先消费 `targetRole`（兼容回退 `targetCompany`）。
   - 影响：同 JD 复用历史报告时，Step3 目标岗位恢复与会话持久化字段口径进一步一致。
14. 测试阶段硬切：诊断链停止 `targetCompany` 回退：
   - 现状：`target-role`、`analysis-reuse`、`report-snapshot-restore`、`resume-selection`、`analysis-execution-result`、`useAnalysisExecution`、`useAnalysisPersistence`、`useAnalysisStepCheckpoint`、`useOptimizedResumeStore` 与分析请求链路已改为“诊断只认 `targetRole`，不再回退 `targetCompany`”。
   - 影响：旧诊断快照若仅有 `targetCompany` 将不再自动恢复目标岗位（符合测试阶段“无需兼容旧历史”决策）。
15. Step3 回退入口补齐（诊断报告链）：
   - 现状：`final_report` 与 `comparison` 页头均已提供“返回 Step3”入口，统一回到 `jd_input` 做岗位/JD 重填。
   - 影响：用户在报告阶段可直接重开一轮诊断，不必绕路返回上游页面。
16. 画像流程页面去“强引导 Step”卡片（UI 收口）：
   - 现状：`GuidedCareerProfileFusionStep` 与 `CareerProfileResult` 顶部步骤卡片已删除，保留正文输入区与轻量提示文案。
   - 影响：页面视觉更轻量，减少重复引导信息。
17. Dashboard 步骤编号文案收口：
   - 现状：主流程卡 CTA 从“进入第4步”统一为“继续”，不再暴露步骤编号。
   - 影响：用户感知从“编号驱动”转为“动作驱动”。
18. 新用户职业画像卡片显示策略收口：
   - 现状：`latestCareerProfile` 为空且简历数为 0 时，Dashboard 不渲染 `CareerProfileEntryCard`。
   - 影响：新注册用户首页更聚焦，避免并列入口干扰。
19. 新用户卡片可回归测试已补齐：
   - 现状：新增 `dashboard-card-visibility` 纯函数与单测，覆盖“新用户隐藏卡片 / 已有画像显示卡片 / 有简历显示卡片”三种场景。
   - 影响：后续 Dashboard 重构时可防止“新用户误显职业画像卡片”回归。
20. 在线 UI smoke 已补面试场景链路：
   - 现状：`scripts/test-online.ps1 -RunGuidedFlowUiSmoke` 已包含 `/ai-interview` 下 `resume_select -> interview_scene` 断言。
   - 影响：Step6 入口关键链路具备在线自动化验收抓手。
21. 画像字段单一映射第一阶段已收口：
   - 现状：画像编辑已完成“编辑态直改 `draftProfile` + 保存直持久化优先”，并修复 MBTI/约束污染、atomic 回灌等一致性问题。
   - 影响：减少跨结构回写导致的字段错位，用户编辑结果与展示更一致。

待继续收口：
1. 字段一致性回归仍需持续补齐：
   - 现状：主链路已切到单一映射，但历史脏数据与派生字段仍可能触发个别展示偏差。
   - 风险：若缺少持续回归用例，后续改动可能复发“字段错位/回弹”。
2. 历史会话恢复线上 e2e 仍待补齐：
   - 现状：已有 `interview-session-step-migration` 单测与 smoke 断言，但缺“真实历史会话恢复后自动落到 `interview_scene`”的端到端在线回归。
   - 风险：兼容分支回归问题可能在灰度环境后置暴露。
3. 主字段写入校验观测仍需完善：
   - 现状：主字段写入校验与失败日志字段路径已上线，灰度看板与告警阈值尚待补齐。
   - 风险：线上波动发现滞后，跨端排障效率受限。

## 9. 当前阶段明确不做

1. 自动抓取 BOSS/拉勾等平台 JD。
2. 自动投递与账号托管。
3. 脱离用户事实的“包装性虚构改写”。

## 10. 下一步开发步骤（按优先级）

### 10.1 P0（本周必须完成）

1. 上传策略改造（后端 API 层一致化）：
   - 已完成：前端数据层 + 后端 API 层一致约束均已落地（非诊断产物阻断入库）。
   - 待验证：线上灰度环境中补齐“上传不入库提示文案”的用户反馈确认。
2. 画像编辑主字段单一映射收口（持续项）：
   - 已完成：编辑态字段映射改为直改 `draftProfile`（`personalInfo/summary/targetRole/jobDirection/experiences/projects/educations`），保存链路改为 `draftProfile` 直持久化优先，减少 `resumeData/extras` 中转。
   - 最新进展（2026-03-11）：已完成 MBTI 编辑态回填一致化与 personality 清洗；已完成编辑器输入框与基础信息模块样式统一。
   - 本周待收口：
     - 字段唯一归属全链路去重（同一值不重复落多字段）；
     - 历史脏数据兼容清理与派生数据防回灌；
     - 补齐“编辑态 -> 存储 -> 展示”回归脚本。
3. 清理旧步骤语义债务（兼容收口）：
   - 已完成：面试恢复层下线 legacy `jd_input` 分支并统一 `interview_scene`（`f49fd12`）。
   - 已完成：诊断链路移除 `resume_select` 冗余恢复路径（`5f5914c`）。
   - 后续：仅保留最小只读兼容与灰度观测。
4. 统一 Step3 字段语义：
   - 已完成：前端 UI/校验、诊断持久化层、诊断会话快照、本地恢复、步骤 checkpoint、结果快照构建与复用快照口径统一到“目标岗位必填 + 写入 targetRole”。
   - 已完成：`targetCompany -> targetRole` 前后端命名迁移（含相关测试）主链路收口（`83ee0bd`）。
   - 后续：旧命名仅保留只读兼容，不再新增写入。
5. 增补自动化覆盖：
   - 已完成：`scripts/test-online.ps1` 已增加面试 `resume_select -> interview_scene` 分支断言（`/ai-interview` 可达、生成简历可选、场景页与面试类型控件可见）。
   - 已完成：上传融合链路已补第一条关键断言（`AI解析` 后追问出现，清空输入后追问仍保持可见，提交按钮按门禁禁用）。
   - 已完成：上传后追问补齐画像（上传简历 -> AI解析 -> 追问补充）专项断言（采用 parse-resume mock，避免在线环境 AI 依赖抖动）。
   - 已完成：旧 `jd_input` 会话迁移单测（`interview-session-step-migration.test.ts`）与恢复层归一函数抽离。
   - 待完成：补一组线上 UI e2e 回归，覆盖“历史会话恢复后自动落到 `interview_scene`”的端到端路径。
6. 面试场景收口验收回归：
   - 前后端统一回归 `pressure` 提示词与题单规则。
   - 兼容：旧 `hr` / `interviewMode` 会话可读、可恢复，但不再产生新写入。
7. 派生数据策略收口（后端/数据层）：
   - `factItems/atomicTags` 仅保留兼容读写与派生用途，不新增治理能力开发。
   - 写入链路保持“主字段优先、派生不反写主字段”，并保留最小观测日志用于排障。
8. 画像总结页编辑策略收口（持续收口）：
   - “关键确认”模块已删除，统一走结构编辑器。
   - 新增规则：若总结区内容包含其他字段拼接/推断信息，则总结区改为只读，不允许直接编辑。
   - 用户需在对应源字段修改，保存后再回流到总结展示。
9. 预览页编辑闭环（二期收口，新增）：
   - 已完成：预览画布就地编辑、新增条目、自动聚焦、撤销/前进、编辑入口并入 Preview。
   - 待完成：补“字段级脏标识 + 跨模板一致性回归 + 导出前编辑态守卫”三项验收脚本，避免线上回归。
10. AI 诊断技能质量收口（已完成）：
   - 已完成：后端 `skill_cleanup_service` 统一技能去重/过滤/上限（默认 10）。
   - 已完成：前端展示前与落库前接入 `sanitizeResumeSkills` 双守卫，防止技能过多与重复回归。
11. AI 诊断 JD 定向一致性与性能收口（已完成）：
   - 已完成：前端按 `analysisMode + jdKey + targetRole` 隔离复用上下文，避免空 JD 与有 JD 误复用同结果。
   - 已完成：后端增加 `analyze timings` 观测并下调 `final_report` 非必要二次生成开销，报告生成耗时显著下降。
   - 已完成：定向提示词主叙事收口为“JD 匹配差距 + 定向改写策略”。

### 10.2 P1（随后一周）

1. Step2 定向追问卡片（非聊天窗）产品化收口（已完成，`19ce78c`）。
2. Step5 精修产品化收口（已完成，`e8b3b5e`）：
   - 选区定点改写
   - 事实边界提示
   - 手工编辑与 AI 改写一致性回写
3. 低匹配策略第一阶段（已完成，`256651e`）：
   - 诊断输入/报告链路新增 Low/Medium/High 风险等级呈现
   - 提供“转 generic”快捷路径（保持原流程兼容）
4. 字段一致性回归自动化：
   - 增补“编辑态 -> 存储 -> 总览展示”字段一致性回归用例（覆盖 MBTI/性别/求职意向等高频字段）。
   - 增补“同值不重复落多字段”与“总结区派生内容只读守卫”回归断言。
   - 增补“派生数据不反写主字段”回归断言，避免历史数据回灌。
5. 画像主字段校验灰度观测收口：
   - 基于已上线 Schema 校验日志（count/paths/types）补齐看板与告警阈值。

说明：
- “画像编辑器与简历编辑器第二阶段融合”已取消，不再作为 P1 待办。
- “画像入库 Schema 校验加固（主字段优先）”已在 v6.27 完成代码与测试闭环。

### 10.2.1 计划书剩余未完成清单（按模块/文件）

**P0（当前仍未完成）**
1. 画像字段单一映射稳定性收口：
   - 模块：`ai-resume-builder/components/screens/career-profile/CareerProfileStructuredEditor.tsx`、`ai-resume-builder/components/screens/career-profile/summary-display-logic.ts`、`ai-resume-builder/components/screens/career-profile/career-profile-editor-draft.ts`
   - 缺口：字段一致性巡检（编辑态 -> 存储 -> 展示）、字段唯一归属去重（同一值不重复落多字段）、总结区派生内容只读守卫、历史脏数据兼容、派生数据回灌防护。
2. 历史会话恢复端到端回归补齐：
   - 脚本：`scripts/test-online.ps1`（GuidedFlow UI smoke 扩展）
   - 缺口：补“历史会话恢复自动落到 `interview_scene`”线上 e2e 断言。
3. 画像主字段入库校验观测补齐：
   - 模块：日志平台/看板接线（基于 `backend/services/payload_sanitizer.py` 已输出的稳定校验字段）。
   - 缺口：补灰度监控看板与告警阈值。

**近期已收口（从 P0 移出，2026-03-09）**
1. JD 上下文复用误命中：
   - 已完成：复用键补齐 `analysisMode + jdKey + targetRole`，并强化会话/快照恢复校验，阻断空 JD 与有 JD 结果串用。
   - 相关提交：`8559930`。
2. 定向报告口径与性能：
   - 已完成：定向提示词收口为“JD 匹配差距 + 定向改写策略”；`analyze` 增加阶段计时并下调 `final_report` 非必要二次生成开销。
   - 相关提交：`46cb556`。
3. JD 定向链路自动化回归：
   - 已完成：补齐后端 JD 定向提示词/关键词对齐相关测试。
   - 相关提交：`bb91310`。

**近期已收口（从 P0/P1 移出，2026-03-11）**
1. CareerProfileResult 导航条恢复与图标一致化：
   - 已完成：恢复 icon-only 导航、区分导航条与页头层级、统一图标与锚点 id 口径。
   - 相关提交：`3427ab5`、`45aac4e`、`ab7bd1d`。
2. P0/P1/P2 UI 优化项（结果页与主流程文案）串联收口：
   - 已完成：状态反馈、CTA 语义、信息密度与文案中性化优化。
   - 相关提交：`6430a83`、`a849d3b`、`c1e6aa3`、`e55ffa1`、`115df8d`。
3. 编辑器输入框样式统一 + 基础信息模块样式统一：
   - 已完成：输入控件统一卡片风格，基础信息模块按“无底色 + 样式一致”收口。
   - 相关提交：`f076ea0`、`f6d6211`、`599c596`、`9a9796f`。
4. MBTI 编辑态回填一致化与 personality 清洗：
   - 已完成：MBTI hydration 统一与清洗逻辑上线，并补齐回归测试。
   - 相关提交：`2e86e37`。
5. 旧语义兼容债务主链路收口：
   - 已完成：下线 `jd_input` legacy 恢复分支、移除诊断 `resume_select` 冗余路径、完成 `targetRole` 迁移。
   - 相关提交：`f49fd12`、`5f5914c`、`83ee0bd`。
6. v6.26 剩余清单三项收口：
   - 已完成：A 组工程化测试/观测补齐、Step5 选区改写边界收口、Step2 追问入口语义统一。
   - 相关提交：`accad3a`、`e8b3b5e`、`19ce78c`。
7. 近期关键 UI 修复：
   - 已完成：去除“跳过并生成”提示、预览页编辑态滚动修复、AllResumes 菜单层级修复。
   - 相关提交：`c2ce204`、`9d55689`、`ab3572c`。
8. 画像入库 Schema 校验加固（主字段优先）：
   - 已完成：主字段/factItems 校验日志补齐稳定字段路径（count/paths/types），失败回退保持“不覆盖旧画像”。
   - 相关提交：`v6.27`（本轮提交）。
9. 低匹配策略第一阶段（输入/报告风险等级 + generic 快捷路径）：
   - 已完成：Step3 输入页与报告页新增 Low/Medium/High 风险等级呈现；targeted 中风险/高风险场景可一键切换到 generic。
   - 相关提交：`256651e`。

**P1（随后一周）**
1. 字段一致性与派生兼容回归（冲突防回归）：
   - 模块：`ai-resume-builder/components/screens/career-profile/*`、`ai-resume-builder/src/__tests__/*career-profile*`。
   - 范围：同值去重、总结区只读守卫、派生不反写主字段。
2. 主字段 Schema 校验灰度观测：
   - 模块：`backend/services/payload_sanitizer.py`、`backend/tests/test_career_profile_service.py`、日志/看板接线。

说明：
- `Step2 定向追问卡片产品化` 已完成（`19ce78c`），不再列入未完成。
- `Step5 精修产品化收口` 已完成（`e8b3b5e`），不再列入未完成。
- `低匹配策略第一阶段（风险等级 + generic 快捷路径）` 已完成（`256651e`），不再列入未完成。
- `画像入库 Schema 校验加固（主字段优先）` 已在 v6.27 完成，不再列入未完成。
- `画像编辑器与简历编辑器第二阶段融合` 已取消，不再列入未完成。

### 10.3 P2（中期）

1. 独立职业规划咨询入口（`/career-planning`）与会话隔离。
2. 漏斗与质量埋点（Step3 模式分流、Step5->6 转化、复用/重生成选择占比）。
3. Agent 与主链路的观测桥接（保持不抢主流程）。

### 10.4 验收闸门（执行顺序）

1. 先过本地：`pwsh -File scripts/test-local.ps1 -SkipInstall`。
2. 再过在线：`pwsh -File scripts/test-online.ps1 -FrontendUrl <url> -BackendUrl <url> -RunAiMainflowApiSmoke -RunGuidedFlowUiSmoke`。
3. 最后按 smoke 清单补齐手工证据：低匹配、多 JD 回访、旧会话迁移、上传策略改造。

### 10.5 本周精简行动清单（2026-03-11）

1. 补齐“历史会话恢复 -> 自动落到 `interview_scene`”线上 e2e 断言并纳入 `RunGuidedFlowUiSmoke`。
2. 对画像主字段写入校验补灰度观测面板与告警阈值（日志字段路径已在 v6.27 补齐）。
3. 补齐字段一致性回归：`MBTI/人格`、基础信息、求职意向三组高频字段。
4. （已完成）Step2 定向追问卡片产品化（`19ce78c`）。
5. （已完成）Step5 精修产品化收口（`e8b3b5e`）。
6. （已完成）低匹配策略第一阶段：风险等级 + generic 快捷路径（`256651e`）。

---

## 附录 A：一句话原则

先把“用户一定能走完主线”做扎实，再用对话增强关键节点体验。
