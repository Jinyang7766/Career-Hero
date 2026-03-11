import copy
import json
import re
import time

from google.genai import types

from .import_compat import import_attrs


DEFAULT_SKILL_LIMIT, merge_resume_skills, sanitize_resume_skills = import_attrs(
    'services.skill_cleanup_service',
    ('DEFAULT_SKILL_LIMIT', 'merge_resume_skills', 'sanitize_resume_skills'),
)


_MBTI_TOKEN_RE = re.compile(r'(?<![A-Za-z])[IE][NS][FT][JP](?:-[AT])?(?![A-Za-z])', flags=re.IGNORECASE)
_MBTI_LABEL_RE = re.compile(r'(?:MBTI|16型人格|人格类型)\s*[:：]?\s*[A-Za-z\-/]{0,8}', flags=re.IGNORECASE)
_PREFERENCE_SOURCE_KEYS = (
    'workStyle', 'work_style',
    'careerGoal', 'career_goal',
    'constraints', 'hardConstraints',
    'targetSalary', 'target_salary', 'salaryExpectation',
)


def _normalize_compact_text(value: str) -> str:
    return re.sub(r'[\s\W_]+', '', str(value or '').lower())


def _should_block_preference_phrase(text: str) -> bool:
    value = str(text or '').strip()
    compact = _normalize_compact_text(value)
    if not compact:
        return False
    if len(compact) >= 10:
        return True
    return bool(re.search(r'(目标|偏好|希望|薪资|salary|远程|居家|坐班|地点|城市|通勤|约束|限制|workstyle|careergoal)', value, flags=re.IGNORECASE))


def _extract_preference_phrases(career_profile):
    if not isinstance(career_profile, dict):
        return []

    phrases = []

    def _append_value(raw, *, force=False):
        if isinstance(raw, list):
            for item in raw:
                _append_value(item, force=force)
            return
        text = str(raw or '').strip()
        if text and (force or _should_block_preference_phrase(text)):
            phrases.append(text)

    force_block_keys = {'workStyle', 'work_style', 'careerGoal', 'career_goal', 'targetSalary', 'target_salary', 'salaryExpectation'}
    for key in _PREFERENCE_SOURCE_KEYS:
        _append_value(career_profile.get(key), force=key in force_block_keys)

    for key in ('preferences', 'careerPreferences', 'jobPreferences'):
        block = career_profile.get(key)
        if isinstance(block, dict):
            for nested_key in _PREFERENCE_SOURCE_KEYS:
                _append_value(block.get(nested_key), force=nested_key in force_block_keys)

    deduped = []
    seen = set()
    for phrase in phrases:
        compact = _normalize_compact_text(phrase)
        if not compact or compact in seen:
            continue
        seen.add(compact)
        deduped.append(phrase)
    return deduped


def _scrub_profile_leakage_text(value, blocked_phrases):
    text = str(value or '')
    if not text:
        return ''

    text = _MBTI_LABEL_RE.sub('', text)
    text = _MBTI_TOKEN_RE.sub('', text)
    text = re.sub(r'(?:偏好|希望|期望)[^，。；;\n]{0,30}(?:远程办公|居家办公|管理岗|薪资|年薪|月薪)', '', text, flags=re.IGNORECASE)
    text = re.sub(r'(?:目标薪资|期望薪资|薪资诉求|薪资期望|target\s*salary)[^，。；;\n]{0,20}', '', text, flags=re.IGNORECASE)
    text = re.sub(r'(远程办公|居家办公|hybrid|remote)', '', text, flags=re.IGNORECASE)

    for phrase in blocked_phrases:
        if not phrase:
            continue
        text = re.sub(re.escape(phrase), '', text, flags=re.IGNORECASE)

    text = re.sub(r'[\s]{2,}', ' ', text)
    text = re.sub(r'[，；;,、]{2,}', '，', text)
    text = re.sub(r'\s*([，。；;、,])\s*', r'\1', text)
    text = re.sub(r'^[，。；;、,\s]+|[，。；;、,\s]+$', '', text)
    return text


