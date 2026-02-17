# -*- coding: utf-8 -*-
import base64
import ipaddress
import os
import re
import socket
import unicodedata
from datetime import datetime
from urllib.parse import urlparse

import requests
from jinja2 import Environment, BaseLoader
from markupsafe import Markup
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase.ttfonts import TTFont

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

def build_pdf_filename(name: str, direction: str, company: str) -> str:
    safe_name = sanitize_filename_part(name)
    safe_direction = sanitize_filename_part(direction)
    safe_company = sanitize_filename_part(company)
    parts = [p for p in [safe_direction, safe_company, safe_name] if p]
    if not parts:
        parts = ['简历']
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    return f"{'_'.join(parts)}_{timestamp}.pdf"

def sanitize_filename_part(text: str) -> str:
    if not text:
        return ''
    text = re.sub(r'[\\/:*?"<>|]+', '', str(text))
    text = re.sub(r'\s+', ' ', text).strip()
    return text[:30]

def clean_text_for_pdf(text):
    """Clean text and escape special characters for PDF rendering."""
    if not text:
        return ""

    # Convert to string to avoid type errors
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

    # Unicode normalization first to reduce compatibility noise.
    text = unicodedata.normalize('NFKC', text)

    for old, new in replacements.items():
        text = text.replace(old, new)

    def _is_bad_char(ch: str) -> bool:
        cp = ord(ch)
        # Keep basic whitespace controls used in formatting.
        if ch in '\n\r\t':
            return False
        # Remove C0/C1 controls.
        if cp < 32 or (0x7F <= cp <= 0x9F):
            return True
        # Remove replacement char and common zero-width / BOM.
        if cp in (
            0xFFFD, 0x200B, 0x200C, 0x200D, 0x2060, 0xFEFF,  # zero-width / replacement
            0x00A0, 0x1680, 0x180E, 0x202F, 0x205F, 0x3000    # NBSP and special spaces
        ):
            return True
        # Remove variation selectors.
        if 0xFE00 <= cp <= 0xFE0F or 0xE0100 <= cp <= 0xE01EF:
            return True
        # Remove private-use, surrogate, unassigned/format categories.
        cat = unicodedata.category(ch)
        if cat in ('Co', 'Cs', 'Cn', 'Cf'):
            return True
        # Drop non-ASCII symbols that often render as tofu in PDF fonts.
        if cp > 127 and cat in ('So', 'Sk', 'Sm'):
            return True
        return False

    # Normalize all unicode spaces to regular spaces before filtering.
    text = ''.join(
        (' ' if (unicodedata.category(ch) == 'Zs' and ch not in '\n\r\t') else ch)
        for ch in text
    )
    text = ''.join(char for char in text if not _is_bad_char(char))
    # Collapse duplicated spaces but keep line breaks.
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r' *\n *', '\n', text)
    text = text.strip()

    return text


_PDF_FONT_FAMILY_CACHE = None
_PDF_FONT_URL_CACHE = None
_PDF_FONT_BYTES_CACHE = None
_PDF_FONT_VIRTUAL_URL = "https://pdf.local/__pdf_font__.ttf"


def resolve_pdf_font_path() -> str:
    """Resolve a usable local font path for PDF rendering."""
    env_path = (os.getenv("PDF_FONT_PATH", "") or "").strip()
    candidates = []

    if env_path:
        if os.path.isabs(env_path):
            candidates.append(env_path)
        else:
            candidates.append(os.path.abspath(env_path))
            candidates.append(os.path.abspath(os.path.join(os.path.dirname(__file__), env_path)))

    base_dir = os.path.dirname(__file__)
    # Strongly prefer project-shipped font.ttf to keep rendering deterministic.
    candidates = [os.path.join(base_dir, "font.ttf")] + candidates + [
        os.path.abspath(os.path.join(base_dir, "..", "ai-resume-builder", "public", "font.ttf")),
        os.path.abspath(os.path.join(base_dir, "..", "ai-resume-builder", "dist", "font.ttf")),
    ]

    seen = set()
    for path in candidates:
        if not path:
            continue
        norm = os.path.normpath(path)
        if norm in seen:
            continue
        seen.add(norm)
        if os.path.exists(norm):
            return norm
    return ""


