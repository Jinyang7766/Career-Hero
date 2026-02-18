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


def _normalize_company_confidence(value, default: float = 0.0) -> float:
    try:
        n = float(value)
    except Exception:
        n = default
    if n < 0:
        return 0.0
    if n > 1:
        return 1.0
    return round(n, 4)


def _fallback_extract_company_with_confidence(text: str):
    raw = str(text or '').strip()
    if not raw:
        return '', 0.0

    invalid_keywords = [
        '职位', '岗位', '要求', '职责', '描述', '薪资', '地点', '福利',
        '任职', '优先', '加分', '简历', '投递', '招聘', '急聘', '高薪',
        '职责描述', '岗位职责', '任职要求', '工作地点', '职位描述', '岗位说明'
    ]

    def _normalize(value: str) -> str:
        candidate = str(value or '').strip().replace('｜', '|')
        candidate = candidate.split('|', 1)[0].strip()
        return candidate

    def _is_valid(name: str) -> bool:
        n = _normalize(name)
        if len(n) < 2 or len(n) > 60:
            return False
        if re.match(r'^(?:[一二三四五六七八九十]|\d+)[、.\s]', n):
            return False
        return not any(k in n for k in invalid_keywords)

    lines = [ln.strip() for ln in raw.split('\n') if ln.strip()]
    labeled_patterns = [
        r'(?:公司|企业|Employer|Company)\s*[:：\s-]*([^\n]+)',
        r'招聘单位\s*[:：\s-]*([^\n]+)',
    ]
    for pattern in labeled_patterns:
        match = re.search(pattern, raw, flags=re.IGNORECASE)
        if match and match.group(1):
            candidate = _normalize(match.group(1))
            if _is_valid(candidate):
                return candidate, 0.78

    company_suffix = re.compile(
        r'(?:公司|集团|有限公司|有限责任公司|工作室|研究院|事务所|科技|网络|技术|咨询|银行|证券|基金|保险|'
        r'Inc\.?|Ltd\.?|LLC|Co\.?|Corporation|Group)$',
        re.IGNORECASE,
    )
    for line in lines[:6]:
        candidate = _normalize(line)
        if company_suffix.search(candidate) and _is_valid(candidate):
            return candidate, 0.62

    return '', 0.0


def _fallback_extract_company_from_jd(text: str) -> str:
    company, _confidence = _fallback_extract_company_with_confidence(text)
    return company


def _collect_resume_numeric_tokens(resume_data) -> set:
    """Collect numeric tokens from resume content for anti-fabrication checks."""
    try:
        safe_resume = copy.deepcopy(resume_data) if isinstance(resume_data, dict) else {}
    except Exception:
        safe_resume = resume_data if isinstance(resume_data, dict) else {}

    if isinstance(safe_resume, dict):
        personal = safe_resume.get('personalInfo')
        if isinstance(personal, dict):
            personal.pop('phone', None)
            personal.pop('email', None)

    text = json.dumps(safe_resume or {}, ensure_ascii=False)
    tokens = set()
    for m in re.finditer(r'\d+(?:\.\d+)?%?', text):
        t = m.group(0)
        tokens.add(t)
        if t.endswith('%'):
            tokens.add(t[:-1])
        else:
            tokens.add(f"{t}%")
    return tokens


def _normalize_suggestion_metric_text(text: str, resume_numeric_tokens: set) -> str:
    value = str(text or '')
    if not value:
        return value

    # Normalize common placeholder variants to a single style.
    value = re.sub(r'[\{\[\(（【]?\s*数字\s*[\}\]\)）】]?\s*%', 'XX%', value)
    value = re.sub(r'(?<![\u4e00-\u9fffA-Za-z0-9])数字(?![\u4e00-\u9fffA-Za-z0-9])', 'XX', value)
    value = re.sub(r'\b[XYZNMK]{1,3}\s*%\b', 'XX%', value)
    value = re.sub(r'\b[XYZNMK]{1,3}\b', 'XX', value)

    # Replace concrete numbers not present in the original resume with placeholders.
    def _replace_unknown_number(match):
        token = match.group(0)
        if token in resume_numeric_tokens:
            return token
        return 'XX%' if token.endswith('%') else 'XX'

    value = re.sub(r'\d+(?:\.\d+)?%?', _replace_unknown_number, value)
    return value


def _sanitize_suggestions_for_metric_consistency(suggestions, resume_data):
    if not isinstance(suggestions, list):
        return []
    resume_numeric_tokens = _collect_resume_numeric_tokens(resume_data)
    cleaned = []
    for item in suggestions:
        if not isinstance(item, dict):
            continue
        suggestion = dict(item)
        target_section = str(suggestion.get('targetSection') or '').strip().lower()
        suggested_value = suggestion.get('suggestedValue')
        if target_section != 'skills' and isinstance(suggested_value, str):
            suggestion['suggestedValue'] = _normalize_suggestion_metric_text(
                suggested_value, resume_numeric_tokens
            )
        cleaned.append(suggestion)
    return cleaned