def _sanitize_resume_visibility_fields(generated_resume, career_profile=None):
    next_resume = _normalize_resume_shape(generated_resume or {})
    blocked_phrases = _extract_preference_phrases(career_profile)

    next_resume['summary'] = _scrub_profile_leakage_text(next_resume.get('summary'), blocked_phrases)

    for section in ('workExps', 'projects'):
        items = next_resume.get(section) or []
        for item in items:
            if not isinstance(item, dict):
                continue
            for field in ('description', 'subtitle', 'position', 'role'):
                if field in item:
                    item[field] = _scrub_profile_leakage_text(item.get(field), blocked_phrases)

    cleaned_skills = []
    for skill in (next_resume.get('skills') or []):
        text = _scrub_profile_leakage_text(skill, blocked_phrases)
        compact = _normalize_compact_text(text)
        if not compact:
            continue
        if _MBTI_TOKEN_RE.search(str(skill or '')):
            continue
        if any(_normalize_compact_text(phrase) == compact for phrase in blocked_phrases):
            continue
        cleaned_skills.append(text)
    next_resume['skills'] = cleaned_skills

    return next_resume


def _build_resume_fallback(resume_data, career_profile=None):
    fallback = _sync_resume_alias_fields(_normalize_resume_shape(resume_data or {}))
    fallback = _sanitize_resume_visibility_fields(fallback, career_profile=career_profile)
    return sanitize_resume_skills(fallback, limit=DEFAULT_SKILL_LIMIT)


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


def _extract_jd_skill_keywords(job_description, target_role='', limit=12):
    text = str(job_description or '').strip()
    if not text:
        return []

    candidates = []
    # English-ish technical tokens
    candidates.extend(re.findall(r'\b[A-Za-z][A-Za-z0-9\-\+#\.]{1,24}\b', text))
    # Common Chinese skill nouns
    candidates.extend(re.findall(r'[\u4e00-\u9fff]{2,12}(?:开发|分析|建模|算法|架构|测试|运维|治理|工程|平台|系统|可视化|自动化)', text))

    role_text = str(target_role or '').strip()
    if role_text:
        candidates.append(role_text)

    normalized = []
    seen = set()
    for candidate in candidates:
        canonical = _canonicalize_skill(candidate)
        if not canonical:
            continue
        if not _is_hard_skill(canonical):
            continue
        key = canonical.lower()
        if key in seen:
            continue
        seen.add(key)
        normalized.append(canonical)
        if len(normalized) >= limit:
            break
    return normalized


def _merge_jd_keywords_into_skills(generated_resume, job_description, target_role=''):
    next_resume = _normalize_resume_shape(generated_resume or {})
    jd_keywords = _extract_jd_skill_keywords(job_description, target_role=target_role, limit=10)
    if not jd_keywords:
        return next_resume

    existing = _split_skill_candidates(next_resume.get('skills') or [])
    next_resume['skills'] = merge_resume_skills(
        source_skills=existing,
        generated_skills=existing,
        suggested_skills=jd_keywords,
        limit=DEFAULT_SKILL_LIMIT,
    )
    return next_resume


def _normalize_and_merge_skills(generated_resume, source_resume, suggestions):
    next_resume = _normalize_resume_shape(generated_resume or {})
    source = _normalize_resume_shape(source_resume or {})
    generated_skills_raw = next_resume.get('skills') or []
    source_skills_raw = source.get('skills') or []
    suggested_skill_keywords = _collect_skill_keywords_from_suggestions(suggestions or [])

    source_candidates = _split_skill_candidates(source_skills_raw)
    generated_candidates = _split_skill_candidates(generated_skills_raw)
    suggested_candidates = _split_skill_candidates(suggested_skill_keywords)

    next_resume['skills'] = merge_resume_skills(
        source_skills=source_candidates,
        generated_skills=generated_candidates,
        suggested_skills=suggested_candidates,
        limit=DEFAULT_SKILL_LIMIT,
    )
    return next_resume


def _normalize_text(value: str) -> str:
    return re.sub(r'[\s\W_]+', '', str(value or '').lower())


def _build_suggestions_context(suggestions, *, max_items: int = 20):
    normalized_suggestions = []
    for idx, suggestion in enumerate((suggestions or [])[:max_items], start=1):
        if not isinstance(suggestion, dict):
            continue
        normalized_suggestions.append(
            {
                'id': suggestion.get('id') or f'suggestion-{idx}',
                'title': suggestion.get('title') or '优化建议',
                'reason': str(suggestion.get('reason') or '')[:240],
                'targetSection': suggestion.get('targetSection') or '',
                'targetField': suggestion.get('targetField') or '',
                'originalValue': str(suggestion.get('originalValue') or '')[:240],
                'suggestedValue': suggestion.get('suggestedValue') or '',
                'status': suggestion.get('status') or '',
            }
        )
    suggestions_text_blocks = []
    for s in normalized_suggestions:
        suggested_value = s['suggestedValue']
        if isinstance(suggested_value, (list, dict)):
            suggested_value = json.dumps(suggested_value, ensure_ascii=False)
        else:
            suggested_value = str(suggested_value or '')[:280]
        suggestions_text_blocks.append(
            f"- [{s['id']}] section={s['targetSection']} field={s['targetField']} title={s['title']}\n"
            f"  reason={s['reason']}\n"
            f"  original={s['originalValue']}\n"
            f"  suggested={suggested_value}"
        )
    return normalized_suggestions, ('\n'.join(suggestions_text_blocks) if suggestions_text_blocks else '无')


