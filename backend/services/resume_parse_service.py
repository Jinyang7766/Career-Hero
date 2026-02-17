# -*- coding: utf-8 -*-
import base64
import concurrent.futures
import io
import json
import os
import re
import traceback

import fitz
from docx import Document
from google.genai import types
from pypdf import PdfReader

import logging

logger = logging.getLogger(__name__)
gemini_client = None
GEMINI_RESUME_PARSE_MODEL = 'gemini-3-flash-preview'
PDF_PARSE_DEBUG = False
_GET_OCR_MODEL_CANDIDATES = None


def configure_resume_parse_service(*, logger_obj=None, gemini_client_obj=None, gemini_resume_parse_model=None, pdf_parse_debug=False, get_ocr_model_candidates_fn=None):
    global logger, gemini_client, GEMINI_RESUME_PARSE_MODEL, PDF_PARSE_DEBUG, _GET_OCR_MODEL_CANDIDATES
    if logger_obj is not None:
        logger = logger_obj
    gemini_client = gemini_client_obj
    if gemini_resume_parse_model:
        GEMINI_RESUME_PARSE_MODEL = str(gemini_resume_parse_model)
    PDF_PARSE_DEBUG = bool(pdf_parse_debug)
    _GET_OCR_MODEL_CANDIDATES = get_ocr_model_candidates_fn


def get_ocr_model_candidates():
    if callable(_GET_OCR_MODEL_CANDIDATES):
        try:
            return list(_GET_OCR_MODEL_CANDIDATES() or [])
        except Exception:
            return []
    return []

def _normalize_extracted_text(text):
    if not text:
        return ""
    # Collapse noisy whitespace to improve length/quality checks.
    return re.sub(r"\s+", " ", text).strip()


def _extract_text_via_pypdf(file_bytes):
    pages_text = []
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        for page in reader.pages:
            try:
                page_text = page.extract_text() or ""
            except Exception:
                page_text = ""
            if page_text:
                pages_text.append(page_text)
    except Exception as e:
        logger.warning(f"pypdf extraction failed: {e}")
    return _normalize_extracted_text("\n".join(pages_text))


def _extract_text_via_pymupdf(file_bytes):
    pages_text = []
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        for i in range(len(doc)):
            try:
                page = doc.load_page(i)
                page_text = page.get_text("text") or ""
            except Exception:
                page_text = ""
            if page_text:
                pages_text.append(page_text)
    except Exception as e:
        logger.warning(f"PyMuPDF extraction failed: {e}")
    return _normalize_extracted_text("\n".join(pages_text))


def extract_text_from_pdf(file_bytes):
    """Extract text content from a PDF file (bytes), fallback across multiple engines."""
    text_pypdf = _extract_text_via_pypdf(file_bytes)
    text_pymupdf = _extract_text_via_pymupdf(file_bytes)

    # Prefer the longer candidate; different engines perform better on different PDFs.
    text = text_pypdf if len(text_pypdf) >= len(text_pymupdf) else text_pymupdf

    # If we can extract any meaningful text, skip OCR completely.
    # Keep threshold low to avoid false negatives on short/compact resumes.
    if len(text) >= 6:
        return text

    logger.info(
        "PDF extraction result too short (pypdf=%s, pymupdf=%s), switching to OCR.",
        len(text_pypdf),
        len(text_pymupdf),
    )
    return "[EXTERNAL_OCR_REQUIRED]"

