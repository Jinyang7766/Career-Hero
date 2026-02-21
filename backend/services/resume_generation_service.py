import copy
import json
import re

from google.genai import types


def _build_resume_fallback(resume_data):
    return _sync_resume_alias_fields(_normalize_resume_shape(resume_data or {}))


def _normalize_resume_shape(data):
    resume = copy.deepcopy(data) if isinstance(data, dict) else {}
    if not isinstance(resume.get('personalInfo'), dict):
        resume['personalInfo'] = {}
    if not isinstance(resume.get('workExps'), list):
        resume['workExps'] = []
    if not isinstance(resume.get('educations'), list):
        resume['educations'] = []
    if not isinstance(resume.get('projects'), list):
        resume['projects'] = []
    if not isinstance(resume.get('skills'), list):
        resume['skills'] = []
    if resume.get('summary') is None:
        resume['summary'] = ''
    return resume


def _remove_location_field(resume):
    return _normalize_resume_shape(resume or {})


def _build_date_from_range(start_date, end_date):
    start = str(start_date or '').strip()
    end = str(end_date or '').strip()
    if start and end:
        return f"{start} - {end}"
    return start or end


def _sync_resume_alias_fields(resume):
    next_resume = _normalize_resume_shape(resume or {})

    for item in next_resume.get('workExps') or []:
        if not isinstance(item, dict):
            continue
        company = str(item.get('company') or '').strip()
        title = str(item.get('title') or '').strip()
        position = str(item.get('position') or '').strip()
        subtitle = str(item.get('subtitle') or '').strip()
        if company and not title:
            item['title'] = company
        if title and not company:
            item['company'] = title
        if position and not subtitle:
            item['subtitle'] = position
        if subtitle and not position:
            item['position'] = subtitle
        if not str(item.get('date') or '').strip():
            item['date'] = _build_date_from_range(item.get('startDate'), item.get('endDate'))

    for item in next_resume.get('educations') or []:
        if not isinstance(item, dict):
            continue
        school = str(item.get('school') or '').strip()
        title = str(item.get('title') or '').strip()
        major = str(item.get('major') or '').strip()
        subtitle = str(item.get('subtitle') or '').strip()
        if school and not title:
            item['title'] = school
        if title and not school:
            item['school'] = title
        if major and not subtitle:
            item['subtitle'] = major
        if subtitle and not major:
            item['major'] = subtitle
        if not str(item.get('date') or '').strip():
            item['date'] = _build_date_from_range(item.get('startDate'), item.get('endDate'))

    for item in next_resume.get('projects') or []:
        if not isinstance(item, dict):
            continue
        role = str(item.get('role') or '').strip()
        subtitle = str(item.get('subtitle') or '').strip()
        if role and not subtitle:
            item['subtitle'] = role
        if subtitle and not role:
            item['role'] = subtitle
        if not str(item.get('date') or '').strip():
            item['date'] = _build_date_from_range(item.get('startDate'), item.get('endDate'))

    return next_resume


def _split_skill_candidates(value):
    if isinstance(value, list):
        items = []
        for item in value:
            items.extend(_split_skill_candidates(item))
        return items
    text = str(value or '').strip()
    if not text:
        return []
    parts = re.split(r'[\n\r,，、;；|]+', text)
    return [p.strip() for p in parts if str(p or '').strip()]


def _normalize_skill_text(text: str) -> str:
    value = str(text or '').strip()
    value = re.sub(r'^[\-\*\d\.\)\(、\s]+', '', value)
    value = re.sub(r'[\s。；;，,：:]+$', '', value)
    return value