def _format_diagnosis_dossier(dossier):
    if not isinstance(dossier, dict):
        return ''
    try:
        summary = str(dossier.get('summary') or '').strip()
        score = dossier.get('score')
        target_company = str(dossier.get('targetCompany') or '').strip()
        jd_text = str(dossier.get('jdText') or '').strip()
        score_breakdown = dossier.get('scoreBreakdown') or {}
        overview = dossier.get('suggestionsOverview') or {}
        strengths = dossier.get('strengths') or []
        weaknesses = dossier.get('weaknesses') or []
        missing_keywords = dossier.get('missingKeywords') or []

        lines = []
        if summary:
            lines.append(f"- 诊断总结：{summary}")
        if isinstance(score, (int, float)):
            lines.append(f"- 诊断总分：{int(score)}")
        if target_company:
            lines.append(f"- 目标公司：{target_company}")
        if jd_text:
            lines.append(f"- 目标岗位JD（摘要）：{jd_text[:500]}")
        if isinstance(score_breakdown, dict) and score_breakdown:
            lines.append(
                f"- 评分拆解：经验{score_breakdown.get('experience', 0)} / 技能{score_breakdown.get('skills', 0)} / 格式{score_breakdown.get('format', 0)}"
            )
        if isinstance(overview, dict) and overview:
            lines.append(
                f"- 建议概览：总计{overview.get('total', 0)}，待处理{overview.get('pending', 0)}，已采纳{overview.get('accepted', 0)}，已忽略{overview.get('ignored', 0)}"
            )
        if strengths:
            lines.append(f"- 亮点：{'；'.join([str(x) for x in strengths[:6]])}")
        if weaknesses:
            lines.append(f"- 短板：{'；'.join([str(x) for x in weaknesses[:6]])}")
        if missing_keywords:
            lines.append(f"- 缺失关键词：{'、'.join([str(x) for x in missing_keywords[:12]])}")

        return '\n'.join(lines)
    except Exception:
        return ''


def _split_into_sentences(text: str):
    raw = str(text or '').strip()
    if not raw:
        return []
    parts = re.split(r'[\n\r；;。！？!?]+', raw)
    return [p.strip() for p in parts if len(p.strip()) >= 4]


def _collect_resume_fragments_for_coverage(resume_data):
    fragments = []
    if not isinstance(resume_data, dict):
        return fragments

    personal = resume_data.get('personalInfo') or {}
    summary = str(resume_data.get('summary') or personal.get('summary') or '').strip()
    for sentence in _split_into_sentences(summary):
        fragments.append({'section': 'summary', 'text': sentence, 'label': '个人简介'})

    for exp in (resume_data.get('workExps') or []):
        desc = str(exp.get('description') or '').strip()
        role = str(exp.get('subtitle') or exp.get('title') or exp.get('company') or '工作经历').strip()
        for sentence in _split_into_sentences(desc):
            fragments.append({'section': 'workExps', 'text': sentence, 'label': role})

    for proj in (resume_data.get('projects') or []):
        desc = str(proj.get('description') or '').strip()
        role = str(proj.get('title') or proj.get('subtitle') or '项目经历').strip()
        for sentence in _split_into_sentences(desc):
            fragments.append({'section': 'projects', 'text': sentence, 'label': role})

    return fragments


def _ensure_sentence_level_coverage(suggestions, resume_data):
    base = suggestions if isinstance(suggestions, list) else []
    fragments = _collect_resume_fragments_for_coverage(resume_data)
    if not fragments:
        return base

    # Hard cap to prevent extreme payloads from exploding UI.
    target_count = min(max(10, len(fragments)), 30)
    if len(base) >= target_count:
        return base

    def _norm(v: str):
        return re.sub(r'[\s\W_]+', '', str(v or '').lower())

    existing_blob = _norm(' '.join([
        str(item.get('originalValue') or '') + ' ' + str(item.get('reason') or '') + ' ' + str(item.get('title') or '')
        for item in base if isinstance(item, dict)
    ]))

    augmented = list(base)
    used = len(augmented)
    for frag in fragments:
        if used >= target_count:
            break
        sentence = str(frag.get('text') or '').strip()
        if not sentence:
            continue
        ns = _norm(sentence)
        if ns and ns in existing_blob:
            continue
        section = str(frag.get('section') or 'workExps')
        label = str(frag.get('label') or '简历内容')
        suggested = (
            f"在{label}中，我主导/参与了【具体任务】，通过【关键行动与方法】实现了【可量化结果，如效率提升XX%、成本下降XX%、转化提升XX%】。"
        )
        augmented.append({
            'id': f'suggestion-coverage-{used + 1}',
            'type': 'optimization',
            'title': f'{label}句子精修',
            'reason': '该句描述偏简略，缺少职责边界、行动细节与量化结果，建议按 STAR 结构完整表达。',
            'targetSection': section,
            'targetField': 'description' if section in ('workExps', 'projects') else ('summary' if section == 'summary' else None),
            'originalValue': sentence,
            'suggestedValue': suggested
        })
        used += 1
    return augmented