def _resolve_career_profile_target_role(career_profile):
    if not isinstance(career_profile, dict):
        return ''
    personal_info = career_profile.get('personalInfo') or {}
    if not isinstance(personal_info, dict):
        personal_info = {}
    for candidate in (
        career_profile.get('targetRole'),
        career_profile.get('jobDirection'),
        career_profile.get('jobTarget'),
        personal_info.get('title'),
        career_profile.get('title'),
    ):
        text = str(candidate or '').strip()
        if text:
            return text
    return ''


def _build_career_profile_context(career_profile):
    if not isinstance(career_profile, dict):
        return '未提供'

    summary = str(
        career_profile.get('summary')
        or career_profile.get('profileSummary')
        or career_profile.get('careerSummary')
        or ''
    ).strip()
    experiences = career_profile.get('experiences') or career_profile.get('careerFacts') or []
    core_skills = career_profile.get('coreSkills') or career_profile.get('skills') or []
    constraints = career_profile.get('constraints') or career_profile.get('hardConstraints') or []
    work_style = career_profile.get('workStyle') or career_profile.get('work_style') or ''
    career_goal = career_profile.get('careerGoal') or career_profile.get('career_goal') or ''
    target_salary = career_profile.get('targetSalary') or career_profile.get('target_salary') or career_profile.get('salaryExpectation') or ''
    target_role = _resolve_career_profile_target_role(career_profile)

    lines = []
    if target_role:
        lines.append(f"- 目标岗位：{target_role}")
    if summary:
        lines.append(f"- 画像摘要：{summary}")
    if isinstance(core_skills, list) and core_skills:
        skills = [str(x).strip() for x in core_skills[:8] if str(x).strip()]
        if skills:
            lines.append(f"- 核心能力：{'、'.join(skills)}")
    if isinstance(experiences, list) and experiences:
        lines.append("- 关键经历：")
        for idx, item in enumerate(experiences[:5], start=1):
            if not isinstance(item, dict):
                continue
            title = str(item.get('title') or item.get('name') or f'经历{idx}').strip()
            period = str(item.get('period') or '').strip()
            organization = str(item.get('organization') or item.get('company') or '').strip()
            actions = str(item.get('actions') or item.get('action') or '').strip()
            results = str(item.get('results') or item.get('result') or '').strip()
            segments = [f"{idx}. {title}"]
            if period:
                segments.append(f"时间：{period}")
            if organization:
                segments.append(f"组织：{organization}")
            if actions:
                segments.append(f"行动：{actions[:120]}")
            if results:
                segments.append(f"结果：{results[:120]}")
            lines.append("；".join(segments))

    internal_preferences = []
    if isinstance(constraints, list) and constraints:
        constraints_text = [str(x).strip() for x in constraints[:8] if str(x).strip()]
        if constraints_text:
            internal_preferences.append(f"约束：{'；'.join(constraints_text)}")
    if str(work_style or '').strip():
        internal_preferences.append(f"工作风格偏好：{str(work_style).strip()}")
    if str(career_goal or '').strip():
        internal_preferences.append(f"职业目标：{str(career_goal).strip()}")
    if str(target_salary or '').strip():
        internal_preferences.append(f"薪资诉求：{str(target_salary).strip()}")
    if internal_preferences:
        lines.append("- 内部偏好参考（仅用于改写策略，禁止原文写入简历）：")
        for pref in internal_preferences:
            lines.append(f"  - {pref}")

    if not lines:
        return '未提供'
    return '\n'.join(lines)


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