def _canonicalize_skill(skill: str) -> str:
    value = _normalize_skill_text(skill)
    if not value:
        return ''
    value = value.strip('()（）[]【】{}')
    value = re.sub(r'\s+', ' ', value).strip()

    direct_map = {
        'python自动化脚本': 'Python',
        'python脚本': 'Python',
        'lora模型与精调': 'LoRA模型',
        'lora模型精调': 'LoRA模型',
        'comfyui工作流搭建': 'ComfyUI工作流',
        'aib短视频分镜': '',
        '智能化数据看板': 'Tableau',
        '跨部门协同': '',
        '活动策划': '',
    }
    compact = re.sub(r'[\s\W_]+', '', value.lower())
    if compact in direct_map:
        return direct_map[compact]

    value = re.sub(r'(自动化脚本|脚本开发|脚本编写)$', '', value, flags=re.IGNORECASE).strip()
    value = re.sub(r'(与?精调|与?微调|微调|精调|调优|优化)$', '', value, flags=re.IGNORECASE).strip()
    value = re.sub(r'(搭建|构建|设计|实现|开发|执行)$', '', value, flags=re.IGNORECASE).strip()
    value = re.sub(r'^[与和及]\s*', '', value).strip()
    value = re.sub(r'^[\(\[（【\s]+|[\)\]）】\s]+$', '', value).strip()

    if re.search(r'python', value, flags=re.IGNORECASE):
        return 'Python'
    if re.search(r'a\s*/\s*b.*(test|测试)', value, flags=re.IGNORECASE) or re.search(r'\bab\s*测试\b', value, flags=re.IGNORECASE):
        return 'A/B Test'
    if re.search(r'\broi\b', value, flags=re.IGNORECASE):
        return 'ROI'
    if re.search(r'\bsql\b', value, flags=re.IGNORECASE):
        return 'SQL'
    if re.search(r'数据分析', value):
        return '数据分析'
    if re.search(r'跨部门协同|活动策划|团队协同|沟通能力', value):
        return ''
    if re.search(r'power\s*bi', value, flags=re.IGNORECASE):
        return 'Power BI'
    if re.search(r'(^|\\b)bi(\\b|$)', value, flags=re.IGNORECASE):
        return 'BI'
    if re.search(r'tableau', value, flags=re.IGNORECASE):
        return 'Tableau'
    if re.search(r'comfyui', value, flags=re.IGNORECASE):
        return 'ComfyUI工作流'
    if re.search(r'lora', value, flags=re.IGNORECASE):
        return 'LoRA模型'
    return _normalize_skill_text(value)


def _looks_like_model_family(skill: str) -> bool:
    value = str(skill or '').strip().lower()
    if not value:
        return False
    return bool(re.search(
        r'(gpt|chatgpt|openai|claude|anthropic|kimi|moonshot|gemini|qwen|通义|deepseek|llama|glm|智谱|文心|ernie|大模型|对话模型)',
        value,
        flags=re.IGNORECASE,
    ))


def _is_hard_skill(skill: str) -> bool:
    value = _normalize_skill_text(skill)
    if not value:
        return False
    if len(value) < 2 or len(value) > 24:
        return False

    lowered = value.lower()
    if _looks_like_model_family(value):
        return True

    reject_patterns = [
        r'^(负责|参与|协助|推进|落地|搭建|构建|设计|优化|执行|管理|运营|分析|开发|实现|维护)',
        r'(能力|意识|经验|思维|协作|沟通|学习|责任心|抗压|执行力)$',
        r'(全链路|策略|方案|流程|复盘|项目经历|工作经历|业务理解)$',
        r'(建议|例如|比如|示例|待补充|可优化|可改进)',
        r'(跨部门协同|团队协同|活动策划|沟通能力|团队合作)',
    ]
    if any(re.search(p, value, flags=re.IGNORECASE) for p in reject_patterns):
        return False
    generic_non_skill = {
        '活动', '项目', '流程', '团队', '跨部门', '协作', '沟通', '执行', '运营', '管理', '复盘',
        '策略', '方案', '业务', '指标', '结果', '增长', '转化'
    }
    if value in generic_non_skill:
        return False
    if re.search(r'[。！？!?]', value):
        return False

    # Allow technical tokens and concise Chinese hard-skill nouns.
    if re.search(r'(sql|python|java|go|rust|excel|tableau|power\s*bi|sap|erp|crm|scrm|a/?b\s*test|etl|bi|llm|rag|agent|linux|docker|k8s|redis|mysql|postgres|clickhouse|hive|spark)', lowered, flags=re.IGNORECASE):
        return True

    # For Chinese tokens, keep concise hard-skill nouns.
    if re.search(r'[\u4e00-\u9fff]', value):
        if re.search(r'(管理|运营|执行|推进|落地|搭建|构建|优化)$', value):
            return False
        return bool(re.search(r'(分析|建模|预测|定价|测试|归因|分层|投放|SQL|Python|BI|算法|风控|SCRM|ERP|CRM|RAG|LLM|Agent)', value, flags=re.IGNORECASE))
    return True