def _build_analysis_prompt(*, resume_data, job_description, rag_context, format_resume_for_ai, analysis_stage='pre_interview'):
    stage = str(analysis_stage or '').strip().lower()
    if stage == 'pre_interview':
        if job_description:
            return f"""
你是一位严格的招聘顾问。当前处于“微访谈前预评估”阶段，只需给出粗粒度评价，不做详细改写。
要求：
1) 只输出总体判断、分维度评分、亮点与短板，不生成逐条优化建议。
2) `suggestions` 必须返回空数组 []。
3) 总结控制在 80~150 字，语气客观。
4) 可给出缺失关键词（missingKeywords），但不要给可直接替换的改写文本。
5) 返回合法 JSON，字段值中文。

简历：
{format_resume_for_ai(resume_data)}

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
  "summary": "微访谈前初步评估总结",
  "targetCompany": "从JD识别出的目标公司名称，无法确定时返回空字符串",
  "targetCompanyConfidence": 0.0,
  "strengths": ["亮点1", "亮点2"],
  "weaknesses": ["短板1", "短板2", "短板3"],
  "suggestions": [],
  "missingKeywords": ["关键词1", "关键词2"]
}}

{rag_context}
"""
        return f"""
你是一位严格的招聘顾问。当前处于“微访谈前预评估”阶段，只需给出粗粒度评价，不做详细改写。
要求：
1) 只输出总体判断、分维度评分、亮点与短板，不生成逐条优化建议。
2) `suggestions` 必须返回空数组 []。
3) 总结控制在 80~150 字，语气客观。
4) 返回合法 JSON，字段值中文。

简历：
{format_resume_for_ai(resume_data)}

仅返回 JSON：
{{
  "score": 60,
  "scoreBreakdown": {{
    "experience": 58,
    "skills": 52,
    "format": 66
  }},
  "summary": "微访谈前初步评估总结",
  "targetCompany": "",
  "targetCompanyConfidence": 0.0,
  "strengths": ["亮点1", "亮点2"],
  "weaknesses": ["短板1", "短板2", "短板3"],
  "suggestions": [],
  "missingKeywords": []
}}

{rag_context}
"""

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
6.1 **逐句覆盖要求（强制）**：对简历中每条可见叙述句（尤其是工作经历/项目经历/个人简介中的句子）都要进行详细评测；每条句子至少对应 1 条可执行优化建议，禁止“挑重点略过”。
6.2 **一次性完整优化（强制）**：本次输出必须覆盖整份简历，不允许只优化一部分后结束。
7. 确保 JSON 格式正确，所有字段值使用中文（除技术术语外）。
7.1 **目标公司提取（强制）**：若 JD 中能识别招聘公司，请在 `targetCompany` 字段返回公司名称；若无法确定，返回空字符串。
7.2 **目标公司置信度（强制）**：请在 `targetCompanyConfidence` 返回 0~1 的数字。1 表示非常确定，0 表示无法判断。
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
12. **项目经历补全规则（强制）**：
   - 若简历缺少项目经历（projects 为空或几乎无有效内容），必须至少生成 1 条“补充项目经历”建议。
   - 该建议的 targetSection 必须为 "projects"，禁止写入 "workExps"。
   - 建议内容应围绕项目结构化要素：项目背景/目标、个人职责、关键行动、量化结果。
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
  "targetCompany": "从JD识别出的目标公司名称，无法确定时返回空字符串",
  "targetCompanyConfidence": 0.0,
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
  "targetCompany": "从JD识别出的目标公司名称，无法确定时返回空字符串",
  "targetCompanyConfidence": 0.0,
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
    analysis_stage = str((data or {}).get('analysisStage') or 'pre_interview').strip().lower()
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

    can_run_analysis_ai = deps.get('can_run_analysis_ai')
    analysis_ai_enabled = bool(can_run_analysis_ai(current_user_id, data)) if callable(can_run_analysis_ai) else bool(deps['gemini_client'] and deps['check_gemini_quota']())

    if analysis_ai_enabled:
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
                analysis_stage=analysis_stage,
            )

            analysis_models_tried = deps['get_analysis_model_candidates']()
            response, used_model = deps['analysis_generate_content_resilient'](
                current_user_id=current_user_id,
                data=data,
                prompt=prompt,
                analysis_models_tried=analysis_models_tried,
            )

            ai_result = deps['parse_ai_response'](response.text)
            if pii_masker:
                ai_result = pii_masker.unmask_object(ai_result)
            model_target_company = str(ai_result.get('targetCompany') or '').strip()
            fallback_target_company, fallback_confidence = _fallback_extract_company_with_confidence(job_description)
            model_confidence = _normalize_company_confidence(ai_result.get('targetCompanyConfidence'), default=0.0)
            extracted_target_company = model_target_company or fallback_target_company
            target_company_confidence = model_confidence if model_target_company else fallback_confidence
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
            if analysis_stage == 'pre_interview':
                ai_result['suggestions'] = []
            else:
                ai_result['suggestions'] = _sanitize_suggestions_for_metric_consistency(filtered_suggestions, resume_data)
                ai_result['suggestions'] = _ensure_sentence_level_coverage(ai_result.get('suggestions', []), resume_data)
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
                'analysisStage': analysis_stage,
                'targetCompany': extracted_target_company,
                'targetCompanyConfidence': _normalize_company_confidence(target_company_confidence),
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
            fallback_target_company, fallback_confidence = _fallback_extract_company_with_confidence(job_description)
            if analysis_stage == 'pre_interview':
                suggestions = []
            else:
                suggestions = [
                    suggestion for suggestion in (suggestions or [])
                    if not deps['is_gender_related_suggestion'](suggestion) and not deps['is_education_related_suggestion'](suggestion)
                ]
                suggestions = _sanitize_suggestions_for_metric_consistency(suggestions, resume_data)
                suggestions = _ensure_sentence_level_coverage(suggestions, resume_data)

            return {
                'score': score,
                'summary': '智能分析暂时不可用，已生成基础分析报告，建议稍后再试。',
                'suggestions': suggestions,
                'strengths': ['结构清晰', '格式规范'],
                'weaknesses': ['智能分析暂不可用', '请稍后重试以获取更详细分析'],
                'missingKeywords': [] if not job_description else ['智能分析暂不可用'],
                'analysisStage': analysis_stage,
                'targetCompany': fallback_target_company,
                'targetCompanyConfidence': _normalize_company_confidence(fallback_confidence),
                'reference_cases': reference_cases,
                'rag_enabled': rag_enabled,
                'rag_requested': rag_requested,
                'rag_strategy': rag_strategy.get('mode'),
                'analysis_model': None,
                'analysis_models_tried': analysis_models_tried if 'analysis_models_tried' in locals() else [],
                'analysis_error': str(ai_error)[:500]
            }, 200

    score = deps['calculate_resume_score'](resume_data)
    suggestions = [] if analysis_stage == 'pre_interview' else deps['generate_suggestions'](resume_data, score)
    fallback_target_company, fallback_confidence = _fallback_extract_company_with_confidence(job_description)
    if analysis_stage != 'pre_interview':
        suggestions = [
            suggestion for suggestion in (suggestions or [])
            if not deps['is_gender_related_suggestion'](suggestion) and not deps['is_education_related_suggestion'](suggestion)
        ]
        suggestions = _sanitize_suggestions_for_metric_consistency(suggestions, resume_data)
        suggestions = _ensure_sentence_level_coverage(suggestions, resume_data)
    return {
        'score': score,
        'summary': '简历分析完成，请查看优化建议。',
        'suggestions': suggestions,
        'strengths': ['结构清晰', '格式规范'],
        'weaknesses': ['缺少量化结果', '技能描述过于笼统'],
        'missingKeywords': [] if not job_description else ['正在分析关键词...'],
        'analysisStage': analysis_stage,
        'targetCompany': fallback_target_company,
        'targetCompanyConfidence': _normalize_company_confidence(fallback_confidence),
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
                "你是JD文本OCR助手。"
                "任务：从图片中提取完整职位描述（JD）文本。"
                "要求：保留原有分段和项目符号；去掉无关UI文字；只输出纯文本，不要解释，不要Markdown，不要JSON。"
            )
            from base64 import b64decode
            mime_type = "image/png"
            base64_data = image

            match = re.match(r'^data:(image/[a-zA-Z0-9.+-]+);base64,(.*)$', image, flags=re.DOTALL)
            if match:
                mime_type = (match.group(1) or "image/png").strip().lower()
                base64_data = match.group(2)

            image_data = b64decode(base64_data)
            if len(image_data) > 8 * 1024 * 1024:
                return {'success': False, 'text': '', 'error': '图片过大，请裁剪后重试（建议不超过 8MB）。'}, 200
            contents = [prompt, types.Part.from_bytes(data=image_data, mime_type=mime_type)]
            get_jd_candidates = deps.get('get_jd_ocr_model_candidates')
            if callable(get_jd_candidates):
                candidate_models = get_jd_candidates()
            else:
                candidate_models = deps['get_ocr_model_candidates']()

            last_error = None
            for model_name in candidate_models:
                try:
                    response = deps['gemini_client'].models.generate_content(
                        model=model_name,
                        contents=contents,
                        config=types.GenerateContentConfig(
                            temperature=0,
                            max_output_tokens=2200,
                        ),
                    )
                    text = (response.text or '').strip()
                    if text.startswith("```"):
                        text = re.sub(r"^```[a-zA-Z]*\s*", "", text)
                        text = re.sub(r"\s*```$", "", text).strip()
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