def get_pdf_font_family() -> str:
    """Return a font family name that can render CJK text in PDFs."""
    global _PDF_FONT_FAMILY_CACHE
    if _PDF_FONT_FAMILY_CACHE:
        return _PDF_FONT_FAMILY_CACHE

    # 1) Prefer user-provided font file for maximum compatibility
    font_path = resolve_pdf_font_path()
    if font_path:
        font_name = "CustomPDF"
        try:
            pdfmetrics.registerFont(TTFont(font_name, font_path))
            _PDF_FONT_FAMILY_CACHE = font_name
            return _PDF_FONT_FAMILY_CACHE
        except Exception as exc:
            logger.warning(f"Failed to register PDF font from {font_path}: {exc}")

    # 2) Fallback to built-in CID font for Chinese (ReportLab)
    try:
        pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
        _PDF_FONT_FAMILY_CACHE = 'STSong-Light'
        return _PDF_FONT_FAMILY_CACHE
    except Exception as exc:
        logger.warning(f"Failed to register CID font STSong-Light: {exc}")

    # 3) Last resort: standard PDF font (may not render CJK)
    _PDF_FONT_FAMILY_CACHE = 'Helvetica'
    return _PDF_FONT_FAMILY_CACHE


def get_pdf_font_url() -> str:
    """Return a stable virtual URL for HTML-to-PDF font loading."""
    global _PDF_FONT_URL_CACHE
    if _PDF_FONT_URL_CACHE:
        return _PDF_FONT_URL_CACHE

    font_path = resolve_pdf_font_path()
    if not font_path:
        return ""
    _PDF_FONT_URL_CACHE = _PDF_FONT_VIRTUAL_URL
    return _PDF_FONT_URL_CACHE


def get_pdf_font_bytes() -> bytes:
    """Load PDF font bytes once for Playwright route fulfillment."""
    global _PDF_FONT_BYTES_CACHE
    if _PDF_FONT_BYTES_CACHE is not None:
        return _PDF_FONT_BYTES_CACHE

    font_path = resolve_pdf_font_path()
    if not font_path:
        _PDF_FONT_BYTES_CACHE = b""
        return _PDF_FONT_BYTES_CACHE
    try:
        with open(font_path, "rb") as f:
            _PDF_FONT_BYTES_CACHE = f.read()
    except Exception as exc:
        logger.warning(f"Failed to read PDF font bytes from {font_path}: {exc}")
        _PDF_FONT_BYTES_CACHE = b""
    return _PDF_FONT_BYTES_CACHE

def inject_font_css_into_html(html_content: str) -> str:
    if not html_content:
        return html_content

    # Always refresh PDF font style to avoid stale cached css from frontend-provided htmlContent.
    html_content = re.sub(
        r'<style[^>]*data-pdf-font[^>]*>.*?</style>',
        '',
        html_content,
        flags=re.IGNORECASE | re.DOTALL
    )

    font_url = get_pdf_font_url()
    if not font_url:
        return html_content

    font_name = "CustomPDF"
    font_css = f"""
    <style data-pdf-font="1">
      @font-face {{
        font-family: '{font_name}';
        src: url('{font_url}');
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }}
      @font-face {{
        font-family: '{font_name}';
        src: url('{font_url}');
        font-weight: bold;
        font-style: normal;
        font-display: swap;
      }}
      html, body, #resume-root, #resume-root * {{
        font-family: '{font_name}', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', 'SimHei', 'WenQuanYi Micro Hei', 'Helvetica Neue', Arial, sans-serif;
        font-synthesis: none;
      }}
      #resume-root * {{
        font-family: '{font_name}', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', 'SimHei', 'WenQuanYi Micro Hei', 'Helvetica Neue', Arial, sans-serif !important;
      }}
    </style>
    """

    if '</head>' in html_content:
        return html_content.replace('</head>', f'{font_css}</head>', 1)
    if '<body' in html_content:
        return html_content.replace('<body', f'{font_css}<body', 1)
    return f'{font_css}{html_content}'