def _postprocess_generated_resume(generated_resume, source_resume, normalized_suggestions, career_profile=None):
    generated = _normalize_resume_shape(generated_resume or {})
    generated = _restore_original_contacts(generated, source_resume)
    generated = _restore_source_fact_boundaries(generated, source_resume)
    generated = _soften_unverified_claims(generated)
    generated = _neutralize_unknown_numbers(generated, source_resume)
    generated = _normalize_and_merge_skills(generated, source_resume, normalized_suggestions)
    generated = _sanitize_resume_visibility_fields(generated, career_profile=career_profile)
    generated = _sync_resume_alias_fields(generated)
    return sanitize_resume_skills(generated, limit=DEFAULT_SKILL_LIMIT)


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
    career_profile=None,
    job_description='',
    target_role='',
    enable_verify_pass: bool = True,
):
    if not resume_data:
        raise ValueError('需要提供简历数据')

    job_description_text = str(job_description or '').strip()
    target_role_text = str(target_role or '').strip()
    fallback_resume = _build_resume_fallback(resume_data, career_profile=career_profile)
    if job_description_text:
        fallback_resume = _merge_jd_keywords_into_skills(
            fallback_resume,
            job_description_text,
            target_role=target_role_text,
        )
    if not (gemini_client and check_gemini_quota()):
        return fallback_resume

    timing_marks = {}
    total_started = time.perf_counter()

    def _mark(name: str, started: float):
        timing_marks[name] = round((time.perf_counter() - started) * 1000, 2)

    try:
        prep_started = time.perf_counter()
        chat_lines = []
        for msg in (chat_history or [])[-12:]:
            if not isinstance(msg, dict):
                continue
            role = "用户" if msg.get('role') == 'user' else "顾问"
            text = str(msg.get('text') or '').strip()
            if not text:
                continue
            chat_lines.append(f"{role}: {text[:240]}")

        formatted_chat = "\n".join(chat_lines)
        normalized_suggestions, suggestions_context = _build_suggestions_context(suggestions, max_items=20)
        career_profile_context = _build_career_profile_context(career_profile)
        resume_info = format_resume_for_ai(resume_data)
        chat_info = formatted_chat if formatted_chat else '无对话历史'
        jd_skill_keywords = _extract_jd_skill_keywords(job_description_text, target_role=target_role_text, limit=10)
        jd_context = job_description_text or '未提供'
        jd_keyword_hint = '、'.join(jd_skill_keywords[:8]) if jd_skill_keywords else '未提取到明确硬技能关键词'
        _mark('prep_context', prep_started)

        prompt = f"""
请根据以下信息生成一份完整且优化后的简历。
请仅使用中文输出，所有字段值必须为中文。
不要包含任何 AI 优化说明或标记。

**输入信息**
1. 原始简历数据：
{resume_info}

2. 对话历史：
{chat_info}

3. 用户职业画像（可能包含简历外经历）：
{career_profile_context}

4. 目标岗位：
{target_role_text or '未提供'}

5. 职位描述（JD）：
{jd_context}

6. JD硬技能关键词参考（用于定向对齐）：
{jd_keyword_hint}

7. 当前评分：
{score}/100

8. 优化建议（必须尽量落实到最终简历）：
{suggestions_context}

**输出要求（精简版）**
1. 仅返回 JSON。
2. 输出可直接投递的终稿，不要说明性文字与占位符（XX/TBD/示例等）。
3. 保持事实边界：事实来源仅限“原始简历 + 用户职业画像 + 对话历史”。
4. 不得虚构公司、项目、时间线、证书；无法确认时必须保持留白或中性表述。
5. 无法确认数字时用中性结果口径，不得编造具体值。
6. workExps/projects 的描述必须是完整自然语句，且至少包含“动作/方法/结果”中的两项。
7. suggestions 指向的薄弱内容必须落实改写，不得大段原文照搬。
8. personalInfo 中已有 name/title/email/phone/location/linkedin/website/age/avatar 不得丢失。
9. 若提供 JD，必须体现 JD 定向改写：
   - skills 至少覆盖 3 个 JD 硬技能关键词（优先使用“JD硬技能关键词参考”）；
   - workExps/projects 至少各有 1 条描述显式对齐目标岗位职责锚点。
10. 若 JD 与现有事实存在冲突，只能调整表达，不得编造新经历。
11. 严禁在简历可见字段中输出 MBTI / 人格类型（如 INTJ、ENFP、16型人格等）。
12. 职业目标与偏好（工作风格、职业目标、约束、薪资诉求等）仅用于内部改写策略，不得原文写入 summary/skills/workExps/projects/extra。

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

        first_llm_started = time.perf_counter()
        response = gemini_client.models.generate_content(
            model=gemini_analysis_model,
            contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        _mark('llm_generate_v1', first_llm_started)

        ai_result = parse_ai_response(response.text)
        if ai_result and ai_result.get('resumeData'):
            post_v1_started = time.perf_counter()
            generated = _postprocess_generated_resume(
                ai_result.get('resumeData') or {},
                resume_data,
                normalized_suggestions,
                career_profile=career_profile,
            )
            if job_description_text:
                generated = _merge_jd_keywords_into_skills(
                    generated,
                    job_description_text,
                    target_role=target_role_text,
                )
            _mark('postprocess_v1', post_v1_started)

            unresolved = _detect_unresolved_suggestions(generated, normalized_suggestions)
            should_verify = bool(enable_verify_pass and unresolved)
            if not should_verify:
                timing_marks['verify_skipped'] = 1
                logger.info(
                    "resume.generate.timings model=%s prompt_chars=%s suggestions=%s unresolved=%s timings=%s total_ms=%s",
                    str(gemini_analysis_model),
                    len(prompt),
                    len(normalized_suggestions),
                    len(unresolved),
                    timing_marks,
                    round((time.perf_counter() - total_started) * 1000, 2),
                )
                generated = _sanitize_resume_visibility_fields(generated, career_profile=career_profile)
                return sanitize_resume_skills(generated, limit=DEFAULT_SKILL_LIMIT)

            unresolved_context = '\n'.join([
                f"- [{s.get('id')}] {s.get('title')} | section={s.get('targetSection')} | reason={s.get('reason')} | original={s.get('originalValue')} | suggested={s.get('suggestedValue')}"
                for s in unresolved[:10]
            ]) if unresolved else '无'

            verify_prompt = f"""
