# -*- coding: utf-8 -*-
import json
import re


def _normalize_skill_candidates(value):
    def _iter_values(raw):
        if raw is None:
            return
        if isinstance(raw, (list, tuple, set)):
            for item in raw:
                yield from _iter_values(item)
            return
        if isinstance(raw, dict):
            preferred_keys = [
                'skill', 'name', 'title', 'label', 'value', 'keyword', 'technology', 'tech',
                '技能', '名称', '关键词', '证书'
            ]
            yielded = False
            for key in preferred_keys:
                if key in raw:
                    yielded = True
                    yield from _iter_values(raw.get(key))
            if not yielded:
                for v in raw.values():
                    if isinstance(v, (str, int, float)):
                        yield from _iter_values(v)
            return
        if isinstance(raw, (int, float)):
            text = str(raw).strip()
            if text:
                yield text
            return
        text = str(raw).strip()
        if text:
            yield text

    out = []
    seen = set()
    for chunk in _iter_values(value):
        for token in re.split(r"[，,、/\n;；|]+", str(chunk).strip()):
            v = str(token).strip()
            if not v:
                continue
            key = re.sub(r"[\s，,；;:：|/\\]+", "", v).lower()
            if not key or key in seen:
                continue
            seen.add(key)
            out.append(v)
    return out


def parse_json_object_from_text(response_text):
    if not response_text:
        return None
    try:
        start = response_text.find('{')
        end = response_text.rfind('}') + 1
        if start >= 0 and end > start:
            return json.loads(response_text[start:end])
    except Exception:
        return None
    return None


def is_missing_resume_core_fields(parsed_data):
    personal = parsed_data.get('personalInfo', {}) or {}
    work_exps = parsed_data.get('workExps', []) or []
    educations = parsed_data.get('educations', []) or []

    summary_missing = not (personal.get('summary') or '').strip()
    work_missing = (not work_exps) or any(
        not (w.get('company') or '').strip() or not (w.get('position') or '').strip()
        for w in work_exps
    )
    edu_missing = (not educations) or any(
        not (e.get('school') or '').strip() or not (e.get('major') or '').strip()
        for e in educations
    )
    return summary_missing or work_missing or edu_missing