def _decode_audio_payload(audio):
    from base64 import b64decode

    if not isinstance(audio, dict) or not audio.get('data'):
        raise ValueError('缺少音频数据')

    mime_type = (audio.get('mime_type') or 'audio/webm').strip().lower()
    base64_data = audio.get('data') or ''
    match = re.match(r'^data:(audio/[a-zA-Z0-9.+-]+);base64,(.*)$', base64_data, flags=re.DOTALL)
    if match:
        mime_type = (match.group(1) or mime_type).strip().lower()
        base64_data = match.group(2)
    return b64decode(base64_data), mime_type


def _transcribe_audio_with_gemini(audio, deps, *, lang: str = 'zh-CN'):
    logger = deps['logger']
    try:
        audio_bytes, mime_type = _decode_audio_payload(audio)
    except Exception as dec_err:
        logger.warning("Transcribe audio decode failed: %s", dec_err)
        return '', '', '音频解码失败'

    if deps.get('gemini_client') and deps.get('check_gemini_quota') and deps['check_gemini_quota']():
        transcribe_models = []
        get_candidates = deps.get('get_transcribe_model_candidates')
        if callable(get_candidates):
            try:
                transcribe_models = list(get_candidates() or [])
            except Exception:
                transcribe_models = []
        if not transcribe_models:
            transcribe_models = ['gemini-2.5-flash-lite', 'gemini-2.5-flash']

        prompt = (
            f"请将这段音频转写为{lang}纯文本，只输出转写结果本身，不要解释、不要标点修饰、不要加前缀。"
        )
        contents = [prompt, types.Part.from_bytes(data=audio_bytes, mime_type=mime_type)]
        last_gemini_error = None
        for model_name in transcribe_models:
            try:
                response, used_model = deps['_gemini_generate_content_resilient'](model_name, contents, want_json=False)
                text = str(getattr(response, 'text', '') or '').strip()
                if text:
                    return text, f'gemini:{used_model}', ''
            except Exception as model_err:
                last_gemini_error = model_err
                logger.warning("Gemini transcribe failed on model %s: %s", model_name, model_err)
        if last_gemini_error is not None:
            logger.warning("Gemini transcribe all models failed: %s", last_gemini_error)

    return '', '', '转写未配置或不可用（请检查 GEMINI_API_KEY / 转写模型配置）'


