import base64
import io
import os
import threading
import time

from playwright.sync_api import sync_playwright

from .import_compat import import_attrs


(
    extract_company_name_from_jd,
    build_pdf_filename,
    sanitize_filename_part,
    resolve_pdf_font_path,
    get_pdf_font_url,
    get_pdf_font_bytes,
    inject_font_css_into_html,
    generate_resume_html,
) = import_attrs(
    'services.pdf_service',
    (
        'extract_company_name_from_jd',
        'build_pdf_filename',
        'sanitize_filename_part',
        'resolve_pdf_font_path',
        'get_pdf_font_url',
        'get_pdf_font_bytes',
        'inject_font_css_into_html',
        'generate_resume_html',
    ),
)


class PDFExportBusyError(RuntimeError):
    """Raised when PDF export concurrency limit is reached."""


def _read_int_env(name: str, default: int) -> int:
    raw = (os.getenv(name, str(default)) or str(default)).strip()
    try:
        value = int(raw)
    except Exception:
        value = default
    return value if value > 0 else default


def _read_float_env(name: str, default: float) -> float:
    raw = (os.getenv(name, str(default)) or str(default)).strip()
    try:
        value = float(raw)
    except Exception:
        value = default
    return value


PDF_EXPORT_MAX_CONCURRENCY = _read_int_env("PDF_EXPORT_MAX_CONCURRENCY", 1)
PDF_EXPORT_ACQUIRE_TIMEOUT_SECONDS = _read_float_env("PDF_EXPORT_ACQUIRE_TIMEOUT_SECONDS", 8.0)
_PDF_EXPORT_SEMAPHORE = threading.BoundedSemaphore(PDF_EXPORT_MAX_CONCURRENCY)


def _generate_pdf_with_playwright(html_content: str, logger):
    launch_args = [
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--no-default-browser-check",
    ]
    if os.getenv('PDF_PLAYWRIGHT_NO_SANDBOX', '1').strip().lower() in ('1', 'true', 'yes', 'on'):
        launch_args.extend(["--no-sandbox", "--disable-setuid-sandbox"])

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=launch_args)
        try:
            page = browser.new_page(viewport={"width": 794, "height": 1123})
            page.emulate_media(media="print")
            font_bytes = get_pdf_font_bytes()
            route_state = {"hits": 0}

            if font_bytes:
                def _handle_font_route(route):
                    route_state["hits"] += 1
                    route.fulfill(
                        status=200,
                        body=font_bytes,
                        headers={
                            "Content-Type": "font/ttf",
                            "Access-Control-Allow-Origin": "*",
                            "Cache-Control": "public, max-age=3600",
                        },
                    )

                page.route("https://pdf.local/__pdf_font__.ttf", _handle_font_route)
                page.route("**/__pdf_font__.ttf", _handle_font_route)

            page.set_content(html_content, wait_until="networkidle", timeout=30000)
            page.evaluate(
                """
                () => {
                    if (document.fonts && document.fonts.ready) {
                        return document.fonts.ready;
                    }
                    return Promise.resolve();
                }
                """
            )

            font_check = page.evaluate(
                """
                () => {
                    const hasFonts = !!document.fonts;
                    const size = hasFonts ? document.fonts.size : -1;
                    const ok = hasFonts ? document.fonts.check('14px CustomPDF', '中文测试ABC123') : false;
                    const asciiOk = hasFonts ? document.fonts.check('14px CustomPDF', 'ABC123') : false;
                    const zhOk = hasFonts ? document.fonts.check('14px CustomPDF', '中文测试简历教育背景') : false;
                    return { hasFonts, size, ok, asciiOk, zhOk };
                }
                """
            )
            logger.info(
                "PDF font check route_hits=%s font_bytes=%s has_fonts=%s font_set_size=%s custom_ok=%s ascii_ok=%s zh_ok=%s",
                route_state.get("hits", 0),
                len(font_bytes or b""),
                font_check.get("hasFonts"),
                font_check.get("size"),
                font_check.get("ok"),
                font_check.get("asciiOk"),
                font_check.get("zhOk"),
            )

            if font_bytes and not font_check.get("ok"):
                encoded = base64.b64encode(font_bytes).decode("ascii")
                page.add_style_tag(content=f"""
                  @font-face {{
                    font-family: 'CustomPDFInline';
                    src: url('data:font/ttf;base64,{encoded}');
                    font-weight: normal;
                    font-style: normal;
                    font-display: swap;
                  }}
                  @font-face {{
                    font-family: 'CustomPDFInline';
                    src: url('data:font/ttf;base64,{encoded}');
                    font-weight: bold;
                    font-style: normal;
                    font-display: swap;
                  }}
                  html, body, #resume-root {{
                    font-family: 'CustomPDFInline', 'CustomPDF', 'Microsoft YaHei', 'SimHei', sans-serif !important;
                    font-synthesis: none;
                  }}
                """)
                page.evaluate(
                    """
                    () => {
                        if (document.fonts && document.fonts.ready) {
                            return document.fonts.ready;
                        }
                        return Promise.resolve();
                    }
                    """
                )
                font_check_retry = page.evaluate(
                    """
                    () => {
                        const hasFonts = !!document.fonts;
                        const size = hasFonts ? document.fonts.size : -1;
                        const ok = hasFonts ? document.fonts.check('14px CustomPDFInline', '中文测试ABC123') : false;
                        return { hasFonts, size, ok };
                    }
                    """
                )
                logger.info(
                    "PDF font fallback check has_fonts=%s font_set_size=%s inline_ok=%s",
                    font_check_retry.get("hasFonts"),
                    font_check_retry.get("size"),
                    font_check_retry.get("ok"),
                )

            return page.pdf(
                print_background=True,
                prefer_css_page_size=False,
                format="A4",
                margin={"top": "0cm", "bottom": "0cm", "left": "0cm", "right": "0cm"},
                scale=1,
            )
        finally:
            browser.close()


