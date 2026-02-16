# -*- coding: utf-8 -*-
import json
import re


def format_resume_for_ai(resume_data):
    """用于 AI 的简历格式化文本"""
    def _text(v):
        return str(v).strip() if v is not None else ''

    def _normalize_gender(v):
        value = _text(v).lower()
        if value in ('male', 'man', 'm', '男', '男性'):
            return '男'
        if value in ('female', 'woman', 'f', '女', '女性'):
            return '女'
        return ''

    formatted = []
    personal = resume_data.get('personalInfo', {}) or {}
    if personal:
        formatted.append(f"姓名: {_text(personal.get('name'))}")
        formatted.append(f"职位: {_text(personal.get('title') or personal.get('jobTitle'))}")
    gender = _normalize_gender(resume_data.get('gender') or personal.get('gender'))
    if gender:
        formatted.append(f"性别: {gender}")

    summary = _text(resume_data.get('summary') or personal.get('summary'))
    if summary:
        formatted.append(f"个人简介: {summary}")

    work_exps = resume_data.get('workExps', []) or []
    if work_exps:
        formatted.append("\n工作经历:")
        for exp in work_exps:
            exp = exp or {}
            company = _text(exp.get('company') or exp.get('title'))
            position = _text(exp.get('position') or exp.get('subtitle'))
            start_date = _text(exp.get('startDate'))
            end_date = _text(exp.get('endDate'))
            date_range = _text(exp.get('date')) or (f"{start_date}-{end_date}" if (start_date or end_date) else '')
            description = _text(exp.get('description'))
            line = f"- {position or '职位未填写'} @ {company or '公司未填写'}"
            if date_range:
                line += f" [{date_range}]"
            if description:
                line += f": {description}"
            formatted.append(line)

    educations = resume_data.get('educations', []) or []
    if educations:
        formatted.append("\n教育背景:")
        for edu in educations:
            edu = edu or {}
            school = _text(edu.get('school') or edu.get('title'))
            major = _text(edu.get('major') or edu.get('subtitle'))
            degree = _text(edu.get('degree'))
            start_date = _text(edu.get('startDate'))
            end_date = _text(edu.get('endDate'))
            date_range = _text(edu.get('date')) or (f"{start_date}-{end_date}" if (start_date or end_date) else '')
            line = f"- {degree} {major}".strip() + f" @ {school or '学校未填写'}"
            if date_range:
                line += f" [{date_range}]"
            formatted.append(line)

    skills = resume_data.get('skills', []) or []
    if isinstance(skills, list) and skills:
        normalized = [_text(s) for s in skills if _text(s)]
        if normalized:
            formatted.append(f"\n技能: {', '.join(normalized)}")
    return '\n'.join(formatted)


def parse_ai_response(response_text):
    """解析 AI 回复中的结构化数据"""
    try:
        start = response_text.find('{')
        end = response_text.rfind('}') + 1
        if start != -1 and end != 0:
            return json.loads(response_text[start:end])
    except Exception:
        pass
    return {'score': 75, 'strengths': [], 'weaknesses': [], 'suggestions': [], 'missingKeywords': []}


def is_gender_related_suggestion(suggestion):
    if suggestion is None:
        return False

    gender_tokens = (
        '性别', 'gender', 'sex',
        '男', '女', '男性', '女性', '男生', '女生', '女士', '先生',
        'male', 'female', 'man', 'woman'
    )

    def _contains_gender_text(value):
        text = str(value or '').strip().lower()
        if not text:
            return False
        return any(token in text for token in gender_tokens)

    if isinstance(suggestion, str):
        return _contains_gender_text(suggestion)
    if not isinstance(suggestion, dict):
        return False

    target_field = str(suggestion.get('targetField') or '').strip().lower()
    if target_field in ('gender', 'sex'):
        return True

    target_section = str(suggestion.get('targetSection') or '').strip().lower()
    if target_section in ('gender', 'sex'):
        return True

    combined = ' '.join([
        str(suggestion.get('title') or ''),
        str(suggestion.get('reason') or ''),
        str(suggestion.get('targetSection') or ''),
        str(suggestion.get('targetField') or ''),
        json.dumps(suggestion.get('suggestedValue', ''), ensure_ascii=False),
        json.dumps(suggestion.get('originalValue', ''), ensure_ascii=False)
    ])
    return _contains_gender_text(combined)


