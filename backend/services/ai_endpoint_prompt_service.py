import re

ANALYSIS_PROMPT_VERSION = "analysis-v2.3"

def _resolve_follow_up_question(ai_result, job_description):
    question = str((ai_result or {}).get('followUpQuestion') or '').strip()
    if question:
        return question

    weaknesses = [str(x).strip() for x in ((ai_result or {}).get('weaknesses') or []) if str(x).strip()]
    missing_keywords = [str(x).strip() for x in ((ai_result or {}).get('missingKeywords') or []) if str(x).strip()]
    jd_hint = '，并结合目标岗位要求' if str(job_description or '').strip() else ''

    if weaknesses:
        return f"你提到简历中“{weaknesses[0]}”较薄弱。请给我一个最能证明你能力的具体案例{jd_hint}，并补充你采取了什么行动、最终结果数据是多少？"
    if missing_keywords:
        return f"你的简历与岗位存在关键词缺口（如：{missing_keywords[0]}）。请补充一段真实经历{jd_hint}，说明你如何使用这项能力并带来可量化结果。"
    return "请先补充一条与你目标岗位最相关的真实经历：你具体做了什么、用了什么方法、最终结果如何（尽量给出数据）？"


def _build_analysis_prompt(
    *,
    resume_data,
    job_description,
    rag_context,
    format_resume_for_ai,
    analysis_stage='pre_interview',
    interview_summary='',
    interview_chat_history='',
    diagnosis_context='',
    career_profile_context='',
):
    stage = str(analysis_stage or '').strip().lower()
    if stage == 'pre_interview':
        if job_description:
            return f"""
你是一位严格的资深简历诊断顾问。当前处于“诊断预评估”阶段，只需给出粗粒度评价，不做详细改写。
要求：
1) 只输出总体判断、分维度评分、亮点与短板，不生成逐条优化建议。
2) `suggestions` 必须返回空数组 []。
3) 总结控制在 80~150 字，语气客观。
4) 可给出缺失关键词（missingKeywords），数量最多 5 个，不要给可直接替换的改写文本。
5) summary 中禁止出现“建议/可改为/补充为/优化为”等措辞，只做现状判断。
6) 返回合法 JSON，字段值中文；所有 key 必须完整返回，不得省略。
7) 事实来源仅允许：用户简历 + 用户职业画像。若信息不足，只能指出缺口，禁止臆造经历或结果。

简历：
{format_resume_for_ai(resume_data)}

用户职业画像（可能包含未写入简历的经历）：
{str(career_profile_context or '').strip() or '未提供'}

职位描述：
{job_description}

仅返回 JSON：
{{
  "score": 60,
  "scoreBreakdown": {{
    "experience": 58,
    "skills": 52,
    "format": 66
  }},
  "summary": "诊断预评估总结",
  "targetRole": "目标岗位名称，无法确定时返回空字符串",
  "targetRoleConfidence": 0.0,
  "strengths": ["亮点1", "亮点2"],
  "weaknesses": ["短板1", "短板2", "短板3"],
  "suggestions": [],
  "missingKeywords": ["关键词1", "关键词2"]
}}

{rag_context}
"""
        return f"""
你是一位严格的资深简历诊断顾问。当前处于“诊断预评估”阶段，只需给出粗粒度评价，不做详细改写。
要求：
1) 只输出总体判断、分维度评分、亮点与短板，不生成逐条优化建议。
2) `suggestions` 必须返回空数组 []。
3) 总结控制在 80~150 字，语气客观。
4) missingKeywords 最多 5 个。
5) summary 中禁止出现“建议/可改为/补充为/优化为”等措辞，只做现状判断。
6) 返回合法 JSON，字段值中文；所有 key 必须完整返回，不得省略。
7) 事实来源仅允许：用户简历 + 用户职业画像。若信息不足，只能指出缺口，禁止臆造经历或结果。

简历：
{format_resume_for_ai(resume_data)}

用户职业画像（可能包含未写入简历的经历）：
{str(career_profile_context or '').strip() or '未提供'}

仅返回 JSON：
{{
  "score": 60,
  "scoreBreakdown": {{
    "experience": 58,
    "skills": 52,
    "format": 66
  }},
  "summary": "诊断预评估总结",
  "targetRole": "",
  "targetRoleConfidence": 0.0,
  "strengths": ["亮点1", "亮点2"],
  "weaknesses": ["短板1", "短板2", "短板3"],
  "suggestions": [],
  "missingKeywords": []
}}

{rag_context}
"""

    is_final_stage = stage in {
        'final',
        'final_report',
        'final_optimization',
        'post_interview',
        'report',
        'optimization',
    }

    final_stage_requirements = """
15. 最终阶段必须明确“岗位关键任务的支撑缺口”，写入 weaknesses 与 suggestions。
16. reason 必须一句话直指缺口，禁止模板化空话与同义重复。
17. 无法确认数字时用中性结果口径，不得编造与占位符。
""" if is_final_stage else ""
    targeted_summary_requirements = """
18. 当提供 JD 时，summary 必须采用“JD匹配差距 + 定向改写策略”结构，禁止“简历整体好坏评价/打分点评”作为主叙事。
19. 当提供 JD 时，weaknesses 与 suggestions 必须优先描述“岗位职责锚点、关键词覆盖、证据缺口”，而非泛化的简历评价。
""" if bool(str(job_description or '').strip()) else ""
    format_requirements = f"""
输出规范（精简版）：
1. 仅返回合法 JSON，所有顶层字段必须返回；`score`/`scoreBreakdown` 为整数。
2. 评分表示“候选人综合匹配度”，不是排版分。`experience/skills/format` 按任务匹配、能力匹配、综合表现打分。
3. suggestions 仅保留高影响缺口，不得凑数量：
   - 高质量简历（score>=88 且无关键缺口）可返回 []；
   - 中等质量简历建议 1-2 条；
   - 有待加强简历建议 4-7 条，且覆盖最影响初筛的缺口。
4. 每条 suggestion 必须包含 id/type/title/reason/targetSection/suggestedValue。
5. targetSection 仅允许：summary、workExps、projects、skills、education、certificates。
6. suggestedValue 必须是可直接写入简历的终稿文本；禁止“建议/例如/示例/待补充”。
7. skills 的 suggestedValue 必须是硬技能名词数组；大模型同类统一为 `LLM`，禁止动作词与泛词。
8. 严禁基于占位符误判“信息缺失”；严禁性别偏见建议；严禁修改教育事实字段。
9. 若能识别目标岗位，填写 targetRole 与 0~1 的 targetRoleConfidence。
10. 批注建议遵循人工逻辑：先模块结论，再逐句问题；每条建议只对应一个问题。
11. 严禁重复输出同义建议；同一能力缺口只保留一条合并建议。
12. 当简历存在多个关键短板时，suggestions 需覆盖不同 targetSection（如 summary/workExps/skills），避免集中在单一模块。
13. 事实来源仅允许：用户简历、用户职业画像、补充对话内容（若有）。禁止凭空新增公司/项目/时间线/结果数据。
14. 若用户画像与简历信息冲突，优先保持“已明确可验证事实”，并在 reason 中提示信息冲突风险，不得自行拍板编造。
{final_stage_requirements}
{targeted_summary_requirements}
{rag_context}
"""

    final_context_block = ""
    if is_final_stage:
        final_context_block = f"""
最终报告补充上下文（仅用于事实校验与归纳，不得臆造）：
- 补充对话总结：
{str(interview_summary or '').strip() or '未提供'}
- 补充对话关键内容：
{str(interview_chat_history or '').strip() or '未提供'}
- 用户画像（历史诊断档案）：
{str(diagnosis_context or '').strip() or '未提供'}
- 用户职业画像（用户手动补充，可能包含未写入简历经历）：
{str(career_profile_context or '').strip() or '未提供'}
"""
    else:
        final_context_block = f"""
用户职业画像（用户手动补充，可能包含未写入简历经历）：
{str(career_profile_context or '').strip() or '未提供'}
"""

    if job_description:
        return f"""
请扮演**严格的资深简历诊断顾问**，以“通过初筛”为目标，**严格对照 职位描述 与简历逐条核对**，输出“高影响、低冗余”的优化建议（数量由简历质量决定）。
请使用中文输出，字段值必须为中文。

口径要求（JD 定向模式，强制）：
- 主叙事必须聚焦“JD 匹配差距 + 定向改写策略”。
- 禁止把“简历整体好坏点评”作为主要内容。
- 若保留分数，仅作匹配度指标，不要在 summary 中展开“简历被评价”措辞。

评分标准（总分100，候选人综合匹配度评分）：
- 任务/经历匹配（40分，对应 scoreBreakdown.experience）：工作经历与职位描述关键任务的重合度、可验证案例支撑强度。
- 能力/技能匹配（35分，对应 scoreBreakdown.skills）：关键能力与技能（工具、方法、业务能力）覆盖率与深度。
- 综合表现质量（25分，对应 scoreBreakdown.format）：证据可信度、表达结构清晰度、沟通反馈（若有）与发展潜力。

简历：
{format_resume_for_ai(resume_data)}

职位描述：
{job_description}
{final_context_block}

请仅返回 JSON（仅中文内容）：
{{
  "score": 85,
  "scoreBreakdown": {{
    "experience": 35,
    "skills": 25,
    "format": 25
  }},
  "summary": "JD匹配差距与定向改写策略摘要（控制在100字以内）。",
  "targetRole": "目标岗位名称，无法确定时返回空字符串",
  "targetRoleConfidence": 0.0,
  "strengths": ["优势1", "优势2"],
  "weaknesses": ["不足1", "不足2"],
  "suggestions": [
    {{
      "id": "suggestion-1",
      "type": "optimization",
      "title": "工作经历优化",
      "reason": "建议补充更多可量化的业绩指标。",
      "targetSection": "workExps",
      "originalValue": "原内容",
      "suggestedValue": "在核心项目中通过优化算法重构关键链路，系统响应速度明显提升。"
    }},
    {{
      "id": "suggestion-skills",
      "type": "missing",
      "title": "核心技能补全",
      "reason": "职位描述对AI工程能力有很高要求，建议补齐相关技能。",
      "targetSection": "skills",
      "suggestedValue": ["Prompt Engineering", "RAG", "Agent 设计", "Vector DB"]
    }}
  ],
  "missingKeywords": ["关键词1", "关键词2"]
}}

{format_requirements}
"""

    return f"""
请扮演**严格的资深简历诊断顾问**，以“通过初筛”为目标，输出“高影响、低冗余”的优化建议（数量由简历质量决定）。
请使用中文输出，字段值必须为中文。

评分标准（总分100，候选人综合匹配度评分）：
- 任务/经历匹配（40分，对应 scoreBreakdown.experience）：经历与目标岗位任务的契合度、案例真实性与相关性。
- 能力/技能匹配（35分，对应 scoreBreakdown.skills）：关键能力、方法与技能栈的覆盖与深度。
- 综合表现质量（25分，对应 scoreBreakdown.format）：证据密度、表达结构、可迁移能力与潜力。

简历：
{format_resume_for_ai(resume_data)}
{final_context_block}

请仅返回 JSON（仅中文内容）：
{{
  "score": 75,
  "scoreBreakdown": {{
    "experience": 30,
    "skills": 20,
    "format": 25
  }},
  "summary": "候选人综合匹配度评估简述（控制在100字以内）。",
  "targetRole": "目标岗位名称，无法确定时返回空字符串",
  "targetRoleConfidence": 0.0,
  "strengths": ["优势1", "优势2"],
  "weaknesses": ["不足1", "不足2"],
  "suggestions": [
    {{
      "id": "suggestion-1",
      "type": "optimization",
      "title": "个人简介优化",
      "reason": "建议突出核心竞争力，让招聘方一眼看到你的价值。",
      "targetSection": "summary",
      "originalValue": "原内容",
      "suggestedValue": "具有5年Java开发经验，精通Spring Boot框架，曾主导千万级高并发系统设计..."
    }},
    {{
      "id": "suggestion-skills",
      "type": "missing",
      "title": "技能栈补全",
      "reason": "当前技能列表较单薄，建议补充与目标职位相关的专业技能。",
      "targetSection": "skills",
      "suggestedValue": ["Python", "数据可视化", "SQL", "项目管理"]
    }}
  ],
  "missingKeywords": []
}}

{format_requirements}
"""

