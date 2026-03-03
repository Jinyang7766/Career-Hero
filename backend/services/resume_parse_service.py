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
from .resume_text_extractors import extract_text_from_pdf as extract_text_from_pdf_core
from .resume_text_extractors import extract_text_via_pymupdf as extract_text_via_pymupdf_core
from .resume_text_extractors import extract_text_via_pypdf as extract_text_via_pypdf_core
from .resume_text_extractors import normalize_extracted_text as normalize_extracted_text_core
from .resume_parse_postprocess import (
    parse_json_object_from_text as parse_json_object_from_text_core,
    normalize_parsed_resume_result as normalize_parsed_resume_result_core,
    is_missing_resume_core_fields as is_missing_resume_core_fields_core,
    fill_skills_if_missing as fill_skills_if_missing_core,
    fill_profile_meta_if_missing as fill_profile_meta_if_missing_core,
    compact_text_for_match as compact_text_for_match_core,
    filter_unverifiable_entities as filter_unverifiable_entities_core,
)

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
    return normalize_extracted_text_core(text)

def _env_flag(name: str, default: bool) -> bool:
    raw = str(os.getenv(name, '1' if default else '0')).strip().lower()
    return raw in ('1', 'true', 'yes', 'on')


def _generate_content_with_timeout(model_name: str, contents, *, timeout_seconds: int = 18, want_json: bool = True):
    timeout_seconds = max(5, int(timeout_seconds or 18))

    def _call():
        if want_json:
            return gemini_client.models.generate_content(
                model=model_name,
                contents=contents,
                config=types.GenerateContentConfig(response_mime_type="application/json")
            )
        return gemini_client.models.generate_content(
            model=model_name,
            contents=contents
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(_call)
        return future.result(timeout=timeout_seconds)


def extract_text_from_pdf(file_bytes):
    return extract_text_from_pdf_core(file_bytes, logger_obj=logger)


# Backward-compatible aliases used by app_monolith imports.
def _extract_text_via_pymupdf(file_bytes):
    return extract_text_via_pymupdf_core(file_bytes, logger_obj=logger)


def _extract_text_via_pypdf(file_bytes):
    return extract_text_via_pypdf_core(file_bytes, logger_obj=logger)

def extract_text_multimodal(file_bytes):
    """Use Gemini Vision to extract text from PDF pages converted to images."""
    try:
        logger.info("Starting multimodal resume parsing...")
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        images = []
        
        # 默认只取前 3 页，显著降低 OCR 延迟；可通过环境变量调整。
        try:
            ocr_max_pages = max(1, int(os.getenv('OCR_MAX_PAGES', '3')))
        except Exception:
            ocr_max_pages = 3
        max_pages = min(len(doc), ocr_max_pages)
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
            ocr_call_timeout_seconds = max(5, int(os.getenv('OCR_CALL_TIMEOUT_SECONDS', '12')))
        except Exception:
            ocr_call_timeout_seconds = 12

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

            # Fallback: page-by-page OCR (more robust but slower). Disabled by default for speed.
            if not _env_flag('OCR_PER_PAGE_FALLBACK_ENABLED', False):
                continue
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
    return parse_json_object_from_text_core(response_text)

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
    return is_missing_resume_core_fields_core(parsed_data)

def _normalize_parsed_resume_result(ai_result):
    return normalize_parsed_resume_result_core(ai_result)

def _fill_skills_if_missing(parsed_data, resume_text):
    return fill_skills_if_missing_core(parsed_data, resume_text, logger_obj=logger)


def _fill_profile_meta_if_missing(parsed_data, resume_text):
    return fill_profile_meta_if_missing_core(parsed_data, resume_text, logger_obj=logger)

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
    return compact_text_for_match_core(value)

def _filter_unverifiable_entities(parsed_data, resume_text):
    return filter_unverifiable_entities_core(parsed_data, resume_text)

def parse_resume_text_with_ai(resume_text):
    """Parse resume text into structured data via AI."""
    if not resume_text.strip():
        raise ValueError('简历文本为空')

    logger.info(f"Starting resume parsing with AI, text length: {len(resume_text)}")

    if not gemini_client:
        raise ValueError('AI 服务未配置')

    fast_prompt = f"""
    你是简历解析器。请把下面简历文本提取为 JSON，只返回 JSON，不要解释。
    字段缺失时返回空字符串或空数组，不要编造。

    输出结构：
    {{
      "personalInfo": {{
        "name": "",
        "title": "",
        "email": "",
        "phone": "",
        "location": "",
        "linkedin": "",
        "website": "",
        "age": "",
        "summary": ""
      }},
      "gender": "",
      "workExps": [{{"company":"", "position":"", "startDate":"", "endDate":"", "description":""}}],
      "educations": [{{"school":"", "degree":"", "major":"", "startDate":"", "endDate":""}}],
      "projects": [{{"title":"", "subtitle":"", "startDate":"", "endDate":"", "description":""}}],
      "skills": []
    }}

    简历文本：
    ---
    {resume_text}
    ---
    """

    full_prompt = f"""
    你是一位顶尖的简历解析专家。请分析以下简历文本，并将其转换为精确的结构化 JSON。
    
    **解析准则：**
    1. **语义优先**：理解标题含义。例如，“学业”、“教育经历”、“求学” -> `educations`；“实践”、“履历”、“工作背景”、“项目案例” -> `workExps` 或 `projects`。
    2. **贪婪提取**：无论是否有明确标题，都要尽力识别姓名、电话、邮箱、现居地、LinkedIn、个人网站。
    2.1 **性别与年龄**：尽力提取性别与年龄；`gender` 允许输出 `male/female` 或 `男/女`（后处理会统一），年龄写到 `personalInfo.age`。
    3. **关键词对标**：确保提取以下核心字段，即使简历中使用了同义词：
       - `company`: 公司全称/机构名称。
       - `position`: 职位/头衔。
       - `school`: 学校全称。
       - `major`: 专业名称。
    4. **个人总结**：查找“自我评价”、“Summary”、“个人简介”等，存入 `personalInfo.summary`。
    5. **日期提取**：严格区分“开始”与“结束”日期。严禁将整个时间范围（如 2022.06-2024.12）塞入单一字段，必须分别提取到 `startDate` 和 `endDate`。
    6. **日期格式**：统一为 YYYY-MM 格式（如 2022-06）。仅年份（如 2022）也可。结束时间若为“至今”或“现在”则写为“至今”。
    7. **技能字段来源约束（强制）**：`skills` 优先来自简历里明确的“技能/专业技能/核心技能/工具技能/证书/资格证书”标题区块；若无上述区块，可从工作经历/项目经历中出现的明确技术名词、工具名、框架名、证书名中提取。禁止凭空推断或生成未出现过的技能。
    8. **纯净输出**：仅返回 JSON 块，不要包含任何 Markdown 语法标记。

    **JSON 结构模板：**
    {{
        "personalInfo": {{
            "name": "",
            "title": "",
            "email": "",
            "phone": "",
            "location": "",
            "linkedin": "",
            "website": "",
            "age": "",
            "summary": ""
        }},
        "gender": "",
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
        fast_mode = _env_flag('RESUME_PARSE_FAST_PROMPT_ENABLED', True)
        ai_timeout_seconds = max(8, int(os.getenv('RESUME_PARSE_AI_TIMEOUT_SECONDS', '18')))
        response = None

        if fast_mode:
            try:
                response = _generate_content_with_timeout(
                    GEMINI_RESUME_PARSE_MODEL,
                    fast_prompt,
                    timeout_seconds=ai_timeout_seconds,
                    want_json=True,
                )
            except Exception as fast_err:
                logger.warning("Fast parse prompt failed, fallback to full prompt: %s", fast_err)

        if response is None:
            fallback_timeout = max(ai_timeout_seconds, int(os.getenv('RESUME_PARSE_AI_FALLBACK_TIMEOUT_SECONDS', '28')))
            response = _generate_content_with_timeout(
                GEMINI_RESUME_PARSE_MODEL,
                full_prompt,
                timeout_seconds=fallback_timeout,
                want_json=True,
            )
    except Exception as e:
        logger.error(f"AI parse failed: {e}")
        raise RuntimeError('AI parse failed')
    ai_result = _parse_json_object_from_text(response.text)
    if not ai_result:
        raise RuntimeError('AI parse failed')

    parsed_data = _normalize_parsed_resume_result(ai_result)
    if _env_flag('RESUME_PARSE_SECOND_PASS_ENABLED', False):
        parsed_data = _repair_missing_core_fields_with_ai(resume_text, parsed_data)
    parsed_data = _filter_unverifiable_entities(parsed_data, resume_text)
    parsed_data = _fill_skills_if_missing(parsed_data, resume_text)
    parsed_data = _fill_profile_meta_if_missing(parsed_data, resume_text)

    logger.info("Resume parsed successfully with AI")
    return parsed_data