def is_safe_external_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ('http', 'https'):
            return False
        host = parsed.hostname
        if not host:
            return False
        # Block localhost and internal hostnames
        if host in ('localhost', '127.0.0.1', '::1'):
            return False
        # Resolve hostname and block private/loopback/link-local/reserved
        try:
            ip = ipaddress.ip_address(host)
            ips = [ip]
        except ValueError:
            try:
                infos = socket.getaddrinfo(host, None)
                ips = [ipaddress.ip_address(info[4][0]) for info in infos]
            except Exception:
                return False
        for ip in ips:
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                return False
        return True
    except Exception:
        return False

def normalize_avatar_data(avatar_url: str) -> str:
    if not avatar_url:
        return ''
    avatar_url = str(avatar_url).strip()
    if avatar_url.startswith('data:image/'):
        return avatar_url
    if avatar_url.startswith('http://') or avatar_url.startswith('https://'):
        if not is_safe_external_url(avatar_url):
            return ''
        try:
            resp = requests.get(
                avatar_url,
                timeout=3,
                stream=True,
                allow_redirects=False,
                headers={'User-Agent': 'CareerHeroPDF/1.0'}
            )
            if resp.status_code != 200:
                return ''
            content_type = (resp.headers.get('Content-Type') or 'image/png').split(';')[0].strip().lower()
            if not content_type.startswith('image/'):
                return ''
            data = resp.content[: 2 * 1024 * 1024]
            if not data:
                return ''
            encoded = base64.b64encode(data).decode('utf-8')
            return f"data:{content_type};base64,{encoded}"
        except Exception:
            return ''
    return ''

def format_multiline(text: str) -> Markup:
    safe_text = clean_text_for_pdf(text or '')
    return Markup(safe_text.replace('\n', '<br/>'))

def normalize_date_range(start_date: str, end_date: str) -> str:
    start = clean_text_for_pdf(start_date or '').strip()
    end = clean_text_for_pdf(end_date or '').strip()
    if start and end:
        return f"{start} - {end}"
    return start or end