def normalize_parsed_resume_result(ai_result):
    ai_result = ai_result or {}
    personal = ai_result.get('personalInfo') or ai_result.get('personal') or ai_result.get('个人信息') or {}
    work_exps = (
        ai_result.get('workExps')
        or ai_result.get('workExperience')
        or ai_result.get('experiences')
        or ai_result.get('work_experience')
        or ai_result.get('工作经历')
        or []
    )
    educations = (
        ai_result.get('educations')
        or ai_result.get('education')
        or ai_result.get('educationExps')
        or ai_result.get('教育经历')
        or []
    )
    projects = ai_result.get('projects') or ai_result.get('projectExperience') or ai_result.get('项目经历') or []
    skills = _normalize_skill_candidates(
        ai_result.get('skills') or ai_result.get('skillSet') or ai_result.get('技能') or []
    )

    def _pick(d, keys, default=''):
        if not isinstance(d, dict):
            return default
        for k in keys:
            v = d.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()
            if isinstance(v, (int, float)):
                vv = str(v).strip()
                if vv:
                    return vv
        return default

    def _normalize_gender(value):
        raw = str(value or '').strip().lower()
        if not raw:
            return ''
        raw = re.sub(r'^(?:性别|gender|sex)\s*[:：]?\s*', '', raw).strip()
        if not raw:
            return ''
        male_tokens = {'男', '男性', 'male', 'm', 'man', 'boy', '先生', '♂'}
        female_tokens = {'女', '女性', 'female', 'f', 'woman', 'girl', '女士', '♀'}
        if raw in male_tokens:
            return 'male'
        if raw in female_tokens:
            return 'female'
        if ('男' in raw and '女' not in raw) or re.search(r'\bmale\b', raw):
            return 'male'
        if ('女' in raw and '男' not in raw) or re.search(r'\bfemale\b', raw):
            return 'female'
        return ''

    def _normalize_age(value):
        raw = str(value or '').strip()
        if not raw:
            return ''
        compact = re.sub(r'\s+', '', raw)
        compact = re.sub(r'(周?岁|years?old|yrs?)', '', compact, flags=re.IGNORECASE)
        if not compact:
            return ''
        # Prefer a short explicit age token and avoid treating birth year as age.
        m = re.search(r'(?<!\d)(\d{1,3})(?!\d)', compact)
        if m and not re.search(r'\d{4}', compact):
            return m.group(1)
        return compact[:10]

    def _ensure_list(value):
        if isinstance(value, list):
            return value
        if isinstance(value, dict):
            return [value]
        return []

    def _split_date_range(range_str):
        if not range_str or not isinstance(range_str, str):
            return None, None
        separators = [' - ', ' – ', ' — ', '-', '至', ' 到 ', '~', ' to ']
        for sep in separators:
            if sep in range_str:
                parts = range_str.split(sep, 1)
                return parts[0].strip(), parts[1].strip()
        return None, None

    def _is_year_only_date(raw_value):
        raw = str(raw_value or '').strip()
        if not raw:
            return False
        raw = raw.replace('年', '').strip()
        return bool(re.fullmatch(r'\d{4}', raw))

    def _strip_month_if_year_only(raw_value, normalized_value):
        normalized = str(normalized_value or '').strip()
        if not normalized:
            return normalized
        if not _is_year_only_date(raw_value):
            return normalized
        m = re.fullmatch(r'(\d{4})[-./年]\s*(0?[1-9]|1[0-2])', normalized)
        if m:
            return m.group(1)
        return normalized

    def _fix_messed_up_dates(start, end):
        if start and end and len(start) == 4 and start.isdigit():
            test_end = end.replace('.', '-').replace('/', '-')
            parts = [p.strip() for p in test_end.split('-') if p.strip()]
            if len(parts) >= 3 and parts[1] == start:
                new_start = f"{start}-{parts[0]}"
                if len(parts) == 3:
                    if len(parts[2]) <= 2:
                        new_end = f"{start}-{parts[2]}"
                    else:
                        new_end = parts[2]
                else:
                    new_end = "-".join(parts[2:])
                return new_start, new_end
        return start, end

    def _extract_dates(item):
        raw_start = _pick(item, ['startDate', 'start', 'from', '开始时间', '开始日期'])
        raw_end = _pick(item, ['endDate', 'end', 'to', '结束时间', '结束日期'])
        start = raw_start
        end = raw_end
        full_range = _pick(item, ['date', 'time', 'duration', '期间', '时间'])
        if (not start or not end) and full_range:
            s, e = _split_date_range(full_range)
            if s and e:
                start = start or s
                end = end or e
        if start and end:
            start, end = _fix_messed_up_dates(start, end)
        start = _strip_month_if_year_only(raw_start, start)
        end = _strip_month_if_year_only(raw_end, end)
        return start, end

    normalized_work = []
    for item in _ensure_list(work_exps):
        if not isinstance(item, dict):
            continue
        start, end = _extract_dates(item)
        normalized_work.append({
            'company': _pick(item, ['company', 'employer', 'organization', 'org', '单位', '公司']),
            'position': _pick(item, ['position', 'jobTitle', 'role', '岗位', '职位']),
            'startDate': start,
            'endDate': end,
            'description': _pick(item, ['description', 'content', 'summary', '职责', '工作内容']),
        })

    normalized_edu = []
    for item in _ensure_list(educations):
        if not isinstance(item, dict):
            continue
        start, end = _extract_dates(item)
        normalized_edu.append({
            'school': _pick(item, ['school', 'university', 'college', '学校']),
            'degree': _pick(item, ['degree', '学历', '学位']),
            'major': _pick(item, ['major', 'speciality', '专业']),
            'startDate': start,
            'endDate': end,
        })

    normalized_proj = []
    for item in _ensure_list(projects):
        if not isinstance(item, dict):
            continue
        start, end = _extract_dates(item)
        normalized_proj.append({
            'title': _pick(item, ['title', 'name', '项目名称', '项目', '项目名']),
            'subtitle': _pick(item, ['role', 'position', 'subtitle', '角色', '职位', '担任角色']),
            'startDate': start,
            'endDate': end,
            'description': _pick(item, ['description', 'content', 'summary', '职责', '项目内容', '项目描述']),
        })

    normalized_gender = _normalize_gender(
        _pick(personal, ['gender', 'sex', '性别'])
        or _pick(ai_result, ['gender', 'sex', '性别'])
    )
    normalized_age = _normalize_age(
        _pick(personal, ['age', '年龄', '岁数'])
        or _pick(ai_result, ['age', '年龄', '岁数'])
    )

    return {
        'personalInfo': {
            'name': _pick(personal, ['name', '姓名']) or '',
            'title': _pick(personal, ['title', 'jobTitle', '求职意向', '职位']) or '',
            'email': _pick(personal, ['email', '邮箱']) or '',
            'phone': _pick(personal, ['phone', 'mobile', '手机号', '电话']) or '',
            'location': _pick(personal, ['location', 'city', '地址', '所在地']) or '',
            'age': normalized_age,
            'summary': (
                _pick(personal, ['summary', 'profile', 'selfIntro', '自我评价', '个人总结', '个人简介'])
                or (ai_result.get('summary', '') if isinstance(ai_result.get('summary', ''), str) else '')
            ),
        },
        'workExps': normalized_work,
        'educations': normalized_edu,
        'projects': normalized_proj,
        'skills': skills if isinstance(skills, list) else [],
        'gender': normalized_gender,
    }