def build_pdf_export_payload(data: dict, logger, patch_version: str):
    resume_data = data.get('resumeData')
    jd_text = data.get('jdText', '')
    if not resume_data:
        raise ValueError('需要提供简历数据')

    resolved_font = resolve_pdf_font_path()
    if not resolved_font:
        logger.error("PDF font missing: backend/font.ttf not found")
        raise RuntimeError('PDF 字体缺失：未找到 font.ttf')

    logger.info(
        "Starting PDF generation with Playwright, patch=%s, font_path=%s",
        patch_version,
        resolved_font,
    )

    html_content = generate_resume_html(resume_data)
    html_content = inject_font_css_into_html(html_content)

    try:
        resolved_font_url = get_pdf_font_url()
        html_has_font_face = ('@font-face' in html_content)
        html_has_font_url = ('__pdf_font__.ttf' in html_content) or ('data:font/ttf;base64,' in html_content)
        logger.info(
            "PDF font resolved path=%s, url_scheme=%s, html_has_font_face=%s, html_has_font_url=%s",
            resolved_font,
            (resolved_font_url.split(':', 1)[0] if resolved_font_url else 'none'),
            html_has_font_face,
            html_has_font_url,
        )
    except Exception:
        pass
    logger.info("Generated HTML content length: %s", len(html_content))

    acquire_timeout = PDF_EXPORT_ACQUIRE_TIMEOUT_SECONDS
    if acquire_timeout is not None and acquire_timeout < 0:
        acquire_timeout = None

    start_wait = time.monotonic()
    acquired = _PDF_EXPORT_SEMAPHORE.acquire(timeout=acquire_timeout)
    wait_seconds = round(time.monotonic() - start_wait, 3)

    if not acquired:
        raise PDFExportBusyError(
            f"PDF 导出繁忙：并发上限 {PDF_EXPORT_MAX_CONCURRENCY}，"
            f"请稍后重试（等待超时 {PDF_EXPORT_ACQUIRE_TIMEOUT_SECONDS}s）"
        )

    try:
        logger.info(
            "PDF export slot acquired, concurrency_limit=%s wait_seconds=%s",
            PDF_EXPORT_MAX_CONCURRENCY,
            wait_seconds,
        )
        pdf_bytes = _generate_pdf_with_playwright(html_content, logger)
    finally:
        _PDF_EXPORT_SEMAPHORE.release()
        logger.info("PDF export slot released")

    custom_title = data.get('resumeTitle') or data.get('filename') or ''
    custom_title = str(custom_title).strip()
    if custom_title.lower().endswith('.pdf'):
        custom_title = custom_title[:-4].strip()
    safe_title = sanitize_filename_part(custom_title)
    if safe_title:
        filename = safe_title if safe_title.lower().endswith('.pdf') else f"{safe_title}.pdf"
    else:
        personal_info = resume_data.get('personalInfo', {}) or {}
        name = personal_info.get('name', '简历')
        direction = personal_info.get('title', '')
        company = extract_company_name_from_jd(jd_text)
        filename = build_pdf_filename(name=name, direction=direction, company=company)

    return {
        'stream': io.BytesIO(pdf_bytes),
        'filename': filename,
        'resolved_font': resolved_font,
    }
