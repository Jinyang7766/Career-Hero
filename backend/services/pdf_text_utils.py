# -*- coding: utf-8 -*-
import re
import unicodedata
from datetime import datetime


def extract_company_name_from_jd(text: str) -> str:
    if not text:
        return ''

    invalid_keywords = [
        '职位', '岗位', '要求', '职责', '描述', '薪资', '地点', '福利',
        '任职', '优先', '加分', '简历', '投递', '招聘', '急聘', '高薪',
        '职责描述', '岗位职责', '任职要求', '工作地点', '职位描述', '岗位说明'
    ]

    def _normalize_candidate(raw: str) -> str:
        return (
            str(raw or '')
            .strip()
            .split('|')[0]
            .replace('｜', '|')
            .split('|')[0]
            .strip()
        )

    def _is_valid(name: str) -> bool:
        n = _normalize_candidate(name)
        if len(n) < 2 or len(n) > 60:
            return False
        if re.match(r'^(?:[一二三四五六七八九十]|\d+)[、.\s]', n):
            return False
        return not any(k in n for k in invalid_keywords)

    text = text.strip()
    lines = [ln.strip() for ln in text.split('\n') if ln.strip()]

    labeled_patterns = [
        r'(?:公司|企业|Employer|Company)\s*[:：\s-]*([^\n]+)',
        r'招聘单位\s*[:：\s-]*([^\n]+)',
    ]
    for pattern in labeled_patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match and match.group(1):
            candidate = _normalize_candidate(match.group(1))
            if _is_valid(candidate):
                return candidate

    company_suffix = re.compile(
        r'(?:公司|集团|有限公司|有限责任公司|工作室|研究院|事务所|科技|网络|技术|咨询|银行|证券|基金|保险|'
        r'Inc\.?|Ltd\.?|LLC|Co\.?|Corporation|Group)$',
        re.IGNORECASE,
    )
    for line in lines[:6]:
        candidate = _normalize_candidate(line)
        if company_suffix.search(candidate) and _is_valid(candidate):
            return candidate

    return ''


def sanitize_filename_part(text: str) -> str:
    if not text:
        return ''
    text = re.sub(r'[\\/:*?"<>|]+', '', str(text))
    text = re.sub(r'\s+', ' ', text).strip()
    return text[:30]


def build_pdf_filename(name: str, direction: str, company: str) -> str:
    safe_name = sanitize_filename_part(name)
    safe_direction = sanitize_filename_part(direction)
    safe_company = sanitize_filename_part(company)
    parts = [p for p in [safe_direction, safe_company, safe_name] if p]
    if not parts:
        parts = ['简历']
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    return f"{'_'.join(parts)}_{timestamp}.pdf"


def clean_text_for_pdf(text):
    if not text:
        return ""

    text = str(text)
    replacements = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '‘': '&#39;',
        '’': '&#39;',
        '“': '&quot;',
        '”': '&quot;',
        '–': '-',
        '—': '--',
        '…': '...',
        '•': '·',
        '▪': '·',
        '◦': '·',
        '●': '·',
    }

    text = unicodedata.normalize('NFKC', text)
    for old, new in replacements.items():
        text = text.replace(old, new)

    def _is_bad_char(ch: str) -> bool:
        cp = ord(ch)
        if ch in '\n\r\t':
            return False
        if cp < 32 or (0x7F <= cp <= 0x9F):
            return True
        if cp in (0xFFFD, 0x200B, 0x200C, 0x200D, 0x2060, 0xFEFF, 0x00A0, 0x1680, 0x180E, 0x202F, 0x205F, 0x3000):
            return True
        if 0xFE00 <= cp <= 0xFE0F or 0xE0100 <= cp <= 0xE01EF:
            return True
        cat = unicodedata.category(ch)
        if cat in ('Co', 'Cs', 'Cn', 'Cf'):
            return True
        if cp > 127 and cat in ('So', 'Sk', 'Sm'):
            return True
        return False

    text = ''.join((' ' if (unicodedata.category(ch) == 'Zs' and ch not in '\n\r\t') else ch) for ch in text)
    text = ''.join(char for char in text if not _is_bad_char(char))
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r' *\n *', '\n', text)
    return text.strip()

