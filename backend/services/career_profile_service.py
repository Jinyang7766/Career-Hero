import json
import re
from datetime import datetime, timezone

from .payload_sanitizer import (
    resolve_fact_items_with_fallback,
    validate_career_profile_main_fields,
)
from .skill_cleanup_service import clean_skill_list


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _compact_text(value, max_len=600):
    text = str(value or '').strip()
    if not text:
        return ''
    text = re.sub(r'\s+', ' ', text)
    return text[:max_len]


def _normalize_skill_list(raw_list, max_items=20):
    if not isinstance(raw_list, list):
        return []

    try:
        normalized = clean_skill_list(raw_list, limit=max_items)
    except Exception:
        normalized = []

    if normalized:
        return normalized[: max(0, int(max_items or 0))] if isinstance(max_items, int) and max_items > 0 else normalized

    out = []
    seen = set()
    for item in raw_list:
        text = _compact_text(item, 40)
        if not text:
            continue
        key = re.sub(r'[\s\W_]+', '', text.lower())
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(text)
        if len(out) >= max_items:
            break
    return out


def _normalize_text_list(raw_list, max_items=12, max_len=200):
    if not isinstance(raw_list, list):
        return []
    out = []
    seen = set()
    for item in raw_list:
        text = _compact_text(item, max_len)
        if not text:
            continue
        key = re.sub(r'\s+', ' ', text.lower())
        if key in seen:
            continue
        seen.add(key)
        out.append(text)
        if len(out) >= max_items:
            break
    return out


def _fact_key(text):
    return re.sub(r'[\s\W_]+', '', str(text or '').lower())[:120]


def _derive_fact_items(core_skills, highlights, constraints):
    fact_items = []
    seen = set()

    def _append(kind, values):
        for text in values or []:
            normalized_text = _compact_text(text, 260)
            if not normalized_text:
                continue
            key = _fact_key(normalized_text)
            if not key:
                continue
            dedupe = (kind, key)
            if dedupe in seen:
                continue
            seen.add(dedupe)
            fact_items.append(
                {
                    'id': f'fact_{kind}_{len(fact_items) + 1}',
                    'kind': kind,
                    'text': normalized_text,
                    'key': key,
                }
            )

    _append('skill', core_skills)
    _append('highlight', highlights)
    _append('constraint', constraints)
    return fact_items


def _sanitize_experience_item(item, fallback_index):
    if not isinstance(item, dict):
        return None
    title = _compact_text(item.get('title') or item.get('name') or f'经历{fallback_index}', 80)
    if not title:
        return None
    period = _compact_text(item.get('period'), 80)
    organization = _compact_text(item.get('organization') or item.get('company'), 100)
    actions = _compact_text(item.get('actions') or item.get('action'), 400)
    results = _compact_text(item.get('results') or item.get('result'), 400)
    skills = _normalize_skill_list(item.get('skills') if isinstance(item.get('skills'), list) else [])
    in_resume_raw = str(item.get('inResume') or item.get('isInResume') or '').strip().lower()
    if in_resume_raw in ('yes', 'y', 'true', '1', '在', '已写入'):
        in_resume = 'yes'
    elif in_resume_raw in ('no', 'n', 'false', '0', '不在', '未写入'):
        in_resume = 'no'
    else:
        in_resume = 'unknown'
    confidence_raw = str(item.get('confidence') or '').strip().lower()
    if confidence_raw in ('high', 'medium', 'low'):
        confidence = confidence_raw
    else:
        confidence = 'medium'
    evidence = _compact_text(item.get('evidence') or '来自用户自述', 120)

    return {
        'title': title,
        'period': period,
        'organization': organization,
        'actions': actions,
        'results': results,
        'skills': skills,
        'inResume': in_resume,
        'confidence': confidence,
        'evidence': evidence,
    }


def _sanitize_education_item(item, fallback_index):
    if not isinstance(item, dict):
        return None
    school = _compact_text(item.get('school') or item.get('university') or f'学校{fallback_index}', 100)
    degree = _compact_text(item.get('degree'), 100)
    major = _compact_text(item.get('major'), 100)
    period = _compact_text(item.get('period') or item.get('date'), 80)
    description = _compact_text(item.get('description'), 400)
    
    if not school:
        return None

    return {
        'id': fallback_index,
        'school': school,
        'degree': degree,
        'major': major,
        'period': period,
        'description': description
    }