def _collect_skill_keywords_from_suggestions(suggestions):
    keywords = []
    for item in suggestions or []:
        if not isinstance(item, dict):
            continue
        section = str(item.get('targetSection') or '').strip().lower()
        title = str(item.get('title') or '')
        reason = str(item.get('reason') or '')
        if section != 'skills' and ('关键词' not in title and '关键词' not in reason and '技能' not in title):
            continue
        suggested = item.get('suggestedValue')
        for candidate in _split_skill_candidates(suggested):
            keywords.append(candidate)
    return keywords


def _normalize_and_merge_skills(generated_resume, source_resume, suggestions):
    next_resume = _normalize_resume_shape(generated_resume or {})
    source = _normalize_resume_shape(source_resume or {})
    generated_skills_raw = next_resume.get('skills') or []
    source_skills_raw = source.get('skills') or []
    suggested_skill_keywords = _collect_skill_keywords_from_suggestions(suggestions or [])

    source_candidates = _split_skill_candidates(source_skills_raw)
    generated_candidates = _split_skill_candidates(generated_skills_raw)
    suggested_candidates = _split_skill_candidates(suggested_skill_keywords)

    merged = []
    seen = set()

    def _append_skill(raw_skill):
        text = str(raw_skill or '').strip()
        if not text:
            return
        key = re.sub(r'[\s\W_]+', '', text.lower())
        if not key or key in seen:
            return
        seen.add(key)
        merged.append(text)

    # Preserve all original user skills first (do not drop user facts).
    for candidate in source_candidates:
        _append_skill(_normalize_skill_text(candidate))

    # Then append model-generated/suggested hard skills when valid.
    for candidate in [*generated_candidates, *suggested_candidates]:
        skill = _canonicalize_skill(candidate)
        if not skill:
            continue
        if _looks_like_model_family(skill):
            skill = 'LLM'
        if not _is_hard_skill(skill):
            continue
        _append_skill(skill)

    next_resume['skills'] = merged[:40]
    return next_resume


def _normalize_text(value: str) -> str:
    return re.sub(r'[\s\W_]+', '', str(value or '').lower())


def _build_suggestions_context(suggestions):
    normalized_suggestions = []
    for idx, suggestion in enumerate((suggestions or [])[:60], start=1):
        if not isinstance(suggestion, dict):
            continue
        normalized_suggestions.append(
            {
                'id': suggestion.get('id') or f'suggestion-{idx}',
                'title': suggestion.get('title') or '优化建议',
                'reason': suggestion.get('reason') or '',
                'targetSection': suggestion.get('targetSection') or '',
                'targetField': suggestion.get('targetField') or '',
                'originalValue': suggestion.get('originalValue') or '',
                'suggestedValue': suggestion.get('suggestedValue') or '',
                'status': suggestion.get('status') or '',
            }
        )
    suggestions_text_blocks = []
    for s in normalized_suggestions:
        suggested_value = s['suggestedValue']
        if isinstance(suggested_value, (list, dict)):
            suggested_value = json.dumps(suggested_value, ensure_ascii=False)
        suggestions_text_blocks.append(
            f"- [{s['id']}] section={s['targetSection']} field={s['targetField']} title={s['title']}\n"
            f"  reason={s['reason']}\n"
            f"  original={s['originalValue']}\n"
            f"  suggested={suggested_value}"
        )
    return normalized_suggestions, ('\n'.join(suggestions_text_blocks) if suggestions_text_blocks else '无')


def _extract_section_text(resume, section: str) -> str:
    sec = str(section or '').strip().lower()
    if sec == 'summary':
        return str((resume or {}).get('summary', '') or '')
    if sec == 'workexps':
        return '\n'.join([str((x or {}).get('description', '') or '') for x in ((resume or {}).get('workExps') or [])])
    if sec == 'projects':
        return '\n'.join([str((x or {}).get('description', '') or '') for x in ((resume or {}).get('projects') or [])])
    if sec == 'skills':
        skills = (resume or {}).get('skills') or []
        return ' '.join([str(x or '') for x in skills]) if isinstance(skills, list) else str(skills or '')
    if sec == 'personalinfo':
        pi = (resume or {}).get('personalInfo') or {}
        return ' '.join([
            str(pi.get('name') or ''),
            str(pi.get('title') or ''),
            str(pi.get('email') or ''),
            str(pi.get('phone') or ''),
            str(pi.get('location') or ''),
        ])
    return json.dumps(resume or {}, ensure_ascii=False)