你是“简历重写校验器”。请逐条校验优化建议是否已在候选新简历中落实，并输出修订后最终简历。
要求（精简版）：
1) 逐条核验 suggestions，对未落实项继续改写。
2) 输出可直接投递终稿，不要“建议/说明/注释”类文本。
3) 禁止占位符与事实编造；数字不确定时使用中性结果口径。
4) personalInfo.name/title/email/phone/location/linkedin/website/age/avatar 不得丢失。
5) 若提供 JD，skills 至少覆盖 3 个 JD 硬技能关键词，并确保经历描述出现岗位职责锚点。
6) 仅返回 JSON。
7) 严禁在简历可见字段中输出 MBTI / 人格类型（如 INTJ、ENFP、16型人格等）。
8) 工作风格、职业目标、约束、薪资诉求等仅可作为内部改写依据，不得将其原文写入简历。

原始简历：
{resume_info}

用户职业画像：
{career_profile_context}

目标岗位：
{target_role_text or '未提供'}

职位描述（JD）：
{jd_context}

JD硬技能关键词参考：
{jd_keyword_hint}

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
            verify_llm_started = time.perf_counter()
            verify_response = gemini_client.models.generate_content(
                model=gemini_analysis_model,
                contents=verify_prompt,
                config=types.GenerateContentConfig(response_mime_type="application/json"),
            )
            _mark('llm_verify', verify_llm_started)

            verify_post_started = time.perf_counter()
            verified = parse_ai_response(verify_response.text) or {}
            final_generated = _postprocess_generated_resume(
                verified.get('resumeData') or generated,
                resume_data,
                normalized_suggestions,
                career_profile=career_profile,
            )
            if job_description_text:
                final_generated = _merge_jd_keywords_into_skills(
                    final_generated,
                    job_description_text,
                    target_role=target_role_text,
                )
            _mark('postprocess_verify', verify_post_started)
            logger.info(
                "resume.generate.timings model=%s prompt_chars=%s verify_prompt_chars=%s suggestions=%s unresolved=%s timings=%s total_ms=%s",
                str(gemini_analysis_model),
                len(prompt),
                len(verify_prompt),
                len(normalized_suggestions),
                len(unresolved),
                timing_marks,
                round((time.perf_counter() - total_started) * 1000, 2),
            )
            final_generated = _sanitize_resume_visibility_fields(final_generated, career_profile=career_profile)
            return sanitize_resume_skills(final_generated, limit=DEFAULT_SKILL_LIMIT)
    except Exception as ai_error:
        logger.error("AI 生成简历失败: %s", ai_error)
        if "429" in str(ai_error) or "quota" in str(ai_error).lower() or "exceeded" in str(ai_error).lower():
            logger.warning("Gemini 配额超限，回退为本地简历生成")

    return fallback_resume