def extract_text_multimodal(file_bytes):
    """Use Gemini Vision to extract text from PDF pages converted to images."""
    try:
        logger.info("Starting multimodal resume parsing...")
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        images = []
        
        # 限制页数，防止超过 API 限制或过慢
        max_pages = min(len(doc), 5)
        for i in range(max_pages):
            page = doc.load_page(i)
            # Keep resolution moderate to avoid request payload too large.
            pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5))
            img_bytes = pix.tobytes("png")
            images.append({
                "mime_type": "image/png",
                "data": base64.b64encode(img_bytes).decode("utf-8")
            })
        
        if not images:
            return ""

        if not gemini_client:
            logger.warning("Gemini client is not configured, OCR is unavailable.")
            return ""

        prompt = "你是一位专业的简历解析专家。请阅读这张简历图片，并将其中所有的文字内容完整、准确地提取出来，保持原有的段落和逻辑结构。不需要返回 JSON，只需要提取出的原始文本。"
        
        # 构造内容列表 [prompt, img1, img2, ...]
        contents = [prompt]
        for img in images:
             # Convert base64 data back to bytes (or pass specific structure if sdk supports)
             # The new SDK supports types.Part.from_bytes
             img_bytes_decoded = base64.b64decode(img['data'])
             contents.append(types.Part.from_bytes(data=img_bytes_decoded, mime_type=img['mime_type']))

        try:
            ocr_call_timeout_seconds = max(5, int(os.getenv('OCR_CALL_TIMEOUT_SECONDS', '35')))
        except Exception:
            ocr_call_timeout_seconds = 35

        def _ocr_with_model(model_name: str, model_contents):
            response = gemini_client.models.generate_content(
                model=model_name,
                contents=model_contents
            )
            return (response.text or "").strip()

        def _ocr_with_timeout(model_name: str, model_contents):
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(_ocr_with_model, model_name, model_contents)
                try:
                    return future.result(timeout=ocr_call_timeout_seconds)
                except concurrent.futures.TimeoutError:
                    logger.warning("OCR call timeout model=%s timeout=%ss", model_name, ocr_call_timeout_seconds)
                    return ""

        for model_name in get_ocr_model_candidates():
            try:
                logger.info("Trying OCR model: %s", model_name)
                text = _ocr_with_timeout(model_name, contents)
                if text:
                    logger.info("OCR success with model=%s, text_len=%s", model_name, len(text))
                    return text
            except Exception as model_err:
                logger.warning("OCR batch failed (%s): %s", model_name, model_err)

            # Fallback: page-by-page OCR (more robust for large/complex PDFs).
            try:
                per_page_texts = []
                for idx, img in enumerate(images):
                    try:
                        page_contents = [
                            prompt,
                            types.Part.from_bytes(
                                data=base64.b64decode(img['data']),
                                mime_type=img['mime_type']
                            )
                        ]
                        page_text = _ocr_with_timeout(model_name, page_contents)
                        if page_text:
                            per_page_texts.append(page_text)
                    except Exception as page_err:
                        logger.warning("OCR page failed model=%s page=%s: %s", model_name, idx + 1, page_err)
                        continue

                merged = _normalize_extracted_text("\n".join(per_page_texts))
                if merged:
                    logger.info("OCR per-page success with model=%s, text_len=%s", model_name, len(merged))
                    return merged
            except Exception as per_page_err:
                logger.warning("OCR per-page fallback failed (%s): %s", model_name, per_page_err)
                continue
        logger.error("All OCR models failed or returned empty text.")
        return ""
    except Exception as e:
        logger.error(f"Multimodal extraction failed: {e}")
        logger.error(traceback.format_exc())
        return ""

def extract_text_from_docx(file_bytes):
    """Extract text content from a DOCX file (bytes)."""
    doc = Document(io.BytesIO(file_bytes))
    paragraphs = [p.text for p in doc.paragraphs if p.text]
    return "\n".join(paragraphs).strip()


def _parse_json_object_from_text(response_text):
    """Try parse a JSON object from model output; return None on failure."""
    if not response_text:
        return None
    try:
        start = response_text.find('{')
        end = response_text.rfind('}') + 1
        if start != -1 and end > start:
            return json.loads(response_text[start:end])
    except Exception:
        return None
    return None

def _gemini_generate_content_resilient(model_name: str, contents, *, want_json: bool = False):
    """
    Gemini SDK sometimes returns 400 INVALID_ARGUMENT depending on model naming ("models/..")
    or JSON mode support. This helper retries a few safe variants before failing.
    """
    if not gemini_client:
        raise RuntimeError("Gemini client not configured")

    tried = []

    def _variants(name: str):
        names = [name]
        if name and not name.startswith("models/"):
            names.append(f"models/{name}")
        # Dedup while preserving order.
        out = []
        for n in names:
            if n and n not in out:
                out.append(n)
        return out

    last_err = None
    for mn in _variants(model_name):
        # 1) Prefer JSON mode when requested.
        if want_json:
            try:
                resp = gemini_client.models.generate_content(
                    model=mn,
                    contents=contents,
                    config=types.GenerateContentConfig(response_mime_type="application/json")
                )
                return resp, mn
            except Exception as e:
                tried.append(f"{mn} (json)")
                last_err = e

        # 2) Fallback: no JSON mode (plain text) for broader compatibility.
        try:
            resp = gemini_client.models.generate_content(
                model=mn,
                contents=contents
            )
            return resp, mn
        except Exception as e:
            tried.append(f"{mn} (text)")
            last_err = e
            continue

    # Include variants for easier debugging in logs.
    raise RuntimeError(f"Gemini generate_content failed after variants={tried}. last_error={last_err}")


