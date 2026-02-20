import json
import re

from google.genai import types


def _build_resume_fallback(resume_data):
    return {
        'personalInfo': resume_data.get('personalInfo', {}) or {},
        'workExps': resume_data.get('workExps', []) or [],
        'educations': resume_data.get('educations', []) or [],
        'projects': resume_data.get('projects', []) or [],
        'skills': resume_data.get('skills', []) or [],
        'summary': resume_data.get('summary', '') or '',
    }


def _normalize_resume_shape(data):
    resume = data if isinstance(data, dict) else {}
    return {
        'personalInfo': resume.get('personalInfo', {}) or {},
        'workExps': resume.get('workExps', []) or [],
        'educations': resume.get('educations', []) or [],
        'projects': resume.get('projects', []) or [],
        'skills': resume.get('skills', []) or [],
        'summary': resume.get('summary', '') or '',
    }


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

    next_resume['personalInfo'] = target_pi
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
    for field in ('name', 'title', 'email', 'phone', 'location'):
        if _is_non_empty(source_pi.get(field)):
            target_pi[field] = source_pi.get(field)
    next_resume['personalInfo'] = target_pi

    # Work experience: keep company/position/timeline stable; allow description refinement.
    next_resume['workExps'] = _merge_section_items_with_fact_guard(
        source.get('workExps') or [],
        next_resume.get('workExps') or [],
        factual_fields=('company', 'position', 'startDate', 'endDate'),
    )

    # Education: keep school/degree/major/timeline stable.
    next_resume['educations'] = _merge_section_items_with_fact_guard(
        source.get('educations') or [],
        next_resume.get('educations') or [],
        factual_fields=('school', 'degree', 'major', 'startDate', 'endDate'),
    )

    # Projects: keep title/date stable; allow description refinement.
    next_resume['projects'] = _merge_section_items_with_fact_guard(
        source.get('projects') or [],
        next_resume.get('projects') or [],
        factual_fields=('title', 'date'),
    )

    # Preserve summary fallback.
    if _is_non_empty(source.get('summary')) and not _is_non_empty(next_resume.get('summary')):
        next_resume['summary'] = source.get('summary')

    return next_resume


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

**输出要求**
1. 仅返回 JSON（不要附加额外文本）。
2. 内容需结合原始数据、对话上下文和优化建议，生成“可直接投递”的版本。
2.1 目标是“二次诊断低批注终稿”：除事实缺口外，不要保留容易被判定为“需改写”的低质量句子。
3. 不得输出模板占位符，如：XX、XXX、[具体任务]、[关键行动]、[可量化结果]、待补充、示例、TBD。
4. 对于无法确认的数字，不要编造具体数值；改为“可验证结果/关键结果”等自然表达。
5. workExps/projects 的每条 description 必须是完整自然语言，不得只输出框架句。
5.1 description 必须包含“动作+方法/工具+结果”三个要素中的至少两个，且语义完整。
6. 若建议指向某段经历或句子，该处必须被改写；禁止大段原文完全照搬。
7. 若原简历某模块为空（如 projects），只有在建议明确要求新增时才新增该模块内容。
8. 保持原始事实边界：不得虚构公司/项目/时间线/证书。
9. personalInfo 中已存在的 name/email/phone 不得删除或改成空值。
10. 禁止输出“可进一步优化/建议补充细节/建议完善表达”等评语句；最终内容必须直接是成稿。

**输出格式**
{{
  "resumeData": {{
    "personalInfo": {{
      "name": "姓名",
      "title": "职位标题",
      "email": "邮箱地址",
      "phone": "电话号码",
      "location": "所在地"
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
        "description": "详细项目描述",
        "date": "项目时间"
      }}
    ],
    "skills": ["技能1", "技能2", "技能3"],
    "summary": "专业简介"
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

            unresolved = _detect_unresolved_suggestions(generated, normalized_suggestions)
            unresolved_context = '\n'.join([
                f"- [{s.get('id')}] {s.get('title')} | section={s.get('targetSection')} | reason={s.get('reason')} | original={s.get('originalValue')} | suggested={s.get('suggestedValue')}"
                for s in unresolved
            ]) if unresolved else '无'

            verify_prompt = f"""
你是“简历重写校验器”。请逐条校验优化建议是否已在候选新简历中落实，并输出修订后最终简历。
要求：
1) 必须逐条核验 suggestions，不得跳过。
2) 对“未落实/落实不足”的建议，必须在 resumeData 中继续改写，直到可直接投递。
2.1 修订后目标是“二次诊断低批注终稿”，禁止遗留明显可改写的低质量句子。
3) 禁止输出占位符：XX/XXX/[具体任务]/[关键行动]/[可量化结果]/待补充/示例/TBD。
4) 不得虚构事实；无法确认具体数字时使用自然表达（如“显著提升”“关键结果”）。
5) personalInfo.name/email/phone 不得丢失。
6) 输出内容必须是成稿简历，不要输出“建议/说明/注释/待补充”等非简历文本。
7) 仅返回 JSON，不要解释。

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
            return final_generated
    except Exception as ai_error:
        logger.error("AI 生成简历失败: %s", ai_error)
        if "429" in str(ai_error) or "quota" in str(ai_error).lower() or "exceeded" in str(ai_error).lower():
            logger.warning("Gemini 配额超限，回退为本地简历生成")

    return fallback_resume