def is_education_related_suggestion(suggestion):
    if suggestion is None:
        return False

    edu_tokens = (
        '教育背景', '教育经历', '教育信息', '学历', '学位', '专业', '主修', '课程',
        '本科', '硕士', '博士', '学校', '院校', '学院',
        'education', 'educations', 'major', 'degree', 'school', 'university', 'college', 'curriculum'
    )
    edu_fields = (
        'education', 'educations', 'edu',
        'major', 'degree', 'school', 'university', 'college',
        '学历', '学位', '专业', '主修', '学校', '院校'
    )

    def _contains_edu_text(value):
        text = str(value or '').strip().lower()
        if not text:
            return False
        return any(token in text for token in edu_tokens)

    if isinstance(suggestion, str):
        return _contains_edu_text(suggestion)
    if not isinstance(suggestion, dict):
        return False

    target_field = str(suggestion.get('targetField') or '').strip().lower()
    target_section = str(suggestion.get('targetSection') or '').strip().lower()
    if target_section in ('educations', 'education', 'edu'):
        return True
    if any(field in target_field for field in edu_fields):
        return True

    combined = ' '.join([
        str(suggestion.get('title') or ''),
        str(suggestion.get('reason') or ''),
        str(suggestion.get('targetSection') or ''),
        str(suggestion.get('targetField') or ''),
        json.dumps(suggestion.get('suggestedValue', ''), ensure_ascii=False),
        json.dumps(suggestion.get('originalValue', ''), ensure_ascii=False)
    ])
    return _contains_edu_text(combined)


def ensure_analysis_summary(summary, strengths=None, weaknesses=None, missing_keywords=None, has_jd=False):
    """
    为分析总结提供长度与信息密度兜底，避免返回过短描述。
    目标长度：约 90-180 字。
    """
    def _finalize_summary_text(raw_text: str, max_len: int = 200) -> str:
        text = (raw_text or '').strip()
        if not text:
            return ''

        text = re.sub(r'\s+', ' ', text)
        text = re.sub(r'[;；]+', '；', text)
        text = re.sub(r'[。\.]{2,}', '。', text)
        text = re.sub(r'([。！？；，])\s*([。！？；，])', r'\1', text).strip()

        if len(text) > max_len:
            clipped = text[:max_len]
            sentence_end = max(clipped.rfind('。'), clipped.rfind('！'), clipped.rfind('？'), clipped.rfind('；'))
            if sentence_end >= int(max_len * 0.55):
                text = clipped[:sentence_end + 1].strip()
            else:
                comma_end = max(clipped.rfind('，'), clipped.rfind('、'))
                if comma_end >= int(max_len * 0.55):
                    text = clipped[:comma_end].rstrip('，、 ') + '。'
                else:
                    text = clipped.rstrip('，、,;；:： ') + '。'

        if re.search(r'(与|和|及|并|并且|且|在|将|对|过|中|的)[。]$', text):
            last_sentence = max(text[:-1].rfind('。'), text[:-1].rfind('！'), text[:-1].rfind('？'), text[:-1].rfind('；'))
            if last_sentence > 0:
                text = text[:last_sentence + 1].strip()

        if text and text[-1] not in '。！？；':
            text += '。'
        return text

    text = _finalize_summary_text((summary or '').strip())
    if len(text) >= 90:
        return text

    strengths = strengths or []
    weaknesses = weaknesses or []
    missing_keywords = missing_keywords or []

    parts = []
    if text:
        parts.append(text)
    else:
        parts.append('简历具备一定基础，但当前表达深度和岗位贴合度仍有明显提升空间。')

    clean_strengths = [str(s).strip() for s in strengths if str(s).strip()]
    clean_weaknesses = [str(w).strip() for w in weaknesses if str(w).strip()]
    clean_keywords = [str(k).strip() for k in missing_keywords if str(k).strip()]

    if clean_strengths:
        parts.append(f"优势方面：{'、'.join(clean_strengths[:2])}。")
    if clean_weaknesses:
        parts.append(f"短板主要在：{'、'.join(clean_weaknesses[:3])}。")
    if has_jd and clean_keywords:
        parts.append(f"与JD相比仍缺关键词：{'、'.join(clean_keywords[:5])}。")

    parts.append('建议优先补充可量化成果、职责场景和业务结果，按STAR结构重写核心经历，以提升筛选通过率和岗位说服力。')

    merged = ''.join(parts).strip()
    return _finalize_summary_text(merged, max_len=200)


def generate_mock_chat_response(message, score, suggestions, enhanced=False):
    """当 AI 不可用时的面试回复。enhanced=True 时使用更严格模板。"""
    if 'SYSTEM_START_INTERVIEW' in message or 'INTERVIEW_MODE' in message:
        if enhanced:
            return '我是你的智能面试官，现在开始：请用 1 分钟介绍自己，并说明目标岗位方向。'
        return '我是你的智能面试官，现在开始：请简要介绍自己，并说明为何适合该岗位。'

    if enhanced:
        return '点评：表达清晰，但缺少量化结果。改进：补充指标数据。参考：我在 X 项目中将 Y 提升 Z%。下一题：请举例说明你解决关键问题的项目及结果。'

    return '点评：结构尚可，但缺少背景与结果。改进：补充场景和成果。参考：当时……我……最终达成……。下一题：描述一次你处理冲突或分歧的经历，以及你如何推动结果。'