def extract_skills_from_resume_text(resume_text):
    text = (resume_text or '').strip()
    if not text:
        return []
    lines = [ln.strip() for ln in re.split(r'[\r\n]+', text) if ln and ln.strip()]
    collected = []
    cert_collected = []

    skill_heading_inline_re = re.compile(
        r'^(专业技能|核心技能|技能特长|技能标签|技能|掌握技能|IT技能|工具技能|技术栈|技术能力|核心能力|专业能力|技能清单|个人技能)\s*[:：]?\s*(.*)$',
        re.IGNORECASE
    )
    cert_heading_inline_re = re.compile(
        r'^(证书|资格证书|专业证书|职业资格|资质证书)\s*[:：]?\s*(.*)$',
        re.IGNORECASE
    )
    next_section_re = re.compile(
        r'^(工作经历|项目经历|教育经历|教育背景|个人总结|自我评价|荣誉|语言能力|兴趣爱好|联系方式)\s*[:：]?$'
    )

    in_skill_block = False
    in_cert_block = False
    split_items_re = re.compile(r'[，,、;；|]+|\t+|\s{2,}')

    def _split_skill_items(payload):
        if not payload:
            return []
        base_parts = [p.strip() for p in split_items_re.split(str(payload)) if p and str(p).strip()]
        out = []
        for part in base_parts:
            token = str(part).strip()
            if not token:
                continue
            if '/' in token or '／' in token:
                sub_tokens = [s.strip() for s in re.split(r'[\/／]+', token) if s and s.strip()]
                idx = 0
                while idx < len(sub_tokens):
                    current = sub_tokens[idx]
                    next_token = sub_tokens[idx + 1] if idx + 1 < len(sub_tokens) else ''
                    # Preserve A/B style skill tokens while still splitting normal slash lists.
                    if re.fullmatch(r'(?i)a', current) and next_token and re.match(r'(?i)^b(?:$|[^a-z0-9].*)', next_token):
                        out.append(f"A/{next_token}")
                        idx += 2
                        continue
                    out.append(current)
                    idx += 1
                continue
            out.append(token)
        return out
    for ln in lines:
        compact_ln = re.sub(r'\s+', '', ln)

        skill_m = skill_heading_inline_re.match(ln) or skill_heading_inline_re.match(compact_ln)
        if skill_m:
            in_skill_block = True
            in_cert_block = False
            inline_payload = (skill_m.group(2) or '').strip()
            if not inline_payload and ('：' in ln or ':' in ln):
                inline_payload = re.split(r'[:：]', ln, maxsplit=1)[1].strip()
            if inline_payload:
                parts = _split_skill_items(inline_payload)
                collected.extend(parts)
            continue

        cert_m = cert_heading_inline_re.match(ln) or cert_heading_inline_re.match(compact_ln)
        if cert_m:
            in_cert_block = True
            in_skill_block = False
            inline_payload = (cert_m.group(2) or '').strip()
            if not inline_payload and ('：' in ln or ':' in ln):
                inline_payload = re.split(r'[:：]', ln, maxsplit=1)[1].strip()
            if inline_payload:
                parts = _split_skill_items(inline_payload)
                cert_collected.extend(parts)
            continue

        if next_section_re.match(ln):
            in_skill_block = False
            in_cert_block = False
            continue

        if in_skill_block:
            parts = _split_skill_items(ln)
            collected.extend(parts)
            continue

        if in_cert_block:
            parts = _split_skill_items(ln)
            cert_collected.extend(parts)

    collected.extend(cert_collected)
    cert_global_patterns = [
        r'\b(?:PMP|CFA|FRM|CPA|ACCA|CISP|CISSP)\b',
        r'(?:软考(?:中级|高级)?(?:证书)?|教师资格证|法律职业资格证|基金从业资格证|证券从业资格证|银行从业资格证|一级建造师|二级建造师|会计师证书|执业药师|注册会计师)',
        r'\b(?:CET[-\s]?[46]|TEM[-\s]?[48]|IELTS|TOEFL|N2|N1)\b',
        r'(?:大学英语[四六]级|英语[四六]级|普通话[一二三]级(?:甲等|乙等)?|计算机(?:等级)?[一二三四]级|全国计算机等级考试|NCRE)'
    ]
    for pat in cert_global_patterns:
        for m in re.findall(pat, text, flags=re.IGNORECASE):
            if isinstance(m, tuple):
                m = next((x for x in m if x), '')
            v = str(m).strip()
            if v:
                collected.append(v)

    noise = {
        '技能', '专业技能', '核心技能', '工作经历', '教育经历', '项目经历',
        '电商', '数据', '运营', '分析', '平台', '工具', '技术', '能力',
        '天猫', '京东', '钉钉'
    }
    cert_re = re.compile(
        r'(证书|认证|资格证|执业证|从业资格|等级证|PMP|CFA|FRM|CPA|ACCA|CISP|CISSP|软考|教师资格证|法律职业资格|'
        r'CET[-\s]?[46]|TEM[-\s]?[48]|IELTS|TOEFL|N2|N1|大学英语[四六]级|英语[四六]级|普通话[一二三]级(?:甲等|乙等)?|'
        r'计算机(?:等级)?[一二三四]级|全国计算机等级考试|NCRE)',
        re.IGNORECASE
    )
    strong_skill_re = re.compile(
        r'^(Python|Java|JavaScript|TypeScript|SQL|Excel|Tableau|PowerBI|SPSS|Linux|Git|Docker|Kubernetes|React|Vue|Node\.?js|Flask|Django|Spring|SAP|ERP|WMS|GA4|SEO|SEM|A/B测试|A/B Test|SCRM|CRM|LLM|生意参谋|京东商智|万相台|直通车|引力魔方|千川|巨量引擎|数据建模|数据可视化|机器学习|深度学习)$',
        re.IGNORECASE
    )
    result = []
    seen = set()
    for item in collected:
        v = re.sub(r'\s+', ' ', str(item)).strip('：:;；,，|/ ').strip()
        v = re.sub(r'^[\-•·\*\u2022]+\s*', '', v).strip()
        if not v or v in noise:
            continue
        if len(v) > 40 or len(v) < 2:
            continue
        looks_like_general_hard_skill = bool(
            re.fullmatch(r'[A-Za-z][A-Za-z0-9.+#/\-\s]{1,20}', v)
            or re.fullmatch(r'[\u4e00-\u9fa5]{2,8}', v)
        )
        if not (strong_skill_re.search(v) or cert_re.search(v) or looks_like_general_hard_skill):
            continue
        if re.search(r'(全链路|策略|流程|方案|运营|沟通|协同|策划|看板|内容|直播间|私域|社群)', v):
            continue
        key = v.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(v)
        if len(result) >= 25:
            break
    return result