def _sanitize_project_item(item, fallback_index):
    if not isinstance(item, dict):
        return None
    title = _compact_text(item.get('title') or item.get('name') or f'项目{fallback_index}', 100)
    subtitle = _compact_text(item.get('subtitle') or item.get('role'), 100)
    period = _compact_text(item.get('period') or item.get('date'), 80)
    description = _compact_text(item.get('description'), 1000)
    link = _compact_text(item.get('link'), 200)

    if not title:
        return None

    return {
        'id': fallback_index,
        'title': title,
        'subtitle': subtitle,
        'period': period,
        'description': description,
        'link': link
    }


def _extract_fallback_sentences(text, limit=6):
    source = str(text or '').strip()
    if not source:
        return []
    parts = re.split(r'[\n\r。！？!?；;]+', source)
    out = []
    for p in parts:
        sentence = _compact_text(p, 200)
        if len(sentence) < 8:
            continue
        out.append(sentence)
        if len(out) >= limit:
            break
    return out


def _first_non_empty(*values):
    for value in values:
        text = _compact_text(value, 120)
        if text:
            return text
    return ''


def _build_validation_error_observability(errors):
    paths = sorted(
        {
            str(item.get('path') or '').strip()
            for item in (errors or [])
            if str(item.get('path') or '').strip()
        }
    )
    types = sorted(
        {
            str(item.get('error_type') or '').strip()
            for item in (errors or [])
            if str(item.get('error_type') or '').strip()
        }
    )
    return {
        'validation_error_count': len(errors or []),
        'validation_error_paths': paths,
        'validation_error_types': types,
    }


def _apply_profile_main_field_guard(profile, raw_text, existing_profile=None, logger=None):
    main_field_errors = validate_career_profile_main_fields(profile, field_path='profile')
    if not main_field_errors:
        return profile

    existing = existing_profile if isinstance(existing_profile, dict) else {}
    fallback_source = 'existing_profile' if existing else 'rebuild_fallback_profile'
    if logger and hasattr(logger, 'warning'):
        logger.warning(
            'career_profile.main_fields.validation_failed',
            extra={
                'event': 'career_profile.main_fields.validation_failed',
                'field_path': 'profile',
                'fallback_source': fallback_source,
                'validation_errors': main_field_errors,
                **_build_validation_error_observability(main_field_errors),
            },
        )

    if existing:
        return dict(existing)
    return _build_fallback_profile(raw_text, existing_profile=existing, logger=logger)