def _detect_unresolved_suggestions(resume, suggestions):
    unresolved = []
    for s in suggestions or []:
        original = str((s or {}).get('originalValue') or '').strip()
        if not original:
            continue
        original_norm = _normalize_text(original)
        if len(original_norm) < 4:
            continue
        section = str((s or {}).get('targetSection') or '').strip().lower()
        section_text = _extract_section_text(resume, section)
        if original_norm and original_norm in _normalize_text(section_text):
            unresolved.append(s)
    return unresolved[:20]


def _normalize_contact(value):
    return str(value or '').strip()


def _restore_original_contacts(generated_resume, source_resume):
    next_resume = _normalize_resume_shape(generated_resume or {})
    source = source_resume if isinstance(source_resume, dict) else {}
    source_pi = source.get('personalInfo') or {}
    target_pi = next_resume.get('personalInfo') or {}

    source_email = _normalize_contact(source_pi.get('email'))
    source_phone = _normalize_contact(source_pi.get('phone'))
    source_name = _normalize_contact(source_pi.get('name'))

    if source_name:
        target_pi['name'] = source_name
    if source_email:
        target_pi['email'] = source_email
    if source_phone:
        target_pi['phone'] = source_phone
    for field in ('title', 'location', 'linkedin', 'website', 'avatar', 'age'):
        src_value = _normalize_contact(source_pi.get(field))
        if src_value and not _normalize_contact(target_pi.get(field)):
            target_pi[field] = src_value

    next_resume['personalInfo'] = target_pi
    if _is_non_empty(source.get('gender')) and not _is_non_empty(next_resume.get('gender')):
        next_resume['gender'] = source.get('gender')
    if _is_non_empty(source.get('templateId')) and not _is_non_empty(next_resume.get('templateId')):
        next_resume['templateId'] = source.get('templateId')
    return next_resume


def _is_non_empty(value):
    return str(value or '').strip() != ''


def _merge_section_items_with_fact_guard(source_items, generated_items, *, factual_fields):
    source = source_items if isinstance(source_items, list) else []
    generated = generated_items if isinstance(generated_items, list) else []

    # Keep at least the same number of source items; never drop existing records.
    merged = []
    for index, src in enumerate(source):
        src_item = src if isinstance(src, dict) else {}
        gen_item = generated[index] if index < len(generated) and isinstance(generated[index], dict) else {}
        item = dict(gen_item)

        # Protect immutable factual fields from drift/hallucination.
        for field in factual_fields:
            src_value = src_item.get(field)
            if _is_non_empty(src_value):
                item[field] = src_value

        # Always keep source id when present for stable mapping.
        if 'id' in src_item and src_item.get('id') is not None:
            item['id'] = src_item.get('id')

        # Preserve source description if model output is empty.
        if _is_non_empty(src_item.get('description')) and (not _is_non_empty(item.get('description'))):
            item['description'] = src_item.get('description')

        merged.append(item)

    # Append extra generated items only when source list is empty.
    if not source:
        merged.extend([x for x in generated if isinstance(x, dict)])

    return merged


def _restore_source_fact_boundaries(generated_resume, source_resume):
    next_resume = _normalize_resume_shape(generated_resume or {})
    source = _normalize_resume_shape(source_resume or {})

    source_pi = source.get('personalInfo') or {}
    target_pi = next_resume.get('personalInfo') or {}
    for field in ('name', 'title', 'email', 'phone'):
        if _is_non_empty(source_pi.get(field)):
            target_pi[field] = source_pi.get(field)
    for field in ('location', 'linkedin', 'website', 'avatar', 'age'):
        if _is_non_empty(source_pi.get(field)) and not _is_non_empty(target_pi.get(field)):
            target_pi[field] = source_pi.get(field)
    next_resume['personalInfo'] = target_pi
    if _is_non_empty(source.get('gender')) and not _is_non_empty(next_resume.get('gender')):
        next_resume['gender'] = source.get('gender')
    if _is_non_empty(source.get('templateId')) and not _is_non_empty(next_resume.get('templateId')):
        next_resume['templateId'] = source.get('templateId')

    # Work experience: keep company/position/timeline stable; allow description refinement.
    next_resume['workExps'] = _merge_section_items_with_fact_guard(
        source.get('workExps') or [],
        next_resume.get('workExps') or [],
        factual_fields=('company', 'title', 'position', 'subtitle', 'startDate', 'endDate', 'date'),
    )

    # Education: keep fully immutable (facts must never be rewritten or removed).
    next_resume['educations'] = copy.deepcopy(source.get('educations') or [])

    # Projects: keep title/date stable; allow description refinement.
    next_resume['projects'] = _merge_section_items_with_fact_guard(
        source.get('projects') or [],
        next_resume.get('projects') or [],
        factual_fields=('title', 'subtitle', 'role', 'startDate', 'endDate', 'date', 'link'),
    )

    # Preserve summary fallback.
    if _is_non_empty(source.get('summary')) and not _is_non_empty(next_resume.get('summary')):
        next_resume['summary'] = source.get('summary')

    return _sync_resume_alias_fields(next_resume)