def ai_chat_core(data, deps):
    mode = (data.get('mode') or '').strip().lower()
    message = data.get('message', '')
    audio = data.get('audio')
    resume_data = data.get('resumeData')
    diagnosis_dossier = data.get('diagnosisDossier') or {}
    job_description = data.get('jobDescription', '')
    chat_history = data.get('chatHistory', [])
    interview_type = str(data.get('interviewType') or 'general').strip().lower()
    diagnosis_context = _format_diagnosis_dossier(diagnosis_dossier)

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

    if mode == 'interview_plan':
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

        default_questions = [
            '请介绍一个你最有代表性的项目，并说明你的具体职责。',
            '这个项目的关键挑战是什么？你是如何解决的？',
            '请分享一次跨团队协作推进结果的案例。',
            '请讲一个你做过关键决策的场景，并说明你的判断依据。',
            '如果再做一次，你会如何优化？',
            '你为什么想加入这个岗位/公司？你的3个月目标是什么？',
            '请补充一个能体现你岗位匹配度的经历或成果。',
        ]
        def _sanitize_plan_questions(items, *, min_count=4, max_count=12):
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
                'questions': _sanitize_plan_questions(default_questions),
                'coverage': ['岗位匹配', '项目经历', '问题解决', '协作沟通', '复盘优化', '动机规划'],
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
- 结合岗位JD与候选人简历定制，问题要具体。
- 一次性给出全部题目，题量由你根据岗位复杂度与候选人背景自行决定。
- 题量建议区间：5~9题；若岗位很复杂可适度增加，但不超过12题。
- 题目顺序要从浅入深，覆盖面完整，避免语义重复。
- 严禁出现“自我介绍”相关题目（例如“请做自我介绍/介绍一下你自己”）。
- 严禁生成与本场热身题重合或近似的题目。本场热身题为：{warmup_question}
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
            questions = _sanitize_plan_questions(questions or default_questions)
            return {'success': True, 'questions': questions, 'coverage': coverage}, 200
        except Exception as e:
            deps['logger'].warning("Interview plan generation failed: %s", e)
            return {
                'success': True,
                'questions': _sanitize_plan_questions(default_questions),
                'coverage': ['岗位匹配', '项目经历', '问题解决', '协作沟通', '复盘优化', '动机规划'],
            }, 200

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
                transcript, _provider, _err = _transcribe_audio_with_gemini(audio, deps, lang='zh-CN')
            except Exception as stt_err:
                deps['logger'].warning("Interview STT check failed, continuing without transcript: %s", stt_err)
                transcript = ''
            if not str(transcript or '').strip():
                question = last_q or '请再说一遍你的回答。'
                return {'response': f"我没有识别到有效的语音内容。请重新回答：{question}"}, 200
            clean_message = str(transcript).strip()

        if _is_low_information_answer(clean_message):
            question = last_q or '请把你的回答说得更具体一些。'
            return {'response': f"你的回答信息量不足。请只补充当前问题中缺失的关键点（例如你的具体职责、行动细节、结果数据），无需整题重答。当前问题：{question}"}, 200

    if deps['gemini_client'] and deps['check_gemini_quota']():
        try:
            formatted_chat = ""
            for message_obj in chat_history:
                role = "候选人" if message_obj.get('role') == 'user' else "面试官"
                msg_text = message_obj.get('text', '').replace('[INTERVIEW_MODE]', '').strip()
                if msg_text and not msg_text.startswith('SYSTEM_') and (not _is_voice_placeholder_text(msg_text)):
                    formatted_chat += f"{role}: {msg_text}\n"
            self_intro_asked_before = False
            for message_obj in chat_history:
                if not isinstance(message_obj, dict):
                    continue
                if message_obj.get('role') != 'model':
                    continue
                model_text = str(message_obj.get('text') or '')
                if re.search(r'(自我介绍|介绍一下你自己|简单介绍一下自己)', model_text):
                    self_intro_asked_before = True
                    break

            interview_summary_model = deps.get('GEMINI_INTERVIEW_SUMMARY_MODEL', deps.get('GEMINI_INTERVIEW_MODEL'))
            interview_chat_model = deps.get('GEMINI_INTERVIEW_MODEL')
            active_chat_model = interview_summary_model if mode == 'interview_summary' else interview_chat_model

            if mode == 'interview_summary':
                prompt = f"""
【严格角色】你是专业 AI 面试官。现在面试已结束，请基于职位描述、候选人简历与完整对话记录输出“面试综合分析”。
要求：
- 用中文输出；不要提出下一题。
- 重点结合：候选人回答质量（结构、深度、证据、数据/影响）、简历内容与 JD 匹配度、岗位核心能力缺口。
- 必须给出总分（0-100 的整数）。
- 输出结构：
1) 总分：XX/100（必须是整数）
2) 综合评价（3-5句）
3) 表现亮点（3-6条）
4) 需要加强的地方（5-8条，每条包含：问题 -> 如何改进 -> 建议练习/准备素材）
5) JD 匹配度与缺口（分点说明）
6) 简历可改进点（3-6条，针对表达与证据补强）
7) 1-2 周训练计划（按天/按主题）

职位描述：{job_description if job_description else '未提供'}
简历信息：{deps['format_resume_for_ai'](resume_data) if resume_data else '未提供'}
对话记录：{formatted_chat if formatted_chat else '无'}
候选人结束指令：{clean_message if clean_message else '（无）'}
"""
            else:
                persona_prompts = {
                    'technical': "你是极客型技术面试官（Technical Interviewer）。\n风格：深度挖掘技术细节，喜欢追问底层原理、系统设计与性能优化，对模糊回答零容忍。\n关注点：技术栈掌握度、解决复杂问题能力、代码质量、系统架构思维。",
                    'hr': "你是资深 HR 面试官（HR Interviewer）。\n风格：温和但敏锐，关注候选人的软性素质、动机匹配度与文化契合度，会用 STAR 法则挖掘行为细节。\n关注点：沟通协作、职业稳定性、驱动力、抗压能力、价值观。",
                    'general': "你是专业且平衡的综合面试官（General Interviewer）。\n风格：既关注业务能力也关注综合素质，提问覆盖面广，节奏平稳。\n关注点：简历真实性、过往业绩、核心胜任力。"
                }
                persona_instruction = persona_prompts.get(interview_type, persona_prompts['general'])
                style_rules = {
                    'technical': "提问要求：优先围绕候选人项目做技术深挖，至少覆盖1个技术决策追问和1个性能/稳定性追问。问题尽量具体到技术栈、架构、trade-off。",
                    'hr': "提问要求：优先行为面与动机面，使用 STAR 导向追问，重点覆盖沟通冲突、压力场景、职业选择与文化匹配，不问底层技术细节。",
                    'general': "提问要求：在业务结果、项目实践、协作能力间保持平衡，问题覆盖广但不过度深挖单一方向。"
                }
                interview_style_instruction = style_rules.get(interview_type, style_rules['general'])
                if interview_type in ('technical', 'hr'):
                    self_intro_policy_instruction = "自我介绍规则：当前不是初试场景，严禁要求候选人做自我介绍。"
                elif self_intro_asked_before:
                    self_intro_policy_instruction = "自我介绍规则：历史对话中已完成自我介绍，后续严禁再次要求自我介绍。"
                else:
                    self_intro_policy_instruction = "自我介绍规则：仅在初试场景可出现一次自我介绍题，且只能作为开场首题。"

                prompt = f"""
 【严格角色】{persona_instruction}
 基于职位描述和候选人简历进行模拟面试。
 禁止提及任何评分，禁止给出建议，保持面试官角色。
 {interview_style_instruction}
 {self_intro_policy_instruction}
 规则：
 - 如果候选人回答为空、无法识别、与问题无关或信息量明显不足：不要肯定/夸赞；不要进入下一题。
 - 优先采用“定点补充追问”：明确指出缺失维度（如职责边界、关键行动、量化结果、决策依据），要求候选人只补充该部分。
 - 仅当回答几乎为空或完全跑题时，才要求整题重答并重复当前问题。
 - 输出为纯文本，不要使用任何 Markdown 标记，不要出现任何 * 号。
 - 如需提出下一题，必须另起一行，以“下一题：”开头输出（不要把下一题放进参考回复里）。
 - 如果下一道问题是自我介绍（如“请做一下自我介绍”），请在问题中提醒：自我介绍时间为1分钟（不要再追加“请将回答控制在3分钟内”）
 - 其它所有下一道具体问题，问题末尾必须追加：请将回答控制在3分钟内
 职位描述：{job_description if job_description else '未提供'}
 简历信息：{deps['format_resume_for_ai'](resume_data) if resume_data else '未提供'}
 诊断档案：{diagnosis_context if diagnosis_context else '未提供'}
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

            response, _used = deps['_gemini_generate_content_resilient'](active_chat_model, contents, want_json=False)
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
    diagnosis_dossier = data.get('diagnosisDossier') or {}
    job_description = data.get('jobDescription', '')
    chat_history = data.get('chatHistory', [])
    interview_type = str(data.get('interviewType') or 'general').strip().lower()
    diagnosis_context = _format_diagnosis_dossier(diagnosis_dossier)

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
                transcript, _provider, _err = _transcribe_audio_with_gemini(audio, deps, lang='zh-CN')
            except Exception as stt_err:
                deps['logger'].warning("Interview STT check failed, continuing without transcript: %s", stt_err)
                transcript = ''
            if not str(transcript or '').strip():
                question = last_q or '请再说一遍你的回答。'
                return None, {'response': f"我没有识别到有效的语音内容。请重新回答：{question}"}, 200
            clean_message = str(transcript).strip()

        if _is_low_information_answer(clean_message):
            question = last_q or '请把你的回答说得更具体一些。'
            return None, {'response': f"你的回答信息量不足。请只补充当前问题中缺失的关键点（例如你的具体职责、行动细节、结果数据），无需整题重答。当前问题：{question}"}, 200

    if not (deps['gemini_client'] and deps['check_gemini_quota']()):
        return None, {'response': '面试官暂时开小差了。'}, 200

    formatted_chat = ""
    for message_obj in chat_history:
        role = "候选人" if message_obj.get('role') == 'user' else "面试官"
        msg_text = message_obj.get('text', '').replace('[INTERVIEW_MODE]', '').strip()
        if msg_text and not msg_text.startswith('SYSTEM_') and (not _is_voice_placeholder_text(msg_text)):
            formatted_chat += f"{role}: {msg_text}\n"
    self_intro_asked_before = False
    for message_obj in chat_history:
        if not isinstance(message_obj, dict):
            continue
        if message_obj.get('role') != 'model':
            continue
        model_text = str(message_obj.get('text') or '')
        if re.search(r'(自我介绍|介绍一下你自己|简单介绍一下自己)', model_text):
            self_intro_asked_before = True
            break

    is_self_intro_q = bool(re.search(r'(自我介绍|介绍一下你自己|简单介绍一下自己)', _get_last_interviewer_question(chat_history) or ''))

    if mode == 'interview_summary':
        prompt = f"""