def fill_skills_if_missing(parsed_data, resume_text, logger_obj=None):
    def _remove_ab_fragments(tokens):
        if not tokens:
            return []
        ab_suffixes = set()
        for raw in tokens:
            token = str(raw or '').strip()
            m = re.match(r'(?i)^A\s*[\/／]\s*(B.*)$', token)
            if m:
                ab_suffixes.add(m.group(1).strip().lower())
        if not ab_suffixes:
            return [str(t or '').strip() for t in tokens if str(t or '').strip()]

        cleaned = []
        for raw in tokens:
            token = str(raw or '').strip()
            if not token:
                continue
            if re.fullmatch(r'(?i)A', token):
                continue
            if token.lower() in ab_suffixes:
                continue
            cleaned.append(token)
        return cleaned

    strict_skills = extract_skills_from_resume_text(resume_text)
    existing_skills = _normalize_skill_candidates(parsed_data.get('skills') or [])
    if strict_skills:
        merged = []
        seen = set()
        for item in strict_skills + existing_skills:
            v = str(item or '').strip()
            if not v:
                continue
            k = v.lower()
            if k in seen:
                continue
            seen.add(k)
            merged.append(v)
        parsed_data['skills'] = _remove_ab_fragments(merged)
    else:
        parsed_data['skills'] = _remove_ab_fragments(existing_skills)

    if logger_obj:
        if strict_skills and parsed_data.get('skills'):
            logger_obj.info(
                "Skills extracted from explicit sections and merged with parser output, count=%s",
                len(parsed_data.get('skills') or [])
            )
        elif parsed_data.get('skills'):
            logger_obj.info(
                "No explicit skill section found; fallback to parser-provided skills, count=%s",
                len(parsed_data.get('skills') or [])
            )
        else:
            logger_obj.info("No skills recognized from resume text or parser output.")
    return parsed_data


