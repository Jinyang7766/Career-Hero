# -*- coding: utf-8 -*-
import concurrent.futures
import io
import re

import fitz
from pypdf import PdfReader


def normalize_extracted_text(text):
    if not text:
        return ""
    return re.sub(r"\s+", " ", text).strip()


def extract_text_via_pypdf(file_bytes, logger_obj=None):
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
        if logger_obj:
            logger_obj.warning(f"pypdf extraction failed: {e}")
    return normalize_extracted_text("\n".join(pages_text))


def extract_text_via_pymupdf(file_bytes, logger_obj=None):
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
        if logger_obj:
            logger_obj.warning(f"PyMuPDF extraction failed: {e}")
    return normalize_extracted_text("\n".join(pages_text))


def extract_text_from_pdf(file_bytes, logger_obj=None):
    text_pypdf = ""
    text_pymupdf = ""
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        fut_pypdf = executor.submit(extract_text_via_pypdf, file_bytes, logger_obj)
        fut_pymupdf = executor.submit(extract_text_via_pymupdf, file_bytes, logger_obj)
        try:
            text_pypdf = fut_pypdf.result(timeout=8)
        except Exception:
            text_pypdf = ""
        try:
            text_pymupdf = fut_pymupdf.result(timeout=8)
        except Exception:
            text_pymupdf = ""

    text = text_pypdf if len(text_pypdf) >= len(text_pymupdf) else text_pymupdf
    if len(text) >= 6:
        return text

    if logger_obj:
        logger_obj.info(
            "PDF extraction result too short (pypdf=%s, pymupdf=%s), switching to OCR.",
            len(text_pypdf),
            len(text_pymupdf),
        )
    return "[EXTERNAL_OCR_REQUIRED]"

