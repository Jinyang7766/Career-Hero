import re
import traceback
import json
import copy

from google.genai import types


class PIIMasker:
    """
    Reversible PII masker for server-side defense-in-depth.
    Masks name/phone/email before AI calls and restores placeholders after parsing response.
    """

    _EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
    _PHONE_RE = re.compile(r"(?<!\d)(\+?\d[\d\s-]{7,}\d)(?!\d)")

    def __init__(self, *, user_name: str = "", email: str = "", phone: str = ""):
        self.user_name = str(user_name or '').strip()
        self.email = str(email or '').strip()
        self.phone = str(phone or '').strip()

        self.name_token = '[USER_NAME]'
        self.email_token = '[EMAIL_ADDRESS]'
        self.phone_token = '[PHONE_NUMBER]'

    def mask_text(self, text: str) -> str:
        value = str(text or '')

        if self.user_name:
            value = value.replace(self.user_name, self.name_token)
            compact_name = re.sub(r'\s+', '', self.user_name)
            if compact_name and compact_name != self.user_name:
                value = value.replace(compact_name, self.name_token)

        if self.email:
            value = value.replace(self.email, self.email_token)
        value = self._EMAIL_RE.sub(self.email_token, value)

        if self.phone:
            value = value.replace(self.phone, self.phone_token)
            compact_phone = re.sub(r'[\s-]+', '', self.phone)
            if compact_phone and compact_phone != self.phone:
                value = value.replace(compact_phone, self.phone_token)
        value = self._PHONE_RE.sub(self.phone_token, value)

        return value

    def unmask_text(self, text: str) -> str:
        value = str(text or '')
        if self.user_name:
            value = value.replace(self.name_token, self.user_name)
        if self.email:
            value = value.replace(self.email_token, self.email)
        if self.phone:
            value = value.replace(self.phone_token, self.phone)
        return value

    def mask_object(self, value):
        if isinstance(value, dict):
            return {k: self.mask_object(v) for k, v in value.items()}
        if isinstance(value, list):
            return [self.mask_object(v) for v in value]
        if isinstance(value, str):
            return self.mask_text(value)
        return value

    def unmask_object(self, value):
        if isinstance(value, dict):
            return {k: self.unmask_object(v) for k, v in value.items()}
        if isinstance(value, list):
            return [self.unmask_object(v) for v in value]
        if isinstance(value, str):
            return self.unmask_text(value)
        return value