def _extract_personal_info_from_text(raw_text):
    text = str(raw_text or '')
    if not text.strip():
        return {}

    info = {}
    name_match = re.search(r'(?:姓名|候选人)\s*[：:]\s*([^\n,，。；;|/]{1,40})', text, re.IGNORECASE)
    title_match = re.search(r'(?:求职意向|目标岗位|应聘职位|职位)\s*[：:]\s*([^\n,，。；;|/]{1,80})', text, re.IGNORECASE)
    location_match = re.search(r'(?:所在(?:城市|地)|城市|地点)\s*[：:]\s*([^\n,，。；;|/]{1,80})', text, re.IGNORECASE)
    email_match = re.search(r'([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})', text)
    phone_candidates = re.findall(r'(\+?\d[\d\-\s]{8,}\d)', text)
    age_match = re.search(r'(?:年龄|age)\s*[：:]?\s*(\d{1,3})', text, re.IGNORECASE)
    gender_match = re.search(r'(?:性别|gender|sex)\s*[：:]?\s*(男|女|男性|女性|male|female)', text, re.IGNORECASE)
    linkedin_match = re.search(r'((?:https?://)?(?:www\.)?linkedin\.com/[^\s<>()]+)', text, re.IGNORECASE)
    website_match = re.search(r'((?:https?://|www\.)[^\s<>()]+)', text, re.IGNORECASE)

    if name_match:
        info['name'] = _compact_text(name_match.group(1), 40)
    if title_match:
        info['title'] = _compact_text(title_match.group(1), 80)
    if location_match:
        info['location'] = _compact_text(location_match.group(1), 80)
    if email_match:
        info['email'] = _compact_text(email_match.group(1), 100)
    if age_match:
        age_num = int(age_match.group(1))
        if 12 <= age_num <= 80:
            info['age'] = str(age_num)
    if gender_match:
        raw_gender = _compact_text(gender_match.group(1), 20).lower()
        if raw_gender in ('男', '男性', 'male'):
            info['gender'] = 'male'
        elif raw_gender in ('女', '女性', 'female'):
            info['gender'] = 'female'
    if linkedin_match:
        linkedin_url = _compact_text(linkedin_match.group(1), 220)
        if linkedin_url and not re.match(r'^https?://', linkedin_url, re.IGNORECASE):
            linkedin_url = f'https://{linkedin_url}'
        info['linkedin'] = linkedin_url
    if website_match:
        website_url = _compact_text(website_match.group(1), 220)
        if website_url and not re.match(r'^https?://', website_url, re.IGNORECASE):
            website_url = f'https://{website_url}'
        if info.get('linkedin') and 'linkedin.com' in website_url.lower():
            pass
        else:
            info['website'] = website_url
    for candidate in phone_candidates:
        digits = re.sub(r'\D', '', candidate)
        if 10 <= len(digits) <= 16:
            info['phone'] = _compact_text(candidate, 40)
            break

    if info.get('name') and info.get('title'):
        return info

    line_match = re.search(r'(?:候选人)?(?:基础信息|个人信息|候选人信息)\s*[：:]\s*(.+)', text, re.IGNORECASE)
    if line_match:
        line = _compact_text(line_match.group(1), 220)
        parts = [part.strip() for part in re.split(r'[\\/|｜]+', line) if part.strip()]
        if parts:
            role_hints = (
                '工程师', '经理', '总监', '运营', '产品', '开发', '设计', '分析', '顾问',
                '专员', '主管', '负责人', 'manager', 'engineer', 'developer', 'analyst'
            )
            first_lower = parts[0].lower()
            looks_like_name = (
                len(parts[0]) <= 20
                and '@' not in parts[0]
                and not re.search(r'\d{2,}', parts[0])
                and not any(hint in first_lower for hint in role_hints)
            )
            if looks_like_name and not info.get('name'):
                info['name'] = _compact_text(parts[0], 40)
                if len(parts) > 1 and not info.get('title'):
                    info['title'] = _compact_text(parts[1], 80)
                if len(parts) > 2 and not info.get('location'):
                    info['location'] = _compact_text(parts[2], 80)
            else:
                if not info.get('title'):
                    info['title'] = _compact_text(parts[0], 80)
                if len(parts) > 1 and not info.get('location'):
                    info['location'] = _compact_text(parts[1], 80)

    return {key: value for key, value in info.items() if value}


