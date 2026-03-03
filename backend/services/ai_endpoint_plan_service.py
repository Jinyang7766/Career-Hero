import re


def _normalize_interview_type(value):
    text = str(value or "").strip().lower()
    if text == "technical":
        return "technical"
    if text in ("pressure", "hr"):
        return "pressure"
    return "general"


def _clamp_int(value, default_value, minimum, maximum):
    try:
        number = int(value)
    except Exception:
        number = int(default_value)
    return max(minimum, min(maximum, number))


def generate_interview_plan_response(
    *,
    deps,
    interview_type,
    interview_mode,
    question_limit,
    plan_generation_limit,
    interview_focus,
    job_description,
    resume_data,
    diagnosis_context,
):
    # interview_mode is intentionally retained for backward compatibility, but
    # prompt and generation logic now follow a single standard interview flow.
    _ = interview_mode

    interview_type = _normalize_interview_type(interview_type)
    question_limit = _clamp_int(question_limit, 12, 3, 12)
    plan_generation_limit = _clamp_int(plan_generation_limit, question_limit, 3, question_limit)
    min_count = 4 if question_limit > 3 else 3

    self_intro_re = re.compile(r"(自我介绍|介绍一下你自己|简单介绍一下自己)")
    warmup_by_type = {
        "general": "请先做一个1分钟的自我介绍，重点突出与你目标岗位最相关的经历与优势。",
        "technical": "你最引以为傲的职业成就是什么？或者一个你最近解决过的棘手问题是什么？",
        "pressure": "请讲一次高压场景下你做出关键取舍的经历，并说明你的判断依据与结果。",
    }
    warmup_question = warmup_by_type.get(interview_type, warmup_by_type["general"])
    warmup_pattern_by_type = {
        "general": re.compile(r"(自我介绍|介绍一下你自己|简单介绍一下自己)"),
        "technical": re.compile(r"(最引以为傲.*职业成就|最近解决.*棘手问题)"),
        "pressure": re.compile(r"(高压场景|关键取舍|判断依据|结果)"),
    }
    warmup_pattern = warmup_pattern_by_type.get(interview_type, warmup_pattern_by_type["general"])

    def _normalize_question_text(value):
        text = str(value or "").strip().lower()
        return re.sub(r"[\s\.,;:!?，。！？；：、（）()\[\]{}<>《》“”\"'`~\-—_]+", "", text)

    def _looks_like_warmup_question(value):
        question = str(value or "").strip()
        if not question:
            return False
        if warmup_pattern.search(question):
            return True
        normalized_question = _normalize_question_text(question)
        normalized_warmup = _normalize_question_text(warmup_question)
        if not normalized_question or not normalized_warmup:
            return False
        if normalized_question == normalized_warmup:
            return True
        return (normalized_question in normalized_warmup) or (normalized_warmup in normalized_question)

    default_questions_by_type = {
        "general": [
            "请介绍一个你最有代表性的项目，并说明你的具体职责。",
            "这个项目的关键挑战是什么？你是如何解决的？",
            "请分享一次跨团队协作推进结果的案例。",
            "请讲一个你做过关键决策的场景，并说明你的判断依据。",
            "如果再做一次，你会如何优化？",
            "你为什么想加入这个岗位/公司？你的3个月目标是什么？",
            "请补充一个能体现你岗位匹配度的经历或成果。",
        ],
        "technical": [
            "请详细介绍一个你主导的核心项目，并说明你负责的技术模块。",
            "这个项目在技术实现上最难的点是什么？你是如何攻克的？",
            "你做过哪些性能、稳定性或成本优化？请给出量化结果。",
            "请讲一次线上故障排查经历，你的定位过程和修复策略是什么？",
            "如果业务规模翻倍，你会如何改造当前架构？",
            "你如何保障代码质量、可维护性和团队协作效率？",
            "回看这个项目，你认为最大的技术遗憾与改进方向是什么？",
        ],
        "pressure": [
            "请讲一次你在时间和资源都不足时完成关键目标的案例，重点说明你的取舍逻辑。",
            "面对上级质疑你的方案时，你如何在压力下沟通并推动执行？",
            "请复盘一次结果不达预期的经历：你承担了什么责任，后续如何补救？",
            "如果同一时间有两个高优先级任务冲突，你如何判断先后顺序？",
            "请举例说明一次跨团队冲突中你如何控制情绪并达成协作。",
            "请讲一次你在信息不完整时做出决策的经历，以及你如何降低风险。",
            "如果再次遇到类似高压场景，你会提前做哪些防御性准备？",
        ],
    }
    default_questions = default_questions_by_type.get(interview_type, default_questions_by_type["general"])

    def _sanitize_plan_questions(items, *, expected_min=min_count, max_count=plan_generation_limit):
        sanitized = []
        for item in (items or []):
            question = str(item or "").strip()
            if not question:
                continue
            if self_intro_re.search(question):
                continue
            if _looks_like_warmup_question(question):
                continue
            if question in sanitized:
                continue
            sanitized.append(question)
            if len(sanitized) >= max_count:
                break
        if len(sanitized) < expected_min:
            for fallback_question in default_questions:
                if self_intro_re.search(fallback_question):
                    continue
                if fallback_question in sanitized:
                    continue
                sanitized.append(fallback_question)
                if len(sanitized) >= expected_min:
                    break
        return sanitized[:max_count]

    if not (deps["gemini_client"] and deps["check_gemini_quota"]()):
        return {
            "success": True,
            "questions": _sanitize_plan_questions(default_questions, expected_min=min_count, max_count=plan_generation_limit),
            "coverage": ["岗位匹配", "项目经历", "问题解决", "协作沟通", "复盘优化", "高压应对"],
            "planSource": "fallback_quota_or_config",
            "modelAvailable": bool(deps["gemini_client"]),
        }, 200

    try:
        role_hint = {
            "technical": "技术面（项目深挖）",
            "pressure": "压力面（高压场景）",
            "general": "初试（综合基础面）",
        }.get(interview_type, "初试（综合基础面）")
        prompt = f"""
你是一位资深面试官，请为候选人生成一套“完整且不重复”的模拟面试题单。
要求：
- 面试类型：{role_hint}
- 采用标准模式：输出完整、真实、可执行的面试深挖题单，不区分简单/全面模式。
- 本次仅需生成：{plan_generation_limit}道“核心深挖题”（热身题由系统固定添加，不需要你生成）
- 结合岗位职位描述与候选人简历定制，问题要具体。
- 一次性给出全部题目，必须严格等于要求题量，不得多也不得少。
- 题目顺序要从浅入深，覆盖面完整，避免语义重复。
- 严禁出现“自我介绍”相关题目（例如“请做自我介绍/介绍一下你自己”）。
- 严禁生成与本场热身题重合或近似的题目。本场热身题为：{warmup_question}
- 压力面场景必须体现高压追问、优先级取舍、冲突应对、失败复盘中的至少两个维度。
- 如果提供了“训练重点”，请优先围绕该重点出题：{interview_focus if interview_focus else '未提供'}
- 仅输出 JSON，不要任何解释文字。
- JSON 格式：
{{
  "questions": ["问题1", "问题2", "..."],
  "coverage": ["覆盖点1", "覆盖点2", "..."]
}}

职位描述：{job_description if job_description else '未提供'}
简历信息：{deps['format_resume_for_ai'](resume_data) if resume_data else '未提供'}
诊断档案：{diagnosis_context if diagnosis_context else '未提供'}
"""
        response, _used = deps["_gemini_generate_content_resilient"](
            deps["GEMINI_INTERVIEW_MODEL"], prompt, want_json=False
        )
        raw_text = (response.text or "").strip()
        parsed = deps["_parse_json_object_from_text"](raw_text)
        questions = []
        coverage = []
        if isinstance(parsed, dict):
            parsed_questions = parsed.get("questions")
            parsed_coverage = parsed.get("coverage")
            if isinstance(parsed_questions, list):
                questions = [str(item).strip() for item in parsed_questions if str(item).strip()]
            if isinstance(parsed_coverage, list):
                coverage = [str(item).strip() for item in parsed_coverage if str(item).strip()]
        questions = _sanitize_plan_questions(
            questions or default_questions,
            expected_min=min_count,
            max_count=plan_generation_limit,
        )
        return {
            "success": True,
            "questions": questions,
            "coverage": coverage,
            "planSource": "model",
            "modelAvailable": True,
        }, 200
    except Exception as error:
        deps["logger"].warning("Interview plan generation failed: %s", error)
        return {
            "success": True,
            "questions": _sanitize_plan_questions(default_questions, expected_min=min_count, max_count=plan_generation_limit),
            "coverage": ["岗位匹配", "项目经历", "问题解决", "协作沟通", "复盘优化", "高压应对"],
            "planSource": "fallback_error",
            "modelAvailable": True,
        }, 200