def _build_analysis_prompt(*, resume_data, job_description, rag_context, format_resume_for_ai):
    format_requirements = f"""
重要格式要求（必须严格遵守）：
1. 诊断总结（summary）必须简练，禁止在总结中罗列具体的优化建议或技能点。
2. 技能建议必须通过 suggestions 数组给出，且 targetSection 设为 "skills"。
3. 技能建议的 suggestedValue 必须是一个个独立的技能关键词组成的数组。
4. **核心要求**：所有优化建议的 suggestedValue 必须是**直接可用的简历原文**，禁止包含“建议修改为”、“比如”、“示例”、“描述示例”等指导性词语。用户会直接复制此内容。
   - 错误："建议描述：负责后端开发..."
   - 正确："负责后端核心模块开发，通过重构代码将响应速度提升 50%。"
5. **严格匹配要求**：必须逐条对照 JD 的职责/要求，给出“缺口型建议”，明确指出缺失点并给出可直接写入简历的内容。
6. **数量要求**：suggestions 至少 8 条；若 JD 较复杂，建议 12-15 条。
7. 确保 JSON 格式正确，所有字段值使用中文（除技术术语外）。
8. **隐私脱敏占位符说明（强制）**：如果你在简历/JD/对话中看到形如 `[[EMAIL_1]]`、`[[PHONE_1]]`、`[[COMPANY_1]]`、`[[ADDRESS_1]]` 的文本，这是系统为保护隐私而替换的占位符，表示该信息**已填写但已被隐藏**。
   - 严禁把这些占位符当成“未填写/缺失”，不要因此建议“补充邮箱/手机号/公司/地址”等。
   - 严禁尝试猜测或还原真实隐私信息。
9. **性别字段使用约束（强制）**：
   - 简历中的性别字段仅用于面试语境理解，不是优化目标。
   - 严禁在 `suggestions` 的 `title/reason/targetField/suggestedValue` 中提出任何与性别相关的修改、补充、删除或匹配建议。
   - 严禁因为性别信息影响评分结果或给出偏向性结论。
10. **教育信息不可“专业优化”（强制）**：
   - 教育背景中的“学校/学院名称、专业名称、学历/学位、入学/毕业时间”属于事实字段，必须严格来自简历原文。
   - 严禁为了贴合 JD 而擅自“优化专业名称/主修方向”（例如把“电子商务”改成“电子商务（主修方向：数据挖掘与商务智能）”）。
   - 若 JD 需要某方向而简历专业不完全匹配：请改为建议在教育经历/项目经历/技能中补充“相关课程/研究课题/项目/技能”来证明能力，而不是修改专业本身。
11. **技能词条白名单/黑名单规则（强制）**：
   - 仅输出“专业技能名词/工具名词/方法名词”，例如：SQL、Tableau、Power BI、Python、A/B Test、LTV 分析、SCRM、万相台、直通车、京东商智、引力魔方、库存预测、供应链管理、数据建模、定价模型。
   - 专业证书可以作为技能词条输出（例如：PMP认证、CFA、FRM、CPA、ACCA、CISP、软考证书、教师资格证），优先使用证书标准名称，禁止冗长描述。
   - **同类合并（强制）**：如果技能候选中出现任意大模型/对话模型/厂商或具体型号（例如：GPT-4/ChatGPT/OpenAI、Claude/Anthropic、Kimi/Moonshot、Gemini/Google、Qwen/通义千问、DeepSeek、Llama、GLM/智谱、文心一言/ERNIE 等），一律合并成单条技能：`LLM`。禁止同时列出多个不同模型名导致技能列表冗余。
   - 严禁把“工作经历动作描述”写进技能词条。禁止词示例：全链路运营、IP 打造、策略构建、活动执行、团队协同、跨部门沟通、主导推进、复盘优化、SOP 搭建、直播间运营。
   - 严禁输出动词化/过程化尾词：搭建、构建、设计、训练、微调、精调、调优、优化、执行、推进、落地、管理、脚本、自动化、开发、实现、运营、打造、分析、监控、维护、产出。
   - 严禁输出“连接残片词”：以“与/和/及”开头的片段，或“与精调”“和优化”“及搭建”这类残缺短语。
   - 严禁输出“泛业务词/弱技能词”：AI短视频分镜、智能化数据看板、内容策划、活动策划、全链路运营等（这些应放在经历，不是技能）。
   - 技能词条必须短、可检索、可复用：每条建议控制在 2-12 字符（英文术语可适当放宽），不得是完整句。
   - 技能词条禁止使用斜杠拼接长短语（如“A/B/C/...”），如需多个技能请拆分为多个数组元素。
   - 如果某项更适合写在工作经历中，请不要放在 skills 建议里。
   - 生成后请自检：skills.suggestedValue 中每一项都必须是可验证的硬技能名词。若包含上述动词/残片/泛词，先改写为硬技能（例如“Python自动化脚本”改为“Python”，“LoRA模型与精调”改为“LoRA模型”，“ComfyUI工作流搭建”改为“ComfyUI工作流”，“智能化数据看板”改为“Tableau/Power BI（择一）”）。
{rag_context}
"""

    if job_description:
        return f"""
请扮演**严格的招聘面试官**，以“通过初筛”为目标，**严格对照 JD 与简历逐条核对**，输出**更多、更具体**的优化建议（**至少 8 条**，若差距明显可给出 12-15 条）。
请使用中文输出，字段值必须为中文。

评分标准（总分100）：
- 经历匹配（40分）：工作经历与JD职责的重合度、项目经验的含金量。
- 技能匹配（30分）：硬技能（编程语言、工具）和软技能的覆盖率。
- 格式规范（30分）：简历排版整洁度、关键信息的易读性、是否有错别字。

简历：
{format_resume_for_ai(resume_data)}

职位描述：
{job_description}

请仅返回 JSON（仅中文内容）：
{{
  "score": 85,
  "scoreBreakdown": {{
    "experience": 35,
    "skills": 25,
    "format": 25
  }},
  "summary": "简历整体评估简述（控制在100字以内）。",
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
      "suggestedValue": "在XX项目中通过优化算法，将系统响应速度提升了30%。"
    }},
    {{
      "id": "suggestion-skills",
      "type": "missing",
      "title": "核心技能补全",
      "reason": "JD对AI工程能力有很高要求，建议补齐相关技能。",
      "targetSection": "skills",
      "suggestedValue": ["Prompt Engineering", "RAG", "Agent 设计", "Vector DB"]
    }}
  ],
  "missingKeywords": ["关键词1", "关键词2"]
}}

{format_requirements}
"""

    return f"""
请扮演**严格的招聘面试官**，以“通过初筛”为目标，输出**更多、更具体**的优化建议（**至少 8 条**，必要时 12-15 条）。
请使用中文输出，字段值必须为中文。

评分标准（总分100）：
- 经历质量（40分）：工作内容的具体程度、是否有量化成果（使用STAR法则）。
- 技能概况（30分）：技能栈是否完整、是否突出了核心竞争力。
- 格式规范（30分）：结构是否清晰、排版是否专业、语言是否精炼。

简历：
{format_resume_for_ai(resume_data)}

请仅返回 JSON（仅中文内容）：
{{
  "score": 75,
  "scoreBreakdown": {{
    "experience": 30,
    "skills": 20,
    "format": 25
  }},
  "summary": "简历整体评估简述（控制在100字以内）。",
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


def analyze_resume_core(current_user_id, data, deps):
    logger = deps['logger']
    resume_data = data.get('resumeData')
    job_description = data.get('jobDescription', '')
    rag_flag_present = 'ragEnabled' in (data or {})
    rag_requested = deps['parse_bool_flag'](data.get('ragEnabled'), deps['RAG_ENABLED'])
    rag_strategy = deps['resolve_rag_strategy'](resume_data, job_description, rag_flag_present=rag_flag_present)
    force_on = bool(rag_strategy.get('force_case_rag_on', False)) and (not (rag_flag_present and (rag_requested is False)))
    rag_enabled = (not rag_strategy.get('disable_case_rag', False)) and (rag_requested or force_on)
    reference_cases = []

    if not resume_data:
        return {'error': '需要提供简历数据'}, 400

    pii_mode = str(deps['PII_GUARD_MODE'] or 'warn').strip().lower()
    pii_masker = None

    if pii_mode in ('warn', 'reject', 'mask'):
        pii_types = deps['_payload_pii_types'](resume_data, job_description)
        if pii_types:
            logger.warning("PII guard detected types=%s (mode=%s)", sorted(list(pii_types)), pii_mode)
            if pii_mode == 'reject':
                return {
                    'error': '检测到可能的个人敏感信息（PII），已拒绝处理。请使用前端内置脱敏后再重试。',
                    'pii_types': sorted(list(pii_types))
                }, 400
            if pii_mode == 'mask':
                personal = (resume_data or {}).get('personalInfo', {}) or {}
                pii_masker = PIIMasker(
                    user_name=personal.get('name') or '',
                    email=personal.get('email') or '',
                    phone=personal.get('phone') or '',
                )

    if deps['gemini_client'] and deps['check_gemini_quota']():
        try:
            masked_resume_data = pii_masker.mask_object(copy.deepcopy(resume_data)) if pii_masker else resume_data
            masked_job_description = pii_masker.mask_text(job_description) if pii_masker else job_description

            rag_context = ""
            if rag_enabled:
                relevant_cases = deps['find_relevant_cases_vector'](masked_resume_data, limit=rag_strategy.get('case_limit', 3))
                if isinstance(relevant_cases, list):
                    reference_cases = [{
                        'id': case.get('id'),
                        'job_role': case.get('job_role'),
                        'industry': case.get('industry'),
                        'seniority': case.get('seniority'),
                        'scenario': case.get('scenario'),
                        'star': case.get('star', {}),
                        'similarity': case.get('similarity')
                    } for case in relevant_cases]
                logger.info("RAG retrieval count: %s", len(reference_cases))

                formatted_cases = ""
                if relevant_cases:
                    for index, case in enumerate(relevant_cases):
                        formatted_cases += f"案例 {index+1}：{case.get('job_role')} ({case.get('industry')})\n"
                        star = case.get('star', {})
                        formatted_cases += f"- 情况: {star.get('situation')}\n"
                        formatted_cases += f"- 任务: {star.get('task')}\n"
                        formatted_cases += f"- 行动: {star.get('action')}\n"
                        formatted_cases += f"- 结果: {star.get('result')}\n\n"
                if formatted_cases:
                    rag_context = f"""