def build_resume_context(resume_data):
    personal_info = resume_data.get('personalInfo', {}) or {}
    name = clean_text_for_pdf(personal_info.get('name', '') or '未填写姓名')
    # Robust title extraction
    title_raw = (
        personal_info.get('title') or 
        personal_info.get('position') or 
        personal_info.get('jobTitle') or 
        personal_info.get('job_title') or
        resume_data.get('title') # Root fallback
    )
    title = clean_text_for_pdf(title_raw or '求职意向')
    email = clean_text_for_pdf(personal_info.get('email', '') or 'email@example.com')
    phone = clean_text_for_pdf(personal_info.get('phone', '') or '+86 138 0000 0000')
    location = clean_text_for_pdf(personal_info.get('location', '') or '')
    avatar = normalize_avatar_data(personal_info.get('avatar', '') or '')
    avatar_initial = (name[:1] if name else '您')

    summary_text = resume_data.get('summary') or personal_info.get('summary') or ''
    summary = format_multiline(summary_text) if summary_text else ''

    work_exps = []
    for exp in resume_data.get('workExps', []) or []:
        # Robust title (Company)
        title_text = exp.get('company') or exp.get('title') or exp.get('school') or '未填写单位'
        # Robust subtitle (Job Title / Position)
        raw_subtitle = exp.get('position') or exp.get('jobTitle') or exp.get('subtitle') or '职位'
        
        # Clean subtitle: Take only the front part if it looks like a composite title
        subtitle_text = raw_subtitle
        if ' | ' in raw_subtitle or ' · ' in raw_subtitle:
             subtitle_text = raw_subtitle.split(' ')[0] # Basic split for distinctive separators
        elif ' ' in raw_subtitle:
             segments = raw_subtitle.split()
             if len(segments) > 1 and len(segments[0]) >= 2:
                 subtitle_text = segments[0]
        
        # Prefer start/end because editor updates these fields; `date` may be stale.
        date_text = normalize_date_range(exp.get('startDate', ''), exp.get('endDate', '')) or exp.get('date') or '时间不详'
        work_exps.append({
            'title': clean_text_for_pdf(title_text),
            'subtitle': clean_text_for_pdf(subtitle_text),
            'date': clean_text_for_pdf(date_text),
            'description': format_multiline(exp.get('description') or '未填写描述')
        })

    educations = []
    for edu in resume_data.get('educations', []) or []:
        title_text = edu.get('school') or edu.get('title') or '未填写学校'
        
        # Combine degree and major (avoid duplication)
        deg = (edu.get('degree') or '').strip()
        maj = (edu.get('major') or '').strip()
        sub = (edu.get('subtitle') or '').strip()
        
        if deg and maj:
            if deg == maj:
                subtitle_text = deg
            else:
                subtitle_text = f"{deg} · {maj}"
        else:
            subtitle_text = deg or maj or sub or '未说明'
            
        date_text = normalize_date_range(edu.get('startDate', ''), edu.get('endDate', '')) or edu.get('date') or '时间不详'
        educations.append({
            'title': clean_text_for_pdf(title_text),
            'subtitle': clean_text_for_pdf(subtitle_text),
            'date': clean_text_for_pdf(date_text)
        })

    projects = []
    for proj in resume_data.get('projects', []) or []:
        title_text = proj.get('title') or '未填写项目名称'
        subtitle_text = proj.get('role') or proj.get('subtitle') or '项目角色'
        date_text = normalize_date_range(proj.get('startDate', ''), proj.get('endDate', '')) or proj.get('date') or '时间不详'
        projects.append({
            'title': clean_text_for_pdf(title_text),
            'subtitle': clean_text_for_pdf(subtitle_text),
            'date': clean_text_for_pdf(date_text),
            'description': format_multiline(proj.get('description') or '未填写项目描述')
        })

    skills = [clean_text_for_pdf(skill) for skill in (resume_data.get('skills', []) or []) if skill]

    # Estimate content length to decide layout density
    def estimate_content_length() -> int:
        parts = []
        parts.append(summary_text or '')
        for exp in resume_data.get('workExps', []) or []:
            parts.extend([
                exp.get('title') or '',
                exp.get('subtitle') or exp.get('position') or '',
                exp.get('description') or ''
            ])
        for edu in resume_data.get('educations', []) or []:
            parts.extend([
                edu.get('title') or edu.get('school') or '',
                edu.get('subtitle') or edu.get('degree') or edu.get('major') or ''
            ])
        for proj in resume_data.get('projects', []) or []:
            parts.extend([
                proj.get('title') or '',
                proj.get('subtitle') or proj.get('role') or '',
                proj.get('description') or ''
            ])
        parts.extend(resume_data.get('skills', []) or [])
        return sum(len(str(p)) for p in parts if p)

    content_len = estimate_content_length()
    # Compact for typical one-page content, normal for very long resumes
    if content_len <= 2600:
        layout = {
            'page_margin': '0.9cm 1.2cm',
            'body_font_size': '9pt',
            'body_line_height': '1.35',
            'section_gap': '8px',
            'item_gap': '5px'
        }
    else:
        layout = {
            'page_margin': '1.2cm 1.5cm',
            'body_font_size': '10pt',
            'body_line_height': '1.45',
            'section_gap': '10px',
            'item_gap': '6px'
        }

    return {
        'name': name,
        'title': title,
        'email': email,
        'phone': phone,
        'location': location,
        'avatar': avatar,
        'avatar_initial': avatar_initial,
        'summary': summary,
        'work_exps': work_exps,
        'educations': educations,
        'projects': projects,
        'skills': skills,
        'template_id': (resume_data.get('templateId') or 'modern').lower(),
        'layout': layout,
        'gender': resume_data.get('gender') or '',
        'age': personal_info.get('age') or '',
    }