def fill_profile_meta_if_missing(parsed_data, resume_text, logger_obj=None):
    text = str(resume_text or '').strip()
    if not text:
        return parsed_data

    personal = parsed_data.get('personalInfo') or {}
    current_age = str(personal.get('age') or '').strip()
    current_gender = str(parsed_data.get('gender') or '').strip().lower()

    def _normalize_gender(value):
        raw = str(value or '').strip().lower()
        if not raw:
            return ''
        if raw in ('男', '男性', 'male', 'm', 'man', 'boy', '先生', '♂'):
            return 'male'
        if raw in ('女', '女性', 'female', 'f', 'woman', 'girl', '女士', '♀'):
            return 'female'
        if ('男' in raw and '女' not in raw) or re.search(r'\bmale\b', raw):
            return 'male'
        if ('女' in raw and '男' not in raw) or re.search(r'\bfemale\b', raw):
            return 'female'
        return ''

    def _normalize_age(value):
        raw = str(value or '').strip()
        if not raw:
            return ''
        compact = re.sub(r'\s+', '', raw)
        compact = re.sub(r'(周?岁|years?old|yrs?)', '', compact, flags=re.IGNORECASE)
        m = re.search(r'(?<!\d)(\d{1,3})(?!\d)', compact)
        if m:
            age_num = int(m.group(1))
            if 12 <= age_num <= 80:
                return str(age_num)
        return ''

    extracted_gender = ''
    extracted_age = ''

    lines = [ln.strip() for ln in re.split(r'[\r\n]+', text) if str(ln).strip()]
    probe_blob = '\n'.join(lines[:20]) if lines else text

    gender_match = re.search(r'性别\s*[:：]?\s*(男|女|男性|女性|male|female)', probe_blob, flags=re.IGNORECASE)
    if gender_match:
        extracted_gender = _normalize_gender(gender_match.group(1))
    else:
        gender_token_match = re.search(r'(?<![\w\u4e00-\u9fa5])(男|女)(?![\w\u4e00-\u9fa5])', probe_blob)
        if gender_token_match:
            extracted_gender = _normalize_gender(gender_token_match.group(1))

    age_match = re.search(r'年龄\s*[:：]?\s*(\d{1,3})', probe_blob)
    if age_match:
        extracted_age = _normalize_age(age_match.group(1))
    else:
        age_token_match = re.search(r'(?<!\d)(\d{1,3})\s*岁(?!\d)', probe_blob)
        if age_token_match:
            extracted_age = _normalize_age(age_token_match.group(1))

    changed = False
    if not current_gender and extracted_gender:
        parsed_data['gender'] = extracted_gender
        changed = True
    if not current_age and extracted_age:
        personal['age'] = extracted_age
        parsed_data['personalInfo'] = personal
        changed = True

    if logger_obj:
        logger_obj.info(
            "Profile meta fallback extraction: gender=%s age=%s changed=%s",
            parsed_data.get('gender') or '',
            (parsed_data.get('personalInfo') or {}).get('age') or '',
            changed
        )
    return parsed_data


def compact_text_for_match(value):
    text = str(value or '').strip().lower()
    if not text:
        return ''
    return re.sub(r'[\s\-–—·•,，.。:：;；/\\|()（）\[\]【】\'"`]+', '', text)


def filter_unverifiable_entities(parsed_data, resume_text):
    source_compact = compact_text_for_match(resume_text)
    if not source_compact:
        return parsed_data

    blocked_company_tokens = {'工作经历', '项目经历', '教育经历', '公司', '单位', '职位', '岗位', '本人'}
    blocked_school_tokens = {'教育经历', '教育背景', '学校', '院校', '本人'}

    work_exps = parsed_data.get('workExps', []) or []
    for item in work_exps:
        if not isinstance(item, dict):
            continue
        company = (item.get('company') or '').strip()
        if not company:
            continue
        compact_company = compact_text_for_match(company)
        if not compact_company:
            item['company'] = ''
            continue
        if company in blocked_company_tokens:
            item['company'] = ''
            continue
        if compact_company not in source_compact:
            item['company'] = ''

    educations = parsed_data.get('educations', []) or []
    for item in educations:
        if not isinstance(item, dict):
            continue
        school = (item.get('school') or '').strip()
        if not school:
            continue
        compact_school = compact_text_for_match(school)
        if not compact_school:
            item['school'] = ''
            continue
        if school in blocked_school_tokens:
            item['school'] = ''
            continue
        if compact_school not in source_compact:
            item['school'] = ''

    parsed_data['workExps'] = work_exps
    parsed_data['educations'] = educations
    return parsed_data