【参考案例（仅限风格约束）】
以下是该领域的优秀简历案例（STAR法则与Bullet Points示范）：
{formatted_cases}

请严格执行以下约束（强制）：
1. 参考案例只允许用于“叙事结构、动词表达、量化逻辑”，不得作为事实来源。
2. 严禁复用或改写参考案例中的任何具体事实，包括但不限于：公司名、项目名、产品名、客户名、品牌名、平台名、组织名、人物名。
3. 严禁复用或映射参考案例中的任何具体数字与时间信息，包括百分比、金额、人数、时长、日期、排名、增长率（例如 14.2%）。
4. 输出中所有事实必须来自用户简历原文；若简历未提供具体事实，使用中性占位表达或仅给出结构化改写，不得臆造细节。
5. 若发现建议文本与参考案例在实体名或数字上重合，必须重写，直至完全去除案例事实痕迹。
"""
            else:
                logger.info("RAG disabled for this request (requested=%s, strategy=%s)", rag_requested, rag_strategy.get('mode'))
            if rag_strategy.get('extra_context'):
                rag_context = f"{rag_context}\n{rag_strategy.get('extra_context')}\n"

            prompt = _build_analysis_prompt(
                resume_data=masked_resume_data,
                job_description=masked_job_description,
                rag_context=rag_context,
                format_resume_for_ai=deps['format_resume_for_ai'],
            )

            analysis_models_tried = deps['get_analysis_model_candidates']()
            last_model_error = None
            response = None
            used_model = None
            for model_name in analysis_models_tried:
                try:
                    response, used_model = deps['_gemini_generate_content_resilient'](model_name, prompt, want_json=True)
                    break
                except Exception as model_error:
                    last_model_error = model_error
                    logger.warning("Analysis model failed: %s, error=%s", model_name, model_error)

            if response is None:
                raise last_model_error or RuntimeError("No available Gemini analysis model")

            ai_result = deps['parse_ai_response'](response.text)
            if pii_masker:
                ai_result = pii_masker.unmask_object(ai_result)
            raw_suggestions = ai_result.get('suggestions', [])
            filtered_suggestions = []
            dropped_gender_suggestions = 0
            dropped_education_suggestions = 0
            if isinstance(raw_suggestions, list):
                for suggestion in raw_suggestions:
                    if deps['is_gender_related_suggestion'](suggestion):
                        dropped_gender_suggestions += 1
                        continue
                    if deps['is_education_related_suggestion'](suggestion):
                        dropped_education_suggestions += 1
                        continue
                    filtered_suggestions.append(suggestion)
            else:
                filtered_suggestions = []
            if dropped_gender_suggestions > 0:
                logger.info("Dropped %d gender-related suggestions from AI analyze result", dropped_gender_suggestions)
            if dropped_education_suggestions > 0:
                logger.info("Dropped %d education-related suggestions from AI analyze result", dropped_education_suggestions)
            ai_result['suggestions'] = filtered_suggestions
            ensured_summary = deps['ensure_analysis_summary'](
                ai_result.get('summary', ''),
                ai_result.get('strengths', []),
                ai_result.get('weaknesses', []),
                ai_result.get('missingKeywords', []),
                bool(job_description)
            )

            return {
                'score': ai_result.get('score', 70),
                'scoreBreakdown': ai_result.get('scoreBreakdown', {'experience': 0, 'skills': 0, 'format': 0}),
                'summary': ensured_summary,
                'suggestions': ai_result.get('suggestions', []),
                'strengths': ai_result.get('strengths', []),
                'weaknesses': ai_result.get('weaknesses', []),
                'missingKeywords': ai_result.get('missingKeywords', []),
                'reference_cases': reference_cases,
                'rag_enabled': rag_enabled,
                'rag_requested': rag_requested,
                'rag_strategy': rag_strategy.get('mode'),
                'analysis_model': used_model
            }, 200

        except Exception as ai_error:
            logger.error("Gemini AI analysis failed: %s", ai_error)
            logger.error("Full traceback: %s", traceback.format_exc())
            score = deps['calculate_resume_score'](resume_data)
            suggestions = deps['generate_enhanced_suggestions'](resume_data, score, job_description)
            suggestions = [
                suggestion for suggestion in (suggestions or [])
                if not deps['is_gender_related_suggestion'](suggestion) and not deps['is_education_related_suggestion'](suggestion)
            ]

            return {
                'score': score,
                'summary': '智能分析暂时不可用，已生成基础分析报告，建议稍后再试。',
                'suggestions': suggestions,
                'strengths': ['结构清晰', '格式规范'],
                'weaknesses': ['智能分析暂不可用', '请稍后重试以获取更详细分析'],
                'missingKeywords': [] if not job_description else ['智能分析暂不可用'],
                'reference_cases': reference_cases,
                'rag_enabled': rag_enabled,
                'rag_requested': rag_requested,
                'rag_strategy': rag_strategy.get('mode'),
                'analysis_model': None,
                'analysis_models_tried': analysis_models_tried if 'analysis_models_tried' in locals() else [],
                'analysis_error': str(ai_error)[:500]
            }, 200

    score = deps['calculate_resume_score'](resume_data)
    suggestions = deps['generate_suggestions'](resume_data, score)
    suggestions = [
        suggestion for suggestion in (suggestions or [])
        if not deps['is_gender_related_suggestion'](suggestion) and not deps['is_education_related_suggestion'](suggestion)
    ]
    return {
        'score': score,
        'summary': '简历分析完成，请查看优化建议。',
        'suggestions': suggestions,
        'strengths': ['结构清晰', '格式规范'],
        'weaknesses': ['缺少量化结果', '技能描述过于笼统'],
        'missingKeywords': [] if not job_description else ['正在分析关键词...'],
        'reference_cases': reference_cases,
        'rag_enabled': rag_enabled,
        'rag_requested': rag_requested,
        'rag_strategy': rag_strategy.get('mode')
    }, 200


def parse_screenshot_core(data, deps):
    image = data.get('image', '')
    if not image:
        return {'error': '图片不能为空'}, 400

    if deps['gemini_client'] and deps['check_gemini_quota']():
        try:
            prompt = (
                "请从图片中提取完整职位描述（JD）文本。"
                "尽可能保留原始分段和要点，删除与JD无关的噪声内容。"
                "仅返回可直接粘贴的中文文本，不要解释，不要JSON。"
            )
            from base64 import b64decode
            mime_type = "image/png"
            base64_data = image

            match = re.match(r'^data:(image/[a-zA-Z0-9.+-]+);base64,(.*)$', image, flags=re.DOTALL)
            if match:
                mime_type = (match.group(1) or "image/png").strip().lower()
                base64_data = match.group(2)

            image_data = b64decode(base64_data)
            contents = [prompt, types.Part.from_bytes(data=image_data, mime_type=mime_type)]
            candidate_models = deps['get_ocr_model_candidates']()

            last_error = None
            for model_name in candidate_models:
                try:
                    response = deps['gemini_client'].models.generate_content(model=model_name, contents=contents)
                    text = (response.text or '').strip()
                    if text:
                        return {'success': True, 'text': text, 'model': model_name}, 200
                except Exception as model_err:
                    last_error = model_err
                    deps['logger'].warning("JD screenshot OCR failed on model %s: %s", model_name, model_err)

            deps['logger'].error("JD screenshot OCR all models failed: %s", last_error)
            return {'success': False, 'text': '', 'error': 'JD截图识别失败，请尝试更清晰截图或直接粘贴JD文本。'}, 200
        except Exception as ai_error:
            deps['logger'].error("AI 截图解析失败: %s", ai_error)
            return {'success': False, 'text': '', 'error': 'JD截图识别失败，请稍后重试或手动粘贴。'}, 200

    return {'success': False, 'text': '', 'error': 'AI服务不可用，请手动粘贴JD文本。'}, 200


def ai_chat_core(data, deps):
    mode = (data.get('mode') or '').strip().lower()
    message = data.get('message', '')
    audio = data.get('audio')
    resume_data = data.get('resumeData')
    job_description = data.get('jobDescription', '')
    chat_history = data.get('chatHistory', [])

    has_audio = isinstance(audio, dict) and bool(audio.get('data'))
    audio_duration_sec = None
    try:
        if isinstance(audio, dict):
            value = audio.get('duration_sec')
            if value is not None and str(value).strip() != '':
                audio_duration_sec = float(value)
    except Exception:
        audio_duration_sec = None
    if (not message) and (not has_audio):
        return {'error': '消息内容不能为空'}, 400

    clean_message = message.replace('[INTERVIEW_MODE]', '').replace('[INTERVIEW_SUMMARY]', '').strip()

    def _is_voice_placeholder_text(text: str) -> bool:
        stripped = str(text or '').strip()
        return bool(stripped) and stripped in {'（语音）', '(语音)', '[语音]', '语音', 'voice'}

    def _extract_question_from_interviewer_text(text: str) -> str:
        stripped = str(text or '').strip()
        if not stripped:
            return ''
        match = re.search(r'下一题[:：]\s*(.*)$', stripped, flags=re.DOTALL)
        return (match.group(1) or '').strip() if match else stripped

    def _get_last_interviewer_question(chat_history_list) -> str:
        if not isinstance(chat_history_list, list):
            return ''
        for item in reversed(chat_history_list):
            if not isinstance(item, dict):
                continue
            if item.get('role') != 'model':
                continue
            txt = str(item.get('text') or '').replace('[INTERVIEW_MODE]', '').strip()
            if not txt or txt.startswith('SYSTEM_'):
                continue
            return _extract_question_from_interviewer_text(txt)
        return ''

    def _is_low_information_answer(text: str) -> bool:
        stripped = str(text or '').strip()
        if not stripped:
            return True
        if _is_voice_placeholder_text(stripped):
            return True
        compact = re.sub(r'[\s\.,;:!?\-—_·~`"\'“”‘’（）()\[\]{}<>《》【】|/\\\\]+', '', stripped)
        if len(compact) < 6:
            return True
        low = compact.lower()
        if low in {'不知道', '不清楚', '没想过', '随便', '都可以', '没有', '没了', '嗯', '啊', '额', 'emmm', 'ok', 'okay', '是的', '不是', '还行', '一般', '差不多', '就那样'}:
            return True
        return False

    if _is_voice_placeholder_text(clean_message):
        clean_message = ''

    if mode != 'interview_summary':
        last_q = _get_last_interviewer_question(chat_history)
        is_self_intro_q = bool(re.search(r'(自我介绍|介绍一下你自己|简单介绍一下自己)', last_q or ''))
        if has_audio and not clean_message:
            transcript = ''
            try:
                if deps['GOOGLE_SPEECH_API_KEY']:
                    from base64 import b64decode
                    mime_type = (audio.get('mime_type') or 'audio/webm').strip().lower()
                    base64_data = audio.get('data') or ''
                    match = re.match(r'^data:(audio/[a-zA-Z0-9.+-]+);base64,(.*)$', base64_data, flags=re.DOTALL)
                    if match:
                        mime_type = (match.group(1) or mime_type).strip().lower()
                        base64_data = match.group(2)
                    audio_bytes = b64decode(base64_data)
                    transcript = deps['_google_speech_transcribe'](audio_bytes, mime_type, 'zh-CN')
            except Exception as stt_err:
                deps['logger'].warning("Interview STT check failed, continuing without transcript: %s", stt_err)
                transcript = ''
            if not str(transcript or '').strip():
                question = last_q or '请再说一遍你的回答。'
                return {'response': f"我没有识别到有效的语音内容。请重新回答：{question}"}, 200
            clean_message = str(transcript).strip()

        if _is_low_information_answer(clean_message):
            question = last_q or '请把你的回答说得更具体一些。'
            return {'response': f"你的回答信息量不足或未能回答到问题。请补充并重新回答：{question}"}, 200

    if deps['gemini_client'] and deps['check_gemini_quota']():
        try:
            formatted_chat = ""
            for message_obj in chat_history:
                role = "候选人" if message_obj.get('role') == 'user' else "面试官"
                msg_text = message_obj.get('text', '').replace('[INTERVIEW_MODE]', '').strip()
                if msg_text and not msg_text.startswith('SYSTEM_') and (not _is_voice_placeholder_text(msg_text)):
                    formatted_chat += f"{role}: {msg_text}\n"

            if mode == 'interview_summary':
                prompt = f"""