【严格角色】你是专业 AI 面试官。现在面试已结束，请基于职位描述、候选人简历与完整对话记录输出“面试综合分析”。
要求：
- 用中文输出；不要提出下一题。
- 重点结合：候选人回答质量（结构、深度、证据、数据/影响）、简历内容与 JD 匹配度、岗位核心能力缺口。
- 必须给出总分（0-100 的整数）。
- 输出结构：
1) 总分：XX/100（必须是整数）
2) 综合评价（3-5句）
3) 表现亮点（3-6条）
4) 需要加强的地方（5-8条，每条包含：问题 -> 如何改进 -> 建议练习/准备素材）
5) JD 匹配度与缺口（分点说明）
6) 简历可改进点（3-6条，针对表达与证据补强）
7) 1-2 周训练计划（按天/按主题）

职位描述：{job_description if job_description else '未提供'}
简历信息：{deps['format_resume_for_ai'](resume_data) if resume_data else '未提供'}
诊断档案：{diagnosis_context if diagnosis_context else '未提供'}
对话记录：{formatted_chat if formatted_chat else '无'}
候选人结束指令：{clean_message if clean_message else '（无）'}
"""
    else:
        persona_prompts = {
            'technical': "你是极客型技术面试官（Technical Interviewer）。\n风格：深度挖掘技术细节，喜欢追问底层原理、系统设计与性能优化，对模糊回答零容忍。\n关注点：技术栈掌握度、解决复杂问题能力、代码质量、系统架构思维。",
            'hr': "你是资深 HR 面试官（HR Interviewer）。\n风格：温和但敏锐，关注候选人的软性素质、动机匹配度与文化契合度，会用 STAR 法则挖掘行为细节。\n关注点：沟通协作、职业稳定性、驱动力、抗压能力、价值观。",
            'general': "你是专业且平衡的综合面试官（General Interviewer）。\n风格：既关注业务能力也关注综合素质，提问覆盖面广，节奏平稳。\n关注点：简历真实性、过往业绩、核心胜任力。"
        }
        persona_instruction = persona_prompts.get(interview_type, persona_prompts['general'])
        style_rules = {
            'technical': "提问要求：优先围绕候选人项目做技术深挖，至少覆盖1个技术决策追问和1个性能/稳定性追问。问题尽量具体到技术栈、架构、trade-off。",
            'hr': "提问要求：优先行为面与动机面，使用 STAR 导向追问，重点覆盖沟通冲突、压力场景、职业选择与文化匹配，不问底层技术细节。",
            'general': "提问要求：在业务结果、项目实践、协作能力间保持平衡，问题覆盖广但不过度深挖单一方向。"
        }
        interview_style_instruction = style_rules.get(interview_type, style_rules['general'])
        if interview_type in ('technical', 'hr'):
            self_intro_policy_instruction = "自我介绍规则：当前不是初试场景，严禁要求候选人做自我介绍。"
        elif self_intro_asked_before:
            self_intro_policy_instruction = "自我介绍规则：历史对话中已完成自我介绍，后续严禁再次要求自我介绍。"
        else:
            self_intro_policy_instruction = "自我介绍规则：仅在初试场景可出现一次自我介绍题，且只能作为开场首题。"
        prompt = f"""