def _extract_personal_info(raw_profile, existing_profile, raw_text):
    profile = raw_profile if isinstance(raw_profile, dict) else {}
    nested = profile.get('personalInfo') if isinstance(profile.get('personalInfo'), dict) else {}
    existing = existing_profile if isinstance(existing_profile, dict) else {}
    existing_nested = existing.get('personalInfo') if isinstance(existing.get('personalInfo'), dict) else {}
    from_text = _extract_personal_info_from_text(raw_text)

    info = {
        'name': _first_non_empty(
            nested.get('name'),
            profile.get('name'),
            profile.get('userName'),
            profile.get('user_name'),
            profile.get('candidateName'),
            profile.get('candidate_name'),
            profile.get('fullName'),
            profile.get('full_name'),
            from_text.get('name'),
            existing_nested.get('name'),
        ),
        'title': _first_non_empty(
            nested.get('title'),
            profile.get('title'),
            profile.get('targetRole'),
            profile.get('jobDirection'),
            profile.get('jobTarget'),
            profile.get('position'),
            from_text.get('title'),
            existing_nested.get('title'),
        ),
        'email': _first_non_empty(
            nested.get('email'),
            profile.get('email'),
            profile.get('contactEmail'),
            profile.get('contact_email'),
            from_text.get('email'),
            existing_nested.get('email'),
        ),
        'phone': _first_non_empty(
            nested.get('phone'),
            profile.get('phone'),
            profile.get('mobile'),
            profile.get('tel'),
            from_text.get('phone'),
            existing_nested.get('phone'),
        ),
        'location': _first_non_empty(
            nested.get('location'),
            profile.get('location'),
            profile.get('city'),
            from_text.get('location'),
            existing_nested.get('location'),
        ),
        'linkedin': _first_non_empty(
            nested.get('linkedin'),
            profile.get('linkedin'),
            from_text.get('linkedin'),
            existing_nested.get('linkedin'),
        ),
        'website': _first_non_empty(
            nested.get('website'),
            profile.get('website'),
            profile.get('portfolio'),
            profile.get('portfolioUrl'),
            from_text.get('website'),
            existing_nested.get('website'),
        ),
        'age': _first_non_empty(
            nested.get('age'),
            profile.get('age'),
            from_text.get('age'),
            existing_nested.get('age'),
        ),
        'gender': _first_non_empty(
            nested.get('gender'),
            profile.get('gender'),
            profile.get('sex'),
            from_text.get('gender'),
            existing_nested.get('gender'),
        ),
    }

    gender_raw = str(info.get('gender') or '').strip().lower()
    if gender_raw:
        if gender_raw in ('男', '男性', 'male', 'm'):
            info['gender'] = 'male'
        elif gender_raw in ('女', '女性', 'female', 'f'):
            info['gender'] = 'female'
        elif ('男' in gender_raw and '女' not in gender_raw):
            info['gender'] = 'male'
        elif ('女' in gender_raw and '男' not in gender_raw):
            info['gender'] = 'female'
        elif re.search(r'\bmale\b', gender_raw):
            info['gender'] = 'male'
        elif re.search(r'\bfemale\b', gender_raw):
            info['gender'] = 'female'

    age_raw = str(info.get('age') or '').strip()
    if age_raw:
        age_match = re.search(r'(\d{1,3})', age_raw)
        if age_match:
            age_num = int(age_match.group(1))
            if 12 <= age_num <= 80:
                info['age'] = str(age_num)
            else:
                info.pop('age', None)
        else:
            info.pop('age', None)

    info = {key: value for key, value in info.items() if value}
    return info if info else None


def _build_fallback_profile(raw_text, existing_profile=None, logger=None):
    existing = existing_profile if isinstance(existing_profile, dict) else {}
    summary = _compact_text(existing.get('summary') or raw_text, 220)
    highlights = _extract_fallback_sentences(raw_text, limit=4)
    personal_info = _extract_personal_info(existing, existing, raw_text)
    target_role = _first_non_empty(
        existing.get('targetRole'),
        existing.get('jobDirection'),
        (personal_info or {}).get('title'),
    )
    constraints = [
        '仅基于用户明确提供的信息',
        '未明确的时间/结果不得补全',
        '后续诊断与优化禁止虚构经历',
    ]
    experiences = []
    for idx, sentence in enumerate(_extract_fallback_sentences(raw_text, limit=6), start=1):
        experiences.append({
            'title': f'经历{idx}',
            'period': '',
            'organization': '',
            'actions': sentence,
            'results': '',
            'skills': [],
            'inResume': 'unknown',
            'confidence': 'low',
            'evidence': '来自用户自述',
        })

    derived_fact_items = _derive_fact_items([], highlights, constraints)
    fact_items, source, _errors = resolve_fact_items_with_fallback(
        incoming_fact_items=None,
        existing_fact_items=existing.get('factItems'),
        logger=logger,
        field_path='profile.factItems',
    )
    if source == 'empty_list' and derived_fact_items:
        fact_items = derived_fact_items

    return {
        'id': f"career_profile_{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        'createdAt': _now_iso(),
        'source': 'manual_self_report',
        'summary': summary,
        'careerHighlights': highlights,
        'coreSkills': [],
        'targetRole': target_role,
        'jobDirection': target_role,
        'constraints': constraints,
        'factItems': fact_items,
        'experiences': experiences,
        'educations': [],
        'projects': [],
        'personalInfo': personal_info or {},
        'rawInput': _compact_text(raw_text, 2000),
    }


