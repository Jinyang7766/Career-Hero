import re


def generate_interview_plan_response(*, deps, interview_type, interview_mode, question_limit, plan_generation_limit, interview_focus, job_description, resume_data, diagnosis_context):
    self_intro_re = re.compile(r'(自我介绍|介绍一下你自己|简单介绍一下自己)')
    warmup_by_type = {
        'general': '请先做一个1分钟的自我介绍，重点突出与你目标岗位最相关的经历与优势。',
        'technical': '你最引以为傲的职业成就是什么？或者一个你最近解决过的棘手问题是什么？',
        'hr': '请用三个关键词定义你的个人工作风格，并分别说明一个真实体现该关键词的例子。',
    }
    warmup_question = warmup_by_type.get(interview_type, warmup_by_type['general'])
    warmup_pattern_by_type = {
        'general': re.compile(r'(自我介绍|介绍一下你自己|简单介绍一下自己)'),
        'technical': re.compile(r'(最引以为傲.*职业成就|最近解决.*棘手问题)'),
        'hr': re.compile(r'(三个关键词.*工作风格|体现该关键词)'),
    }
    warmup_pattern = warmup_pattern_by_type.get(interview_type, warmup_pattern_by_type['general'])

    def _normalize_question_text(value):
        text = str(value or '').strip().lower()
        return re.sub(r'[\s\.,;:!?，。！？；：、（）()\[\]{}<>《》“”"\'`~\-—_]+', '', text)

    def _looks_like_warmup_question(value):
        q = str(value or '').strip()
        if not q:
            return False
        if warmup_pattern.search(q):
            return True
        nq = _normalize_question_text(q)
        nw = _normalize_question_text(warmup_question)
        if not nq or not nw:
            return False
        if nq == nw:
            return True
        return (nq in nw) or (nw in nq)

    default_questions_by_type = {
        'general': [
            '请介绍一个你最有代表性的项目，并说明你的具体职责。',
            '这个项目的关键挑战是什么？你是如何解决的？',
            '请分享一次跨团队协作推进结果的案例。',
            '请讲一个你做过关键决策的场景，并说明你的判断依据。',
            '如果再做一次，你会如何优化？',
            '你为什么想加入这个岗位/公司？你的3个月目标是什么？',
            '请补充一个能体现你岗位匹配度的经历或成果。',
        ],
        'technical': [
            '请详细介绍一个你主导的核心项目，并说明你负责的技术模块。',
            '这个项目在技术实现上最难的点是什么？你是如何攻克的？',
            '你做过哪些性能、稳定性或成本优化？请给出量化结果。',
            '请讲一次线上故障排查经历，你的定位过程和修复策略是什么？',
            '如果业务规模翻倍，你会如何改造当前架构？',
            '你如何保障代码质量、可维护性和团队协作效率？',
            '回看这个项目，你认为最大的技术遗憾与改进方向是什么？',
        ],
        'hr': [
            '请分享一次你与同事或上级出现分歧并达成一致的经历。',
            '在高压和紧急任务下，你如何保证交付质量？',
            '请讲一个你主动推动改进并拿到结果的案例。',
            '你选择这份工作的核心动机是什么？',
            '你如何规划接下来两年的职业发展？',
            '如果加入我们，你前3个月会如何快速融入并创造价值？',
            '请补充一个最能体现你稳定性与责任感的真实经历。',
        ],
    }
    default_questions = default_questions_by_type.get(interview_type, default_questions_by_type['general'])
    min_count = 2 if interview_mode == 'simple' else (3 if question_limit <= 3 else 4)

    def _sanitize_plan_questions(items, *, min_count=min_count, max_count=plan_generation_limit):
        sanitized = []
        for item in (items or []):
            q = str(item or '').strip()
            if not q:
                continue
            if self_intro_re.search(q):
                continue
            if _looks_like_warmup_question(q):
                continue
            if q in sanitized:
                continue
            sanitized.append(q)
            if len(sanitized) >= max_count:
                break
        if len(sanitized) < min_count:
            for fallback_q in default_questions:
                if self_intro_re.search(fallback_q):
                    continue
                if fallback_q in sanitized:
                    continue
                sanitized.append(fallback_q)
                if len(sanitized) >= min_count:
                    break
        return sanitized[:max_count]

    if not (deps['gemini_client'] and deps['check_gemini_quota']()):
        return {
            'success': True,
            'questions': _sanitize_plan_questions(default_questions, min_count=min_count, max_count=plan_generation_limit),
            'coverage': ['岗位匹配', '项目经历', '问题解决', '协作沟通', '复盘优化', '动机规划'],
            'planSource': 'fallback_quota_or_config',
            'modelAvailable': bool(deps['gemini_client']),
        }, 200
    try:
        role_hint = {
            'technical': '技术面（项目深挖）',
            'hr': 'HR面（文化匹配）',
            'general': '初试（综合基础面）',
        }.get(interview_type, '初试（综合基础面）')
        prompt = f"""
你是一位资深面试官，请为候选人生成一套“完整且不重复”的模拟面试题单。
要求：
- 面试类型：{role_hint}
- 面试模式：{'精简模式（总计3题：热身题1 + 深挖题2，难度不降低）' if interview_mode == 'simple' else '全面模式（完整题单）'}
- 本次仅需生成：{plan_generation_limit}道“核心深挖题”（热身题由系统固定添加，不需要你生成）
- 结合岗位职位描述与候选人简历定制，问题要具体。
- 一次性给出全部题目，必须严格等于要求题量，不得多也不得少。
- 问题必须是高价值筛选题，不得因为“精简模式”而降低难度或泛化提问。
- 题目顺序要从浅入深，覆盖面完整，避免语义重复。
- 严禁出现“自我介绍”相关题目（例如“请做自我介绍/介绍一下你自己”）。
- 严禁生成与本场热身题重合或近似的题目。本场热身题为：{warmup_question}
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
        response, _used = deps['_gemini_generate_content_resilient'](deps['GEMINI_INTERVIEW_MODEL'], prompt, want_json=False)
        raw_text = (response.text or "").strip()
        parsed = deps['_parse_json_object_from_text'](raw_text)
        questions = []
        coverage = []
        if isinstance(parsed, dict):
            q = parsed.get('questions')
            c = parsed.get('coverage')
            if isinstance(q, list):
                questions = [str(x).strip() for x in q if str(x).strip()]
            if isinstance(c, list):
                coverage = [str(x).strip() for x in c if str(x).strip()]
        questions = _sanitize_plan_questions(questions or default_questions, min_count=min_count, max_count=plan_generation_limit)
        return {
            'success': True,
            'questions': questions,
            'coverage': coverage,
            'planSource': 'model',
            'modelAvailable': True,
        }, 200
    except Exception as e:
        deps['logger'].warning("Interview plan generation failed: %s", e)
        return {
            'success': True,
            'questions': _sanitize_plan_questions(default_questions, min_count=min_count, max_count=plan_generation_limit),
            'coverage': ['岗位匹配', '项目经历', '问题解决', '协作沟通', '复盘优化', '动机规划'],
            'planSource': 'fallback_error',
            'modelAvailable': True,
        }, 200
