# Career Profile 主字段校验灰度观测 Runbook

- 版本：v6.28
- 目标：收口 `career_profile.main_fields.validation_failed` / `career_profile.fact_items.validation_failed` 的看板与告警接线。

## 1) 代码侧已落地输出

校验失败日志 extra 中统一输出以下字段（后端）：

- `validation_scope`：`main_fields` / `fact_items`
- `validation_metric_version`：默认 `v1`（可用 env 覆盖）
- `validation_error_count`
- `validation_error_paths`
- `validation_error_types`
- `validation_alert_warn_count`
- `validation_alert_critical_count`
- `validation_alert_level`：`ok | info | warn | critical`

关联事件：

- `career_profile.main_fields.validation_failed`
- `career_profile.fact_items.validation_failed`

## 2) 阈值配置（环境变量）

全局阈值：

- `CAREER_PROFILE_VALIDATION_ALERT_WARN_COUNT`（默认 `1`）
- `CAREER_PROFILE_VALIDATION_ALERT_CRITICAL_COUNT`（默认 `3`）

按 scope 覆盖（可选）：

- `CAREER_PROFILE_VALIDATION_MAIN_FIELDS_ALERT_WARN_COUNT`
- `CAREER_PROFILE_VALIDATION_MAIN_FIELDS_ALERT_CRITICAL_COUNT`
- `CAREER_PROFILE_VALIDATION_FACT_ITEMS_ALERT_WARN_COUNT`
- `CAREER_PROFILE_VALIDATION_FACT_ITEMS_ALERT_CRITICAL_COUNT`

版本标记：

- `CAREER_PROFILE_VALIDATION_METRIC_VERSION`（默认 `v1`）

## 3) 外部平台接线清单（操作步骤）

1. **日志索引字段映射**
   - 将上述 8 个 `validation_*` 字段设为可检索字段（keyword / numeric / array）。
2. **看板面板**（至少 4 个）
   - 事件总量：按 `event` + `validation_scope` 分组。
   - 错误路径 TopN：`validation_error_paths` 展开后聚合。
   - 错误类型分布：`validation_error_types` 聚合。
   - 告警等级趋势：`validation_alert_level` 按时间堆叠。
3. **告警规则**
   - 规则 A（高优先）：`validation_alert_level=critical` 在 10 分钟内 >= 3 条。
   - 规则 B（灰度观察）：`validation_alert_level=warn` 连续 30 分钟不降。
   - 规则 C（回归兜底）：`main_fields` 事件量相对过去 24h 基线提升 > 2x。
4. **通知路由**
   - A/B 发到 on-call；C 发到研发群（低优先）。
5. **灰度验收**
   - 发布后 24h、72h 各做一次回看：
     - Top paths 是否集中在预期字段；
     - `critical` 是否可解释；
     - 是否需要调高/调低阈值。

## 4) 推荐查询（示例）

> 按你的日志平台语法改写，关键是字段一致。

- 主字段失败趋势：
  - `event:"career_profile.main_fields.validation_failed"`
- factItems 失败趋势：
  - `event:"career_profile.fact_items.validation_failed"`
- 只看高风险：
  - `validation_alert_level:"critical"`
- 指定路径回归：
  - `validation_error_paths:*resumeData.careerProfile.experiences*`