def _sanitize_profile(raw_profile, raw_text, existing_profile=None, logger=None):
    if not isinstance(raw_profile, dict):
        return _build_fallback_profile(raw_text, existing_profile=existing_profile, logger=logger)

    summary = _compact_text(
        raw_profile.get('summary')
        or raw_profile.get('profileSummary')
        or raw_profile.get('careerSummary')
        or raw_text,
        260,
    )
    highlights = _normalize_text_list(
        raw_profile.get('careerHighlights')
        if isinstance(raw_profile.get('careerHighlights'), list)
        else raw_profile.get('highlights'),
        max_items=8,
        max_len=200,
    )
    core_skills = _normalize_skill_list(
        raw_profile.get('coreSkills')
        if isinstance(raw_profile.get('coreSkills'), list)
        else raw_profile.get('skills'),
        max_items=20,
    )
    constraints = _normalize_text_list(
        raw_profile.get('constraints')
        if isinstance(raw_profile.get('constraints'), list)
        else raw_profile.get('hardConstraints'),
        max_items=8,
        max_len=140,
    )
    if not constraints:
        constraints = [
            '仅基于用户明确提供的信息',
            '未明确的时间/结果不得补全',
            '后续诊断与优化禁止虚构经历',
        ]

    experiences_raw = raw_profile.get('experiences') or raw_profile.get('careerFacts') or []
    experiences = []
    if isinstance(experiences_raw, list):
        for idx, item in enumerate(experiences_raw[:12], start=1):
            normalized = _sanitize_experience_item(item, idx)
            if normalized:
                experiences.append(normalized)
    if not experiences:
        fallback_items = _extract_fallback_sentences(raw_text, limit=4)
        for idx, sentence in enumerate(fallback_items, start=1):
            experiences.append({
                'title': f'经历{idx}',
                'period': '',
                'organization': '',
                'actions': sentence,
                'results': '',
                'skills': [],
                'inResume': 'unknown',
                'confidence': 'low',
                'evidence': '来自用户自述',
            })
            
    educations_raw = raw_profile.get('educations') or []
    educations = []
    if isinstance(educations_raw, list):
        for idx, item in enumerate(educations_raw[:5], start=1):
            normalized = _sanitize_education_item(item, idx)
            if normalized:
                educations.append(normalized)

    projects_raw = raw_profile.get('projects') or []
    projects = []
    if isinstance(projects_raw, list):
        for idx, item in enumerate(projects_raw[:10], start=1):
            normalized = _sanitize_project_item(item, idx)
            if normalized:
                projects.append(normalized)

    personal_info = _extract_personal_info(raw_profile, existing_profile, raw_text)
    existing = existing_profile if isinstance(existing_profile, dict) else {}
    target_role = _first_non_empty(
        raw_profile.get('targetRole'),
        raw_profile.get('jobDirection'),
        raw_profile.get('jobTarget'),
        (personal_info or {}).get('title'),
        existing.get('targetRole'),
        existing.get('jobDirection'),
    )

    derived_fact_items = _derive_fact_items(core_skills, highlights, constraints)
    fact_items, fact_source, _fact_errors = resolve_fact_items_with_fallback(
        incoming_fact_items=raw_profile.get('factItems') if 'factItems' in raw_profile else None,
        existing_fact_items=existing.get('factItems'),
        logger=logger,
        field_path='profile.factItems',
    )
    if fact_source == 'empty_list' and derived_fact_items:
        fact_items = derived_fact_items

    return {
        'id': f"career_profile_{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        'createdAt': _now_iso(),
        'source': 'manual_self_report',
        'summary': summary,
        'careerHighlights': highlights,
        'coreSkills': core_skills,
        'targetRole': target_role,
        'jobDirection': target_role,
        'constraints': constraints,
        'factItems': fact_items,
        'experiences': experiences,
        'educations': educations,
        'projects': projects,
        'personalInfo': personal_info or {},
        'rawInput': _compact_text(raw_text, 2000),
    }