def _is_missing_resume_core_fields(parsed_data):
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


def _normalize_parsed_resume_result(ai_result):
    """Map potential alias keys to canonical fields used by frontend."""
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
    skills = ai_result.get('skills') or ai_result.get('skillSet') or ai_result.get('技能') or []

    if isinstance(skills, str):
        skills = [s.strip() for s in re.split(r"[，,、/\n]", skills) if s.strip()]

    def _pick(d, keys, default=''):
        if not isinstance(d, dict):
            return default
        for k in keys:
            v = d.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()
        return default

    def _ensure_list(value):
        if isinstance(value, list):
            return value
        if isinstance(value, dict):
            return [value]
        return []

    def _split_date_range(range_str):
        if not range_str or not isinstance(range_str, str):
            return None, None
        # Split by typical range separators
        # Sort by length descending to catch longer separators first
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

        # Keep year-only granularity when original field had no month.
        m = re.fullmatch(r'(\d{4})[-./年]\s*(0?[1-9]|1[0-2])', normalized)
        if m:
            return m.group(1)
        return normalized

    def _fix_messed_up_dates(start, end):
        # Case: start="2022", end="06-2022-12" (User report)
        if start and end and len(start) == 4 and start.isdigit():
            # If end starts with month and matches the year in second part
            # e.g. "06-2022-12" -> Month "06", Year "2022", Dash, End "12" or "2022-12"
            test_end = end.replace('.', '-').replace('/', '-')
            parts = [p.strip() for p in test_end.split('-') if p.strip()]
            if len(parts) >= 3 and parts[1] == start:
                # Re-assembly: new_start = "2022-06", new_end = "2022-12" or parts[-1]
                new_start = f"{start}-{parts[0]}"
                # If only 3 parts ("06", "2022", "12"), end is likely just the month of the same year or a different year
                if len(parts) == 3:
                     # If the last part is not a year, assume it's a month of the same year
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
        
        # If one is empty, try to split the combined 'date' field
        full_range = _pick(item, ['date', 'time', 'duration', '期间', '时间'])
        if (not start or not end) and full_range:
            s, e = _split_date_range(full_range)
            if s and e:
                start = start or s
                end = end or e
        
        # Final fix for AI extraction glitches
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

    return {
        'personalInfo': {
            'name': _pick(personal, ['name', '姓名']) or '',
            'title': _pick(personal, ['title', 'jobTitle', '求职意向', '职位']) or '',
            'email': _pick(personal, ['email', '邮箱']) or '',
            'phone': _pick(personal, ['phone', 'mobile', '手机号', '电话']) or '',
            'location': _pick(personal, ['location', 'city', '地址', '所在地']) or '',
            'summary': (
                _pick(personal, ['summary', 'profile', 'selfIntro', '自我评价', '个人总结', '个人简介'])
                or (ai_result.get('summary', '') if isinstance(ai_result.get('summary', ''), str) else '')
            )
        },
        'workExps': normalized_work,
        'educations': normalized_edu,
        'projects': normalized_proj,
        'skills': skills if isinstance(skills, list) else []
    }