def _soften_unverified_claims(generated_resume):
    next_resume = _normalize_resume_shape(generated_resume or {})
    replacements = {
        '刷新历史峰值': '达到阶段性高点',
        '大幅领先': '表现较优',
        '千万级': '高体量',
    }

    def _rewrite_text(value):
        text = str(value or '')
        for src, dst in replacements.items():
            text = text.replace(src, dst)
        return text

    next_resume['summary'] = _rewrite_text(next_resume.get('summary'))
    for section in ('workExps', 'projects'):
        items = next_resume.get(section) or []
        for item in items:
            if isinstance(item, dict):
                item['description'] = _rewrite_text(item.get('description'))
    return next_resume


def _collect_numeric_tokens(resume):
    text = json.dumps(resume or {}, ensure_ascii=False)
    tokens = set()
    for m in re.finditer(r'\d+(?:\.\d+)?%?', text):
        t = m.group(0)
        tokens.add(t)
        if t.endswith('%'):
            tokens.add(t[:-1])
        else:
            tokens.add(f"{t}%")
    return tokens


def _neutralize_unknown_numbers(generated_resume, source_resume):
    next_resume = _normalize_resume_shape(generated_resume or {})
    source_tokens = _collect_numeric_tokens(source_resume or {})

    def _rewrite_text(value):
        text = str(value or '')

        def _replace(match):
            token = match.group(0)
            if token in source_tokens:
                return token
            return '关键比例' if token.endswith('%') else '关键结果'

        text = re.sub(r'\d+(?:\.\d+)?%?', _replace, text)
        text = re.sub(r'(关键比例[、，/\s]*){2,}', '关键比例', text)
        text = re.sub(r'(关键结果[、，/\s]*){2,}', '关键结果', text)
        return text

    next_resume['summary'] = _rewrite_text(next_resume.get('summary'))
    for section in ('workExps', 'projects'):
        items = next_resume.get(section) or []
        for item in items:
            if isinstance(item, dict):
                item['description'] = _rewrite_text(item.get('description'))
    return next_resume