【严格角色】你是专业 AI 面试官。现在面试已结束，请基于职位描述、候选人简历与完整对话记录输出“面试综合分析”。
要求：
- 用中文输出；不要提出下一题。
- 重点结合：候选人回答质量（结构、深度、证据、数据/影响）、简历内容与 JD 匹配度、岗位核心能力缺口。
- 输出结构：
1) 综合评价（3-5句）
2) 表现亮点（3-6条）
3) 需要加强的地方（5-8条，每条包含：问题 -> 如何改进 -> 建议练习/准备素材）
4) JD 匹配度与缺口（分点说明）
5) 简历可改进点（3-6条，针对表达与证据补强）
6) 1-2 周训练计划（按天/按主题）

职位描述：{job_description if job_description else '未提供'}
简历信息：{deps['format_resume_for_ai'](resume_data) if resume_data else '未提供'}
对话记录：{formatted_chat if formatted_chat else '无'}
候选人结束指令：{clean_message if clean_message else '（无）'}
"""
            else:
                prompt = f"""
 【严格角色】你是专业 AI 面试官，基于职位描述和候选人简历进行模拟面试。
 禁止提及任何评分，禁止给出建议，保持面试官角色。
 规则：
 - 如果候选人回答为空、无法识别、与问题无关或信息量明显不足：不要肯定/夸赞；不要进入下一题；请要求候选人重答，并重复当前问题。
 - 输出为纯文本，不要使用任何 Markdown 标记，不要出现任何 * 号。
 - 如需提出下一题，必须另起一行，以“下一题：”开头输出（不要把下一题放进参考回复里）。
 - 如果下一道问题是自我介绍（如“请做一下自我介绍”），请在问题中提醒：自我介绍时间为1分钟（不要再追加“请将回答控制在3分钟内”）
 - 其它所有下一道具体问题，问题末尾必须追加：请将回答控制在3分钟内
 职位描述：{job_description if job_description else '未提供'}
 简历信息：{deps['format_resume_for_ai'](resume_data) if resume_data else '未提供'}
 对话历史：{formatted_chat if formatted_chat else '面试刚开始'}
 候选人回答：{clean_message if clean_message else ('（语音回答见音频附件）' if has_audio else '')}
 候选人语音时长（秒）：{audio_duration_sec if audio_duration_sec is not None else '未知'}
 请直接输出面试官回答：简短点评 + 下一道具体问题。
 """
            contents = prompt
            if has_audio and mode != 'interview_summary':
                try:
                    from base64 import b64decode
                    mime_type = (audio.get('mime_type') or 'audio/webm').strip().lower()
                    base64_data = audio.get('data') or ''
                    match = re.match(r'^data:(audio/[a-zA-Z0-9.+-]+);base64,(.*)$', base64_data, flags=re.DOTALL)
                    if match:
                        mime_type = (match.group(1) or mime_type).strip().lower()
                        base64_data = match.group(2)
                    audio_bytes = b64decode(base64_data)
                    contents = [prompt, types.Part.from_bytes(data=audio_bytes, mime_type=mime_type)]
                except Exception as dec_err:
                    deps['logger'].warning("Audio decode failed, continuing without audio: %s", dec_err)
                    contents = prompt

            response, _used = deps['_gemini_generate_content_resilient'](deps['GEMINI_INTERVIEW_MODEL'], contents, want_json=False)
            raw_text = (response.text or "").strip()
            parsed = deps['_parse_json_object_from_text'](raw_text)
            if isinstance(parsed, dict):
                raw_text = parsed.get('response') or parsed.get('text') or parsed.get('message') or parsed.get('reply') or raw_text
            raw_text = (raw_text or '').replace('*', '').strip()

            try:
                too_long = False
                if is_self_intro_q:
                    if audio_duration_sec is not None and audio_duration_sec > 60:
                        too_long = True
                    elif audio_duration_sec is None and len(str(clean_message or '')) > 360:
                        too_long = True
                if too_long and ('1分钟' not in raw_text):
                    raw_text = f"提醒：你的自我介绍偏长，后续请控制在1分钟内。\n{raw_text}".strip()
            except Exception:
                pass

            text = raw_text if isinstance(raw_text, str) and raw_text.strip() else '感谢你的回答，我们继续下一题。'
            return {'response': text}, 200
        except Exception as ai_error:
            deps['logger'].error("AI 面试失败: %s", ai_error)
            return {'response': '面试官暂时开小差了，请稍后再试。'}, 200
    return {'response': '面试官暂时开小差了。'}, 200


def ai_chat_stream_core(data, deps):
    """
    Stream interview chat response as incremental chunks.
    Yields dict events: {"type":"chunk","delta":"..."} / {"type":"done","text":"..."} / {"type":"error","message":"..."}
    """
    mode = (data.get('mode') or '').strip().lower()
    message = data.get('message', '')
    audio = data.get('audio')
    resume_data = data.get('resumeData')
    job_description = data.get('jobDescription', '')
    chat_history = data.get('chatHistory', [])

    has_audio = isinstance(audio, dict) and bool(audio.get('data'))
    audio_duration_sec = None
    try:
        if isinstance(audio, dict):
            value = audio.get('duration_sec')
            if value is not None and str(value).strip() != '':
                audio_duration_sec = float(value)
    except Exception:
        audio_duration_sec = None

    if (not message) and (not has_audio):
        return None, {'error': '消息内容不能为空'}, 400

    clean_message = message.replace('[INTERVIEW_MODE]', '').replace('[INTERVIEW_SUMMARY]', '').strip()

    def _is_voice_placeholder_text(text: str) -> bool:
        stripped = str(text or '').strip()
        return bool(stripped) and stripped in {'（语音）', '(语音)', '[语音]', '语音', 'voice'}

    def _extract_question_from_interviewer_text(text: str) -> str:
        stripped = str(text or '').strip()
        if not stripped:
            return ''
        match = re.search(r'下一题[:：]\s*(.*)$', stripped, flags=re.DOTALL)
        return (match.group(1) or '').strip() if match else stripped

    def _get_last_interviewer_question(chat_history_list) -> str:
        if not isinstance(chat_history_list, list):
            return ''
        for item in reversed(chat_history_list):
            if not isinstance(item, dict):
                continue
            if item.get('role') != 'model':
                continue
            txt = str(item.get('text') or '').replace('[INTERVIEW_MODE]', '').strip()
            if not txt or txt.startswith('SYSTEM_'):
                continue
            return _extract_question_from_interviewer_text(txt)
        return ''

    def _is_low_information_answer(text: str) -> bool:
        stripped = str(text or '').strip()
        if not stripped:
            return True
        if _is_voice_placeholder_text(stripped):
            return True
        compact = re.sub(r'[\s\.,;:!?\-—_·~`"\'“”‘’（）()\[\]{}<>《》【】|/\\\\]+', '', stripped)
        if len(compact) < 6:
            return True
        low = compact.lower()
        if low in {'不知道', '不清楚', '没想过', '随便', '都可以', '没有', '没了', '嗯', '啊', '额', 'emmm', 'ok', 'okay', '是的', '不是', '还行', '一般', '差不多', '就那样'}:
            return True
        return False

    if _is_voice_placeholder_text(clean_message):
        clean_message = ''

    if mode != 'interview_summary':
        last_q = _get_last_interviewer_question(chat_history)
        if has_audio and not clean_message:
            transcript = ''
            try:
                if deps['GOOGLE_SPEECH_API_KEY']:
                    from base64 import b64decode
                    mime_type = (audio.get('mime_type') or 'audio/webm').strip().lower()
                    base64_data = audio.get('data') or ''
                    match = re.match(r'^data:(audio/[a-zA-Z0-9.+-]+);base64,(.*)$', base64_data, flags=re.DOTALL)
                    if match:
                        mime_type = (match.group(1) or mime_type).strip().lower()
                        base64_data = match.group(2)
                    audio_bytes = b64decode(base64_data)
                    transcript = deps['_google_speech_transcribe'](audio_bytes, mime_type, 'zh-CN')
            except Exception as stt_err:
                deps['logger'].warning("Interview STT check failed, continuing without transcript: %s", stt_err)
                transcript = ''
            if not str(transcript or '').strip():
                question = last_q or '请再说一遍你的回答。'
                return None, {'response': f"我没有识别到有效的语音内容。请重新回答：{question}"}, 200
            clean_message = str(transcript).strip()

        if _is_low_information_answer(clean_message):
            question = last_q or '请把你的回答说得更具体一些。'
            return None, {'response': f"你的回答信息量不足或未能回答到问题。请补充并重新回答：{question}"}, 200

    if not (deps['gemini_client'] and deps['check_gemini_quota']()):
        return None, {'response': '面试官暂时开小差了。'}, 200

    formatted_chat = ""
    for message_obj in chat_history:
        role = "候选人" if message_obj.get('role') == 'user' else "面试官"
        msg_text = message_obj.get('text', '').replace('[INTERVIEW_MODE]', '').strip()
        if msg_text and not msg_text.startswith('SYSTEM_') and (not _is_voice_placeholder_text(msg_text)):
            formatted_chat += f"{role}: {msg_text}\n"

    is_self_intro_q = bool(re.search(r'(自我介绍|介绍一下你自己|简单介绍一下自己)', _get_last_interviewer_question(chat_history) or ''))

    if mode == 'interview_summary':
        prompt = f"""