【严格角色】{persona_instruction}
基于职位描述和候选人简历进行模拟面试。
禁止提及任何评分，禁止给出建议，保持面试官角色。
{interview_style_instruction}
{self_intro_policy_instruction}
规则：
- 如果候选人回答为空、无法识别、与问题无关或信息量明显不足：不要肯定/夸赞；不要进入下一题。
- 优先采用“定点补充追问”：明确指出缺失维度（如职责边界、关键行动、量化结果、决策依据），要求候选人只补充该部分。
- 仅当回答几乎为空或完全跑题时，才要求整题重答并重复当前问题。
- 输出为纯文本，不要使用任何 Markdown 标记，不要出现任何 * 号。
- 如需提出下一题，必须另起一行，以“下一题：”开头输出（不要把下一题放进参考回复里）。
- 如果下一道问题是自我介绍（如“请做一下自我介绍”），请在问题中提醒：自我介绍时间为1分钟（不要再追加“请将回答控制在3分钟内”）
- 其它所有下一道具体问题，问题末尾必须追加：请将回答控制在3分钟内
职位描述：{job_description if job_description else '未提供'}
简历信息：{deps['format_resume_for_ai'](resume_data) if resume_data else '未提供'}
诊断档案：{diagnosis_context if diagnosis_context else '未提供'}
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
    interview_summary_model = deps.get('GEMINI_INTERVIEW_SUMMARY_MODEL', deps.get('GEMINI_INTERVIEW_MODEL'))
    interview_chat_model = deps.get('GEMINI_INTERVIEW_MODEL')
    active_chat_model = interview_summary_model if mode == 'interview_summary' else interview_chat_model

    def _iter_events():
        if not callable(stream_api):
            try:
                response, _used = deps['_gemini_generate_content_resilient'](active_chat_model, contents, want_json=False)
                text = (response.text or "").replace('*', '').strip()
                yield {'type': 'done', 'text': text or '感谢你的回答，我们继续下一题。'}
                return
            except Exception as fallback_err:
                deps['logger'].error("AI 面试流式降级失败: %s", fallback_err)
                yield {'type': 'error', 'message': '面试官暂时开小差了，请稍后再试。'}
                return

        full_text = ''
        try:
            for chunk in stream_api(model=active_chat_model, contents=contents):
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

    text, provider, error = _transcribe_audio_with_gemini(audio, deps, lang=lang)
    if text:
        return {'success': True, 'text': text, 'provider': provider}, 200
    return {'success': False, 'text': '', 'error': error or '转写失败'}, 200