def generate_optimized_resume(
    *,
    gemini_client,
    check_gemini_quota,
    gemini_analysis_model,
    parse_ai_response,
    format_resume_for_ai,
    logger,
    resume_data,
    chat_history,
    score,
    suggestions,
):
    if not resume_data:
        raise ValueError('需要提供简历数据')

    fallback_resume = _build_resume_fallback(resume_data)
    if not (gemini_client and check_gemini_quota()):
        return fallback_resume

    try:
        formatted_chat = ""
        for msg in chat_history or []:
            role = "用户" if msg.get('role') == 'user' else "顾问"
            formatted_chat += f"{role}: {msg.get('text', '')}\n"

        normalized_suggestions, suggestions_context = _build_suggestions_context(suggestions)
        resume_info = format_resume_for_ai(resume_data)
        chat_info = formatted_chat if formatted_chat else '无对话历史'

        prompt = f"""
请根据以下信息生成一份完整且优化后的简历。
请仅使用中文输出，所有字段值必须为中文。
不要包含任何 AI 优化说明或标记。

**输入信息**
1. 原始简历数据：
{resume_info}

2. 对话历史：
{chat_info}

3. 当前评分：
{score}/100

4. 优化建议（必须尽量落实到最终简历）：
{suggestions_context}

**输出要求（精简版）**
1. 仅返回 JSON。
2. 输出可直接投递的终稿，不要说明性文字与占位符（XX/TBD/示例等）。
3. 保持事实边界：不得虚构公司、项目、时间线、证书。
4. 无法确认数字时用中性结果口径，不得编造具体值。
5. workExps/projects 的描述必须是完整自然语句，且至少包含“动作/方法/结果”中的两项。
6. suggestions 指向的薄弱内容必须落实改写，不得大段原文照搬。
7. personalInfo 中已有 name/title/email/phone/location/linkedin/website/age/avatar 不得丢失。

**输出格式**
{{
  "resumeData": {{
    "personalInfo": {{
      "name": "姓名",
      "title": "职位标题",
      "email": "邮箱地址",
      "phone": "电话号码",
      "location": "城市",
      "linkedin": "",
      "website": "",
      "age": "",
      "avatar": ""
    }},
    "workExps": [
      {{
        "id": 1,
        "company": "公司名称",
        "position": "职位",
        "startDate": "开始日期",
        "endDate": "结束日期",
        "description": "详细工作描述（包含量化结果）"
      }}
    ],
    "educations": [
      {{
        "id": 1,
        "school": "学校名称",
        "degree": "学位",
        "major": "专业",
        "startDate": "开始日期",
        "endDate": "结束日期"
      }}
    ],
    "projects": [
      {{
        "id": 1,
        "title": "项目名称",
        "subtitle": "项目角色",
        "startDate": "开始日期",
        "endDate": "结束日期",
        "link": "",
        "description": "详细项目描述",
        "date": "项目时间"
      }}
    ],
    "skills": ["技能1", "技能2", "技能3"],
    "summary": "专业简介",
    "gender": "male|female"
  }}
}}
"""

        response = gemini_client.models.generate_content(
            model=gemini_analysis_model,
            contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        ai_result = parse_ai_response(response.text)
        if ai_result and ai_result.get('resumeData'):
            generated = _normalize_resume_shape(ai_result.get('resumeData') or {})
            generated = _restore_original_contacts(generated, resume_data)
            generated = _restore_source_fact_boundaries(generated, resume_data)
            generated = _soften_unverified_claims(generated)
            generated = _neutralize_unknown_numbers(generated, resume_data)
            generated = _normalize_and_merge_skills(generated, resume_data, normalized_suggestions)
            generated = _sync_resume_alias_fields(generated)

            unresolved = _detect_unresolved_suggestions(generated, normalized_suggestions)
            unresolved_context = '\n'.join([
                f"- [{s.get('id')}] {s.get('title')} | section={s.get('targetSection')} | reason={s.get('reason')} | original={s.get('originalValue')} | suggested={s.get('suggestedValue')}"
                for s in unresolved
            ]) if unresolved else '无'

            verify_prompt = f"""
你是“简历重写校验器”。请逐条校验优化建议是否已在候选新简历中落实，并输出修订后最终简历。
要求（精简版）：
1) 逐条核验 suggestions，对未落实项继续改写。
2) 输出可直接投递终稿，不要“建议/说明/注释”类文本。
3) 禁止占位符与事实编造；数字不确定时使用中性结果口径。
4) personalInfo.name/title/email/phone/location/linkedin/website/age/avatar 不得丢失。
5) 仅返回 JSON。

原始简历：
{resume_info}

候选新简历（第一版）：
{json.dumps(generated, ensure_ascii=False)}

完整建议列表：
{suggestions_context}

机器检测到疑似未改写项：
{unresolved_context}

输出格式：
{{
  "coverage": [
    {{"id":"suggestion-1","status":"done|partial|not_done","note":"简短说明"}}
  ],
  "resumeData": {{
    "personalInfo": {{}},
    "workExps": [],
    "educations": [],
    "projects": [],
    "skills": [],
    "summary": ""
  }}
}}
"""
            verify_response = gemini_client.models.generate_content(
                model=gemini_analysis_model,
                contents=verify_prompt,
                config=types.GenerateContentConfig(response_mime_type="application/json"),
            )
            verified = parse_ai_response(verify_response.text) or {}
            final_generated = _normalize_resume_shape(verified.get('resumeData') or generated)
            final_generated = _restore_original_contacts(final_generated, resume_data)
            final_generated = _restore_source_fact_boundaries(final_generated, resume_data)
            final_generated = _soften_unverified_claims(final_generated)
            final_generated = _neutralize_unknown_numbers(final_generated, resume_data)
            final_generated = _normalize_and_merge_skills(final_generated, resume_data, normalized_suggestions)
            final_generated = _sync_resume_alias_fields(final_generated)
            return final_generated
    except Exception as ai_error:
        logger.error("AI 生成简历失败: %s", ai_error)
        if "429" in str(ai_error) or "quota" in str(ai_error).lower() or "exceeded" in str(ai_error).lower():
            logger.warning("Gemini 配额超限，回退为本地简历生成")

    return fallback_resume
