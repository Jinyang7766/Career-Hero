import json
import re
from datetime import datetime, timezone


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


def _build_fallback_profile(raw_text, existing_profile=None):
    existing = existing_profile if isinstance(existing_profile, dict) else {}
    summary = _compact_text(existing.get('summary') or raw_text, 220)
    highlights = _extract_fallback_sentences(raw_text, limit=4)
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

    return {
        'id': f"career_profile_{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        'createdAt': _now_iso(),
        'source': 'manual_self_report',
        'summary': summary,
        'careerHighlights': highlights,
        'coreSkills': [],
        'constraints': [
            '仅基于用户明确提供的信息',
            '未明确的时间/结果不得补全',
            '后续诊断与优化禁止虚构经历',
        ],
        'experiences': experiences,
        'rawInput': _compact_text(raw_text, 2000),
    }


def _sanitize_profile(raw_profile, raw_text, existing_profile=None):
    if not isinstance(raw_profile, dict):
        return _build_fallback_profile(raw_text, existing_profile=existing_profile)

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

    return {
        'id': f"career_profile_{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        'createdAt': _now_iso(),
        'source': 'manual_self_report',
        'summary': summary,
        'careerHighlights': highlights,
        'coreSkills': core_skills,
        'constraints': constraints,
        'experiences': experiences,
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
        fallback_profile = _build_fallback_profile(raw_text, existing_profile=existing_profile)
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
        profile = _sanitize_profile(parsed, raw_text, existing_profile=existing_profile)
        return {
            'success': True,
            'profile': profile,
            'analysis_model': used_model,
        }, 200
    except Exception as err:
        logger.warning("organize_career_profile fallback due to error: %s", err)
        fallback_profile = _build_fallback_profile(raw_text, existing_profile=existing_profile)
        return {
            'success': True,
            'profile': fallback_profile,
            'analysis_model': None,
            'note': 'AI整理失败，已按输入生成基础职业画像。',
        }, 200