【严格角色】你是专业 AI 面试官。现在面试已结束，请基于职位描述、候选人简历与完整对话记录输出“面试综合分析”。
要求：
- 用中文输出；不要提出下一题。
- 重点结合：候选人回答质量（结构、深度、证据、数据/影响）、简历内容与 JD 匹配度、岗位核心能力缺口。
- 输出结构：
1) 综合评价（3-5句）
2) 表现亮点（3-6条）
3) 需要加强的地方（5-8条，每条包含：问题 -> 如何改进 -> 建议练习/准备素材）
4) JD 匹配度与缺口（分点说明）
5) 简历可改进点（3-6条，针对表达与证据补强）
6) 1-2 周训练计划（按天/按主题）

职位描述：{job_description if job_description else '未提供'}
简历信息：{deps['format_resume_for_ai'](resume_data) if resume_data else '未提供'}
对话记录：{formatted_chat if formatted_chat else '无'}
候选人结束指令：{clean_message if clean_message else '（无）'}
"""
    else:
        prompt = f"""
【严格角色】你是专业 AI 面试官，基于职位描述和候选人简历进行模拟面试。
禁止提及任何评分，禁止给出建议，保持面试官角色。
规则：
- 如果候选人回答为空、无法识别、与问题无关或信息量明显不足：不要肯定/夸赞；不要进入下一题；请要求候选人重答，并重复当前问题。
- 输出为纯文本，不要使用任何 Markdown 标记，不要出现任何 * 号。
- 如需提出下一题，必须另起一行，以“下一题：”开头输出（不要把下一题放进参考回复里）。
- 如果下一道问题是自我介绍（如“请做一下自我介绍”），请在问题中提醒：自我介绍时间为1分钟（不要再追加“请将回答控制在3分钟内”）
- 其它所有下一道具体问题，问题末尾必须追加：请将回答控制在3分钟内
职位描述：{job_description if job_description else '未提供'}
简历信息：{deps['format_resume_for_ai'](resume_data) if resume_data else '未提供'}
对话历史：{formatted_chat if formatted_chat else '面试刚开始'}
候选人回答：{clean_message if clean_message else ('（语音回答见音频附件）' if has_audio else '')}
候选人语音时长（秒）：{audio_duration_sec if audio_duration_sec is not None else '未知'}
请直接输出面试官回答：简短点评 + 下一道具体问题。
"""

    contents = prompt
    if has_audio and mode != 'interview_summary':
        try:
            from base64 import b64decode
            mime_type = (audio.get('mime_type') or 'audio/webm').strip().lower()
            base64_data = audio.get('data') or ''
            match = re.match(r'^data:(audio/[a-zA-Z0-9.+-]+);base64,(.*)$', base64_data, flags=re.DOTALL)
            if match:
                mime_type = (match.group(1) or mime_type).strip().lower()
                base64_data = match.group(2)
            audio_bytes = b64decode(base64_data)
            contents = [prompt, types.Part.from_bytes(data=audio_bytes, mime_type=mime_type)]
        except Exception as dec_err:
            deps['logger'].warning("Audio decode failed, continuing without audio: %s", dec_err)
            contents = prompt

    stream_api = getattr(deps['gemini_client'].models, 'generate_content_stream', None)

    def _iter_events():
        if not callable(stream_api):
            try:
                response, _used = deps['_gemini_generate_content_resilient'](deps['GEMINI_INTERVIEW_MODEL'], contents, want_json=False)
                text = (response.text or "").replace('*', '').strip()
                yield {'type': 'done', 'text': text or '感谢你的回答，我们继续下一题。'}
                return
            except Exception as fallback_err:
                deps['logger'].error("AI 面试流式降级失败: %s", fallback_err)
                yield {'type': 'error', 'message': '面试官暂时开小差了，请稍后再试。'}
                return

        full_text = ''
        try:
            for chunk in stream_api(model=deps['GEMINI_INTERVIEW_MODEL'], contents=contents):
                delta = (getattr(chunk, 'text', '') or '').replace('*', '')
                if not delta:
                    continue
                full_text += delta
                yield {'type': 'chunk', 'delta': delta}

            parsed = deps['_parse_json_object_from_text'](full_text)
            if isinstance(parsed, dict):
                full_text = parsed.get('response') or parsed.get('text') or parsed.get('message') or parsed.get('reply') or full_text

            final_text = (full_text or '').replace('*', '').strip()
            try:
                too_long = False
                if is_self_intro_q:
                    if audio_duration_sec is not None and audio_duration_sec > 60:
                        too_long = True
                    elif audio_duration_sec is None and len(str(clean_message or '')) > 360:
                        too_long = True
                if too_long and ('1分钟' not in final_text):
                    final_text = f"提醒：你的自我介绍偏长，后续请控制在1分钟内。\n{final_text}".strip()
            except Exception:
                pass

            yield {'type': 'done', 'text': final_text or '感谢你的回答，我们继续下一题。'}
        except Exception as stream_err:
            deps['logger'].error("AI 面试流式输出失败: %s", stream_err)
            deps['logger'].error("Full traceback: %s", traceback.format_exc())
            if full_text.strip():
                yield {'type': 'done', 'text': full_text.strip()}
            else:
                yield {'type': 'error', 'message': '面试官暂时开小差了，请稍后再试。'}

    return _iter_events(), None, 200


def transcribe_core(data, deps):
    audio = data.get('audio') or {}
    lang = (data.get('lang') or 'zh-CN').strip() or 'zh-CN'
    if not isinstance(audio, dict) or not audio.get('data'):
        return {'success': False, 'text': '', 'error': '缺少音频数据'}, 400

    try:
        from base64 import b64decode
        mime_type = (audio.get('mime_type') or 'audio/webm').strip().lower()
        base64_data = audio.get('data') or ''
        match = re.match(r'^data:(audio/[a-zA-Z0-9.+-]+);base64,(.*)$', base64_data, flags=re.DOTALL)
        if match:
            mime_type = (match.group(1) or mime_type).strip().lower()
            base64_data = match.group(2)
        audio_bytes = b64decode(base64_data)
    except Exception as dec_err:
        deps['logger'].warning("Transcribe audio decode failed: %s", dec_err)
        return {'success': False, 'text': '', 'error': '音频解码失败'}, 400

    if not deps['GOOGLE_SPEECH_API_KEY']:
        return {'success': False, 'text': '', 'error': '转写未配置（缺少 GOOGLE_SPEECH_API_KEY）'}, 200

    try:
        text = deps['_google_speech_transcribe'](audio_bytes, mime_type, lang)
        return {'success': True, 'text': text, 'provider': 'google_speech_v1'}, 200
    except ValueError as ve:
        return {'success': False, 'text': '', 'error': str(ve) or '当前录音格式不支持转文字'}, 200
    except Exception as stt_err:
        deps['logger'].warning("Google Speech transcribe failed: %s", stt_err)
        return {'success': False, 'text': '', 'error': str(stt_err) or '转写失败'}, 200