def organize_career_profile_core(current_user_id, data, deps):
    logger = deps['logger']
    raw_text = str((data or {}).get('rawExperienceText') or '').strip()
    if not raw_text:
        return {'error': '请先填写职业经历信息'}, 400
    if len(raw_text) < 20:
        return {'error': '职业经历内容太短，请至少输入20个字'}, 400

    existing_profile = (data or {}).get('existingProfile') or {}

    can_run_analysis_ai = deps.get('can_run_analysis_ai')
    ai_enabled = bool(can_run_analysis_ai(current_user_id, data)) if callable(can_run_analysis_ai) else bool(
        deps.get('gemini_client') and deps.get('check_gemini_quota') and deps['check_gemini_quota']()
    )

    if not ai_enabled:
        fallback_profile = _build_fallback_profile(raw_text, existing_profile=existing_profile, logger=logger)
        return {
            'success': True,
            'profile': fallback_profile,
            'analysis_model': None,
            'note': 'AI服务暂不可用，已按用户输入生成基础职业画像。',
        }, 200

    try:
        existing_context = json.dumps(existing_profile, ensure_ascii=False) if isinstance(existing_profile, dict) else '无'
        prompt = f"""
你是“职业画像整理助手”。请把用户提供的职业经历整理成结构化 JSON。

硬性约束：
1. 只能使用用户明确提供的信息，不得补全或虚构公司名、项目名、时间线、结果数据。
2. 信息不充分时，字段留空字符串或 unknown，不要猜测。
3. 输出仅允许 JSON，不要任何解释文字。
4. 目标是给后续 JD 诊断与简历优化提供“可信事实库”，而不是写营销文案。

用户新输入：
{raw_text}

已有职业画像（可用于去重/合并）：
{existing_context}

输出 JSON 结构：
{{
  "personalInfo": {{
    "name": "姓名，未知留空",
    "title": "当前/目标职位，未知留空",
    "email": "邮箱，未知留空",
    "phone": "电话，未知留空",
    "location": "城市/地区，未知留空",
    "linkedin": "LinkedIn 链接，未知留空",
    "website": "个人网址/作品集链接，未知留空",
    "age": "年龄，未知留空",
    "gender": "male/female 或 男/女，未知留空"
  }},
  "targetRole": "目标岗位名称，未知留空",
  "summary": "120-220字职业画像总结，客观事实导向",
  "careerHighlights": ["亮点1", "亮点2"],
  "coreSkills": ["技能1", "技能2"],
  "constraints": ["约束1", "约束2"],
  "experiences": [
    {{
      "title": "经历标题",
      "period": "时间范围，未知留空",
      "organization": "公司/组织，未知留空",
      "actions": "做了什么",
      "results": "结果，未知留空",
      "skills": ["涉及技能"],
      "inResume": "yes|no|unknown",
      "confidence": "high|medium|low",
      "evidence": "来自用户自述"
    }}
  ],
  "educations": [
    {{
      "school": "学校名称",
      "degree": "学历",
      "major": "专业",
      "period": "就读时间",
      "description": "其他描述或荣誉奖项"
    }}
  ],
  "projects": [
    {{
      "title": "项目名称",
      "subtitle": "项目角色",
      "period": "项目时间",
      "description": "项目描述/行动/结果",
      "link": "项目链接"
    }}
  ]
}}
"""

        base_models = deps['get_analysis_model_candidates']()
        final_stage_model = str(deps.get('GEMINI_RESUME_GENERATION_MODEL') or '').strip()
        models_tried = [final_stage_model, *(base_models or [])]
        deduped_models = []
        for model_name in models_tried:
            model = str(model_name or '').strip()
            if not model or model in deduped_models:
                continue
            if 'pro' in model.lower():
                continue
            deduped_models.append(model)
        if not deduped_models:
            deduped_models = ['gemini-2.5-flash']

        response, used_model = deps['analysis_generate_content_resilient'](
            current_user_id=current_user_id,
            data=data,
            prompt=prompt,
            analysis_models_tried=deduped_models,
        )
        parsed = deps['parse_ai_response'](response.text)
        profile = _sanitize_profile(parsed, raw_text, existing_profile=existing_profile, logger=logger)
        guarded_profile = _apply_profile_main_field_guard(
            profile,
            raw_text,
            existing_profile=existing_profile,
            logger=logger,
        )
        return {
            'success': True,
            'profile': guarded_profile,
            'analysis_model': used_model,
        }, 200
    except Exception as err:
        logger.warning("organize_career_profile fallback due to error: %s", err)
        fallback_profile = _build_fallback_profile(raw_text, existing_profile=existing_profile, logger=logger)
        return {
            'success': True,
            'profile': fallback_profile,
            'analysis_model': None,
            'note': 'AI整理失败，已按输入生成基础职业画像。',
        }, 200