def generate_resume_html(resume_data):
    """Generate preview-like HTML for backend PDF export."""
    context = build_resume_context(resume_data)
    context['pdf_font_family'] = get_pdf_font_family()
    context['pdf_font_url'] = get_pdf_font_url()

    template_id = (context.get('template_id') or 'modern').lower()
    if template_id not in ('modern', 'classic', 'minimal'):
        template_id = 'modern'
    context['template_id'] = template_id

    themes = {
        'modern': {
            'accent': '#1e40af',
            'section_border': '#dbeafe',
            'name_size': '18pt',
            'title_size': '12pt',
            'title_color': '#4b5563',
            'header_border': '#e5e7eb',
            'header_align': 'left',
            'avatar_size': '96px',
            'avatar_radius': '8px',
            'section_bg': 'transparent',
            'skill_sep': ' · ',
        },
        'classic': {
            'accent': '#111827',
            'section_border': '#111827',
            'name_size': '22pt',
            'title_size': '12pt',
            'title_color': '#374151',
            'header_border': '#111827',
            'header_align': 'center',
            'avatar_size': '92px',
            'avatar_radius': '9999px',
            'section_bg': '#f3f4f6',
            'skill_sep': ' | ',
        },
        'minimal': {
            'accent': '#111827',
            'section_border': '#d1d5db',
            'name_size': '24pt',
            'title_size': '12pt',
            'title_color': '#6b7280',
            'header_border': '#e5e7eb',
            'header_align': 'left',
            'avatar_size': '84px',
            'avatar_radius': '9999px',
            'section_bg': 'transparent',
            'skill_sep': ' · ',
        },
    }
    context['theme'] = themes[template_id]

    template_html = """
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>{{ name }} - 简历</title>
  <style>
    {% if pdf_font_url %}
    @font-face {
      font-family: 'CustomPDF';
      src: url('{{ pdf_font_url }}');
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'CustomPDF';
      src: url('{{ pdf_font_url }}');
      font-weight: bold;
      font-style: normal;
      font-display: swap;
    }
    {% endif %}
    @page {
      size: A4;
      margin: {{ layout.page_margin }};
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: {% if pdf_font_url %}'CustomPDF',{% endif %} '{{ pdf_font_family }}', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', 'SimHei', Arial, sans-serif;
      font-size: {{ layout.body_font_size }};
      line-height: {{ layout.body_line_height }};
      color: #1f2937;
      font-synthesis: none;
      word-break: normal;
      overflow-wrap: anywhere;
      word-wrap: break-word;
    }
    .resume {
      width: 100%;
    }
    .header {
      width: 100%;
      border-bottom: 1px solid {{ theme.header_border }};
      padding-bottom: 10px;
      margin-bottom: 14px;
      {% if template_id == 'classic' %}
      text-align: center;
      {% endif %}
    }
    .header-row {
      width: 100%;
      border-collapse: collapse;
    }
    .header-row td {
      vertical-align: top;
      padding: 0;
    }
    .avatar {
      width: {{ theme.avatar_size }};
      height: {{ theme.avatar_size if template_id != 'modern' else '120px' }};
      border-radius: {{ theme.avatar_radius }};
      object-fit: cover;
      display: block;
    }
    .avatar-placeholder {
      width: {{ theme.avatar_size }};
      height: {{ theme.avatar_size if template_id != 'modern' else '120px' }};
      border-radius: {{ theme.avatar_radius }};
      background: #cbd5e1;
      border: 1px solid #b6c1d2;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .avatar-placeholder svg {
      width: 56%;
      height: 56%;
      fill: #8ea0b8;
    }
    .name {
      margin: 0 0 4px 0;
      font-size: {{ theme.name_size }};
      font-weight: 800;
      font-synthesis: weight;
      text-shadow: 0 0 0 currentColor, 0.35px 0 0 currentColor;
      color: #0f172a;
      letter-spacing: 0.2px;
    }
    .job-title {
      margin: 0 0 6px 0;
      font-size: {{ theme.title_size }};
      color: {{ theme.title_color }};
      {% if template_id == 'classic' %}
      font-style: italic;
      {% endif %}
    }
    .meta {
      font-size: 10pt;
      color: #6b7280;
      white-space: normal;
    }
    .meta span {
      display: inline;
    }
    .meta .sep {
      margin: 0 6px;
      color: #9ca3af;
    }
    .section {
      margin-bottom: {{ layout.section_gap }};
    }
    .section-title {
      font-size: 12pt;
      font-weight: 800;
      font-synthesis: weight;
      text-shadow: 0 0 0 currentColor, 0.3px 0 0 currentColor;
      color: {{ theme.accent }};
      border-bottom: 1px solid {{ theme.section_border }};
      padding-bottom: 3px;
      margin-bottom: 6px;
      {% if theme.section_bg != 'transparent' %}
      background: {{ theme.section_bg }};
      padding-left: 6px;
      {% endif %}
    }
    .item {
      margin-bottom: {{ layout.item_gap }};
    }
    .item-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
    }
    .item-title {
      font-size: 11pt;
      font-weight: 700;
      font-synthesis: weight;
      text-shadow: 0 0 0 currentColor, 0.25px 0 0 currentColor;
      color: #111827;
      min-width: 0;
    }
    .item-date {
      font-size: 10pt;
      color: #64748b;
      white-space: nowrap;
      flex: 0 0 auto;
      text-align: right;
    }
    .item-subtitle {
      margin-top: 2px;
      font-size: 10pt;
      color: #334155;
      {% if template_id == 'classic' %}
      font-style: italic;
      {% endif %}
    }
    .item-desc {
      margin-top: 2px;
      font-size: 10pt;
      color: #334155;
      white-space: normal;
    }
    .skills-line {
      font-size: 10pt;
      color: #1f2937;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="resume">
    <div class="header">
      {% if template_id == 'classic' %}
      <div style="display:inline-block; margin-bottom:6px;">
        {% if avatar %}
          <img class="avatar" src="{{ avatar }}" alt="avatar" />
        {% else %}
          <div class="avatar-placeholder">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"></path></svg>
          </div>
        {% endif %}
      </div>
      <div class="name">{{ name }}</div>
      <div class="job-title">{{ title }}</div>
      {% else %}
      <table class="header-row" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="{{ 120 if template_id == 'modern' else 102 }}">
            {% if avatar %}
              <img class="avatar" src="{{ avatar }}" alt="avatar" />
            {% else %}
              <div class="avatar-placeholder">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"></path></svg>
              </div>
            {% endif %}
          </td>
          <td>
            <div class="name">{{ name }}</div>
            <div class="job-title">{{ title }}</div>
      {% endif %}
            <div class="meta">
              {% if gender or age %}
                <span>{% if gender == 'male' %}男{% elif gender == 'female' %}女{% endif %}{% if gender and age %} · {% endif %}{% if age %}{{ age }}岁{% endif %}</span>
                <span class="sep">•</span>
              {% endif %}
              <span>{{ email }}</span>
              <span class="sep">•</span>
              <span>{{ phone }}</span>
            </div>
      {% if template_id != 'classic' %}
          </td>
        </tr>
      </table>
      {% endif %}
    </div>

    {% if summary %}
    <div class="section">
      <div class="section-title">个人简介</div>
      <div class="item-desc">{{ summary }}</div>
    </div>
    {% endif %}

    {% if work_exps %}
    <div class="section">
      <div class="section-title">工作经历</div>
      {% for exp in work_exps %}
      <div class="item">
        <div class="item-header">
          <div class="item-title">{{ exp.title }}</div>
          <div class="item-date">{{ exp.date }}</div>
        </div>
        {% if exp.subtitle %}<div class="item-subtitle">{{ exp.subtitle }}</div>{% endif %}
        {% if exp.description %}<div class="item-desc">{{ exp.description }}</div>{% endif %}
      </div>
      {% endfor %}
    </div>
    {% endif %}

    {% if educations %}
    <div class="section">
      <div class="section-title">教育背景</div>
      {% for edu in educations %}
      <div class="item">
        <div class="item-header">
          <div class="item-title">{{ edu.title }}</div>
          <div class="item-date">{{ edu.date }}</div>
        </div>
        {% if edu.subtitle %}<div class="item-subtitle">{{ edu.subtitle }}</div>{% endif %}
      </div>
      {% endfor %}
    </div>
    {% endif %}

    {% if projects %}
    <div class="section">
      <div class="section-title">项目经历</div>
      {% for proj in projects %}
      <div class="item">
        <div class="item-header">
          <div class="item-title">{{ proj.title }}</div>
          <div class="item-date">{{ proj.date }}</div>
        </div>
        {% if proj.subtitle %}<div class="item-subtitle">{{ proj.subtitle }}</div>{% endif %}
        {% if proj.description %}<div class="item-desc">{{ proj.description }}</div>{% endif %}
      </div>
      {% endfor %}
    </div>
    {% endif %}

    {% if skills %}
    <div class="section">
      <div class="section-title">技能</div>
      <div class="skills-line">{{ skills | join(theme.skill_sep) }}</div>
    </div>
    {% endif %}
  </div>
</body>
</html>
    """

    env = Environment(loader=BaseLoader(), autoescape=True)
    return env.from_string(template_html).render(**context)