def _extract_skills_from_resume_text(resume_text):
    """
    Strict extraction: only read skills/certificates from explicit skill-like sections.
    Do not infer skills from work/project descriptions.
    """
    text = (resume_text or '').strip()
    if not text:
        return []

    lines = [ln.strip() for ln in re.split(r'[\r\n]+', text) if ln and ln.strip()]
    collected = []
    cert_collected = []

    # 1) Prefer explicit skill/certificate sections (supports heading-only / heading+content same line).
    skill_heading_inline_re = re.compile(
        r'^(专业技能|核心技能|技能特长|技能标签|技能|掌握技能|IT技能|工具技能)\s*[:：]?\s*(.*)$',
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
    split_items_re = re.compile(r'[，,、;；|/]+|\t+|\s{2,}')
    for ln in lines:
        # OCR often inserts spaces between Chinese characters, e.g. "资 格 证 书".
        compact_ln = re.sub(r'\s+', '', ln)

        skill_m = skill_heading_inline_re.match(ln) or skill_heading_inline_re.match(compact_ln)
        if skill_m:
            in_skill_block = True
            in_cert_block = False
            inline_payload = (skill_m.group(2) or '').strip()
            # If matched on compact text, try to recover payload from original line after first colon.
            if not inline_payload and ('：' in ln or ':' in ln):
                inline_payload = re.split(r'[:：]', ln, maxsplit=1)[1].strip()
            if inline_payload:
                parts = [p.strip() for p in split_items_re.split(inline_payload) if p.strip()]
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
                parts = [p.strip() for p in split_items_re.split(inline_payload) if p.strip()]
                cert_collected.extend(parts)
            continue

        if next_section_re.match(ln):
            in_skill_block = False
            in_cert_block = False
            continue

        if in_skill_block:
            parts = [p.strip() for p in split_items_re.split(ln) if p.strip()]
            collected.extend(parts)
            continue

        if in_cert_block:
            # Keep certificate noun phrases intact; do not split by whitespace.
            parts = [p.strip() for p in split_items_re.split(ln) if p.strip()]
            cert_collected.extend(parts)

    collected.extend(cert_collected)

    # 3) Global certificate scan (safe): even if heading structure is broken by OCR,
    # still allow certificate entities to be extracted into skills.
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

    # Normalize + deduplicate + filter obvious noise
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
        # Keep only strong hard-skill nouns or certificate tokens.
        if not (strong_skill_re.search(v) or cert_re.search(v)):
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

def _fill_skills_if_missing(parsed_data, resume_text):
    # Authoritative source: only explicit skills/certificate sections in original resume.
    # Never infer from work/project text.
    strict_skills = _extract_skills_from_resume_text(resume_text)
    parsed_data['skills'] = strict_skills
    if strict_skills:
        logger.info("Skills extracted from explicit skill/certificate sections, count=%s", len(strict_skills))
    else:
        logger.info("No explicit skill/certificate sections found; skills left empty by design.")
    return parsed_data


def _repair_missing_core_fields_with_ai(resume_text, parsed_data):
    """Second-pass extraction for core fields when first-pass misses key info."""
    if not gemini_client:
        return parsed_data
    if not _is_missing_resume_core_fields(parsed_data):
        return parsed_data

    logger.info("Core fields missing after first parse, running second-pass extraction.")
    repair_prompt = f"""
你是简历字段提取专家。请只做信息提取，不要润色。
从以下简历文本中尽最大可能提取：
1) personalInfo.summary（个人总结/自我评价）
2) workExps[].company 和 workExps[].position（公司名称与职位）
3) educations[].school 和 educations[].major（学校与专业）

要求：
- 仅返回 JSON，不要解释。
- 保留原文信息，不要编造。
- 如果某字段确实没有，返回空字符串。

输出格式：
{{
  "personalInfo": {{"summary": ""}},
  "workExps": [{{"company": "", "position": ""}}],
  "educations": [{{"school": "", "major": ""}}]
}}

简历文本：
---
{resume_text}
---
"""
    try:
        response = gemini_client.models.generate_content(
            model=GEMINI_RESUME_PARSE_MODEL,
            contents=repair_prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json")
        )
        repair_json = _parse_json_object_from_text(response.text) or {}
    except Exception as e:
        logger.warning(f"Second-pass extraction failed: {e}")
        return parsed_data

    personal = parsed_data.get('personalInfo', {}) or {}
    repaired_personal = repair_json.get('personalInfo', {}) or {}
    if not (personal.get('summary') or '').strip():
        personal['summary'] = (repaired_personal.get('summary') or '').strip()
    parsed_data['personalInfo'] = personal

    repaired_work = repair_json.get('workExps', []) or []
    work_exps = parsed_data.get('workExps', []) or []
    if not work_exps and repaired_work:
        parsed_data['workExps'] = repaired_work
    else:
        for i, item in enumerate(work_exps):
            if i >= len(repaired_work):
                break
            if not (item.get('company') or '').strip():
                item['company'] = repaired_work[i].get('company', '')
            if not (item.get('position') or '').strip():
                item['position'] = repaired_work[i].get('position', '')

    repaired_edu = repair_json.get('educations', []) or []
    educations = parsed_data.get('educations', []) or []
    if not educations and repaired_edu:
        parsed_data['educations'] = repaired_edu
    else:
        for i, item in enumerate(educations):
            if i >= len(repaired_edu):
                break
            if not (item.get('school') or '').strip():
                item['school'] = repaired_edu[i].get('school', '')
            if not (item.get('major') or '').strip():
                item['major'] = repaired_edu[i].get('major', '')

    return parsed_data


def _compact_text_for_match(value):
    text = str(value or '').strip().lower()
    if not text:
        return ''
    return re.sub(r'[\s\-–—·•,，.。:：;；/\\|()（）\[\]【】\'"`]+', '', text)


def _filter_unverifiable_entities(parsed_data, resume_text):
    """
    Guard against hallucinated entities from model extraction:
    company/school must be traceable in source resume text.
    """
    source_compact = _compact_text_for_match(resume_text)
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
        compact_company = _compact_text_for_match(company)
        if not compact_company:
            item['company'] = ''
            continue
        if company in blocked_company_tokens:
            item['company'] = ''
            continue
        # Require traceability in source text to prevent invented company names.
        if compact_company not in source_compact:
            item['company'] = ''

    educations = parsed_data.get('educations', []) or []
    for item in educations:
        if not isinstance(item, dict):
            continue
        school = (item.get('school') or '').strip()
        if not school:
            continue
        compact_school = _compact_text_for_match(school)
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

def parse_resume_text_with_ai(resume_text):
    """Parse resume text into structured data via AI."""
    if not resume_text.strip():
        raise ValueError('简历文本为空')

    logger.info(f"Starting resume parsing with AI, text length: {len(resume_text)}")

    if not gemini_client:
        raise ValueError('AI 服务未配置')

    prompt = f"""
    你是一位顶尖的简历解析专家。请分析以下简历文本，并将其转换为精确的结构化 JSON。
    
    **解析准则：**
    1. **语义优先**：理解标题含义。例如，“学业”、“教育经历”、“求学” -> `educations`；“实践”、“履历”、“工作背景”、“项目案例” -> `workExps` 或 `projects`。
    2. **贪婪提取**：无论是否有明确标题，都要尽力识别姓名、电话、邮箱、现居地。
    3. **关键词对标**：确保提取以下核心字段，即使简历中使用了同义词：
       - `company`: 公司全称/机构名称。
       - `position`: 职位/头衔。
       - `school`: 学校全称。
       - `major`: 专业名称。
    4. **个人总结**：查找“自我评价”、“Summary”、“个人简介”等，存入 `personalInfo.summary`。
    5. **日期提取**：严格区分“开始”与“结束”日期。严禁将整个时间范围（如 2022.06-2024.12）塞入单一字段，必须分别提取到 `startDate` 和 `endDate`。
    6. **日期格式**：统一为 YYYY-MM 格式（如 2022-06）。仅年份（如 2022）也可。结束时间若为“至今”或“现在”则写为“至今”。
    7. **技能字段来源约束（强制）**：`skills` 只能来自简历里明确的“技能/专业技能/核心技能/工具技能/证书/资格证书”标题区块；严禁从工作经历、项目经历、个人总结中推断或抽取技能。若无上述区块，`skills` 返回空数组 `[]`。
    8. **纯净输出**：仅返回 JSON 块，不要包含任何 Markdown 语法标记。

    **JSON 结构模板：**
    {{
        "personalInfo": {{
            "name": "",
            "title": "",
            "email": "",
            "phone": "",
            "location": "",
            "age": "",
            "summary": ""
        }},
        "workExps": [
            {{
                "company": "",
                "position": "",
                "startDate": "YYYY-MM",
                "endDate": "YYYY-MM",
                "description": ""
            }}
        ],
        "educations": [
            {{
                "school": "",
                "degree": "本科/硕士/博士/等",
                "major": "",
                "startDate": "YYYY-MM",
                "endDate": "YYYY-MM"
            }}
        ],
        "projects": [
            {{
                "title": "",
                "subtitle": "担任角色",
                "startDate": "YYYY-MM",
                "endDate": "YYYY-MM",
                "description": ""
            }}
        ],
        "skills": []
    }}

    **简历待解析文本内容：**
    ---
    {resume_text}
    ---
    """

    try:
        response = gemini_client.models.generate_content(
            model=GEMINI_RESUME_PARSE_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )
    except Exception as e:
        logger.error(f"AI parse failed: {e}")
        raise RuntimeError('AI parse failed')
    ai_result = _parse_json_object_from_text(response.text)
    if not ai_result:
        raise RuntimeError('AI parse failed')

    parsed_data = _normalize_parsed_resume_result(ai_result)
    parsed_data = _repair_missing_core_fields_with_ai(resume_text, parsed_data)
    parsed_data = _filter_unverifiable_entities(parsed_data, resume_text)
    parsed_data = _fill_skills_if_missing(parsed_data, resume_text)

    logger.info("Resume parsed successfully with AI")
    return parsed_data

