# -*- coding: utf-8 -*-
from dotenv import load_dotenv
load_dotenv()  # 加载 .env 文件
from flask import Flask, request, jsonify, send_file
import os
# Clear proxy env vars before importing supabase to avoid proxy kw mismatch in some versions
for _key in ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']:
    os.environ.pop(_key, None)
import jwt
from werkzeug.security import generate_password_hash, check_password_hash
import traceback
import logging
import requests
import threading
import hashlib
from types import SimpleNamespace
import google.genai as genai

app = Flask(__name__)

# 获取端口配置，优先使用环境变量中的 PORT
# 这确保了在 Railway、Render 等平台上能正常监听正确的端口
PORT = int(os.environ.get('PORT', 5000))

# Ensure Render environment variables are loaded
app.config['SECRET_KEY'] = os.environ.get('JWT_SECRET') or os.environ.get('SECRET_KEY')

if not app.config['SECRET_KEY']:
    logging.getLogger(__name__).error("WARNING: JWT_SECRET env var is missing; auth will fail.")

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def _resolve_pdf_export_patch_version() -> str:
    configured = (os.getenv('PDF_EXPORT_PATCH_VERSION') or '').strip()
    if configured:
        return configured

    # Prefer platform-provided commit identifiers when available.
    commit_like = (
        os.getenv('RAILWAY_GIT_COMMIT_SHA')
        or os.getenv('RENDER_GIT_COMMIT')
        or os.getenv('VERCEL_GIT_COMMIT_SHA')
        or os.getenv('GITHUB_SHA')
        or ''
    ).strip()
    if commit_like:
        return f"pdf-export-{commit_like[:12]}"

    return "pdf-export-dev"


PDF_EXPORT_PATCH_VERSION = _resolve_pdf_export_patch_version()


def _is_missing_deletion_column_error(err: Exception) -> bool:
    return is_missing_deletion_column_error_service(err)


def _delete_supabase_auth_user(user_id: str):
    return delete_supabase_auth_user_service(
        user_id=user_id,
        supabase_url=SUPABASE_URL,
        supabase_key=SUPABASE_KEY,
        requests_module=requests,
    )


AUTO_DELETION_SWEEP_ENABLED = (os.getenv('AUTO_DELETION_SWEEP_ENABLED', '1').strip().lower() in ('1', 'true', 'yes', 'on'))
try:
    AUTO_DELETION_SWEEP_INTERVAL_SECONDS = int(os.getenv('AUTO_DELETION_SWEEP_INTERVAL_SECONDS', '600'))
except Exception:
    AUTO_DELETION_SWEEP_INTERVAL_SECONDS = 600
INTERNAL_CRON_TOKEN = (os.getenv('INTERNAL_CRON_TOKEN') or '').strip()
_deletion_sweep_state = {'lock': threading.Lock(), 'last_at': 0.0}

# Debug: Log environment variable keys (NOT values) to verify injection
env_keys = list(os.environ.keys())
logger.info(f"Detected environment variable keys: {', '.join([k for k in env_keys if not k.startswith('_')])}")

# Supabase configuration
SUPABASE_URL = os.getenv('SUPABASE_URL', 'your-supabase-url')
SUPABASE_KEY = os.getenv('SUPABASE_KEY', 'your-supabase-key')
JWT_SECRET = os.getenv('JWT_SECRET', 'your-jwt-secret')

# Google Gemini AI configuration
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', 'your-gemini-api-key')
# 简历反向工程（结构化解析）模型：优先速度
# 兼容旧变量名 GEMINI_RESUME_PARSE_MODEL
GEMINI_RESUME_PARSE_MODEL = os.getenv(
    'GEMINI_RESUME_PARSE_MODEL',
    os.getenv('GEMINI_RESUME_RE_MODEL', 'gemini-3-flash-preview')
)
# PDF OCR 文本提取模型：优先速度/成本
GEMINI_PDF_OCR_MODEL = os.getenv('GEMINI_PDF_OCR_MODEL', 'gemini-3-flash-preview')
# 职位描述截图识别模型：默认与 PDF OCR 一致，可单独下调到更快模型（如 gemini-2.5-flash-lite）
GEMINI_JD_OCR_MODEL = os.getenv('GEMINI_JD_OCR_MODEL', GEMINI_PDF_OCR_MODEL)
# 简历分析（优化建议）模型
GEMINI_ANALYSIS_MODEL = os.getenv('GEMINI_ANALYSIS_MODEL', 'gemini-3-flash-preview')
# 简历分析模型路由：gemini | deepseek | ab
ANALYSIS_LLM_MODE = (os.getenv('ANALYSIS_LLM_MODE', 'gemini') or 'gemini').strip().lower()
try:
    ANALYSIS_DEEPSEEK_RATIO = int(os.getenv('ANALYSIS_DEEPSEEK_RATIO', '0'))
except Exception:
    ANALYSIS_DEEPSEEK_RATIO = 0
ANALYSIS_DEEPSEEK_RATIO = max(0, min(100, ANALYSIS_DEEPSEEK_RATIO))
DEEPSEEK_API_KEY = (os.getenv('DEEPSEEK_API_KEY', '') or '').strip()
DEEPSEEK_BASE_URL = (os.getenv('DEEPSEEK_BASE_URL', 'https://api.deepseek.com') or 'https://api.deepseek.com').rstrip('/')
DEEPSEEK_ANALYSIS_MODEL = (os.getenv('DEEPSEEK_ANALYSIS_MODEL', 'deepseek-chat') or 'deepseek-chat').strip()
# 面试对话模型
GEMINI_INTERVIEW_MODEL = os.getenv('GEMINI_INTERVIEW_MODEL', 'gemini-3-flash-preview')
# 面试结束后的综合总结模型（质量优先）
GEMINI_INTERVIEW_SUMMARY_MODEL = os.getenv('GEMINI_INTERVIEW_SUMMARY_MODEL', 'gemini-3-flash-preview')
# 最终新简历生成模型（质量优先）
GEMINI_RESUME_GENERATION_MODEL = os.getenv('GEMINI_RESUME_GENERATION_MODEL', 'gemini-3-flash-preview')
# 语音转文字模型（成本优先）
GEMINI_TRANSCRIBE_MODEL = os.getenv('GEMINI_TRANSCRIBE_MODEL', 'gemini-2.5-flash-lite')
GEMINI_VISION_MODELS = [
    GEMINI_PDF_OCR_MODEL,
    os.getenv('GEMINI_VISION_MODEL', '').strip(),
    'gemini-2.5-flash-lite'
]
GEMINI_VISION_MODELS = [m for m in GEMINI_VISION_MODELS if m]


def _force_gemini_3_flash(model_name: str) -> str:
    raw = str(model_name or '').strip()
    lowered = raw.lower()
    if 'pro' in lowered or lowered in {'gemini-3', 'gemini-3-preview'}:
        logger.warning("Model override: forcing %s -> gemini-3-flash-preview", raw or '(empty)')
        return 'gemini-3-flash-preview'
    return raw or 'gemini-3-flash-preview'


# Hard guard: prevent any pro model from being used in runtime main flows.
GEMINI_ANALYSIS_MODEL = _force_gemini_3_flash(GEMINI_ANALYSIS_MODEL)
GEMINI_INTERVIEW_MODEL = _force_gemini_3_flash(GEMINI_INTERVIEW_MODEL)
GEMINI_INTERVIEW_SUMMARY_MODEL = _force_gemini_3_flash(GEMINI_INTERVIEW_SUMMARY_MODEL)
GEMINI_RESUME_GENERATION_MODEL = _force_gemini_3_flash(GEMINI_RESUME_GENERATION_MODEL)
PDF_PARSE_DEBUG = os.getenv('PDF_PARSE_DEBUG', '0') == '1'
RAG_ENABLED = os.getenv('RAG_ENABLED', '1').strip().lower() in ('1', 'true', 'yes', 'on')
try:
    RAG_MATCH_THRESHOLD = float(os.getenv('RAG_MATCH_THRESHOLD', '0.75'))
except ValueError:
    RAG_MATCH_THRESHOLD = 0.75

# Lightweight server-side PII guard for defense-in-depth.
# Frontend already masks PII before calling /api/ai/analyze, but scripts/clients may bypass it.
# Modes:
# - off: do nothing
# - warn (default): log a warning if PII-like patterns are detected
# - reject: return 400 if PII-like patterns are detected
# - mask: automatically mask PII before AI call, then unmask placeholders in AI output
PII_GUARD_MODE = (os.getenv('PII_GUARD_MODE', 'warn') or 'warn').strip().lower()


try:
    from services.auth_guard import (
        configure_auth_guard,
        _payload_pii_types,
        token_required,
        check_gemini_quota,
        parse_bool_flag,
    )
    from services.anti_bot_service import (
        AntiBotGuard,
        build_antibot_config_from_env,
    )
    from services.deletion_service import (
        is_missing_deletion_column_error as is_missing_deletion_column_error_service,
        delete_supabase_auth_user as delete_supabase_auth_user_service,
        delete_user_everywhere as delete_user_everywhere_service,
        run_expired_deletion_sweep as run_expired_deletion_sweep_service,
    )
except ImportError:
    from backend.services.auth_guard import (
        configure_auth_guard,
        _payload_pii_types,
        token_required,
        check_gemini_quota,
        parse_bool_flag,
    )
    from backend.services.anti_bot_service import (
        AntiBotGuard,
        build_antibot_config_from_env,
    )
    from backend.services.deletion_service import (
        is_missing_deletion_column_error as is_missing_deletion_column_error_service,
        delete_supabase_auth_user as delete_supabase_auth_user_service,
        delete_user_everywhere as delete_user_everywhere_service,
        run_expired_deletion_sweep as run_expired_deletion_sweep_service,
    )

try:
    from services.model_config_service import (
        get_ocr_model_candidates as get_ocr_model_candidates_service,
        get_analysis_model_candidates as get_analysis_model_candidates_service,
        get_transcribe_model_candidates as get_transcribe_model_candidates_service,
    )
    from services.mock_store_service import (
        create_storage_context as create_storage_context_service,
        is_mock_mode as is_mock_mode_service,
        mock_supabase_response as mock_supabase_response_service,
        get_mock_resumes_for_user as get_mock_resumes_for_user_service,
        normalize_resume_id as normalize_resume_id_service,
        find_existing_optimized_resume as find_existing_optimized_resume_service,
    )
    from services.flask_http_hooks import configure_flask_http_hooks
    from services.supabase_init_service import init_supabase_client
except ImportError:
    from backend.services.model_config_service import (
        get_ocr_model_candidates as get_ocr_model_candidates_service,
        get_analysis_model_candidates as get_analysis_model_candidates_service,
        get_transcribe_model_candidates as get_transcribe_model_candidates_service,
    )
    from backend.services.mock_store_service import (
        create_storage_context as create_storage_context_service,
        is_mock_mode as is_mock_mode_service,
        mock_supabase_response as mock_supabase_response_service,
        get_mock_resumes_for_user as get_mock_resumes_for_user_service,
        normalize_resume_id as normalize_resume_id_service,
        find_existing_optimized_resume as find_existing_optimized_resume_service,
    )
    from backend.services.flask_http_hooks import configure_flask_http_hooks
    from backend.services.supabase_init_service import init_supabase_client


def get_ocr_model_candidates():
    return get_ocr_model_candidates_service(GEMINI_VISION_MODELS)

def get_jd_ocr_model_candidates():
    raw_fallback = os.getenv('GEMINI_JD_OCR_FALLBACK_MODELS', '')
    env_fallback = [item.strip() for item in raw_fallback.split(',') if item.strip()]
    jd_models = [
        GEMINI_JD_OCR_MODEL,
        *env_fallback,
        GEMINI_PDF_OCR_MODEL,
        'gemini-2.5-flash-lite',
    ]
    return get_ocr_model_candidates_service(jd_models)


def get_analysis_model_candidates():
    return get_analysis_model_candidates_service(GEMINI_ANALYSIS_MODEL)


def get_transcribe_model_candidates():
    return get_transcribe_model_candidates_service(GEMINI_TRANSCRIBE_MODEL)

if GEMINI_API_KEY != 'your-gemini-api-key':
    gemini_client = genai.Client(api_key=GEMINI_API_KEY)
else:
    gemini_client = None


def _stable_percent_bucket(seed: str) -> int:
    digest = hashlib.sha256(str(seed or '').encode('utf-8')).hexdigest()
    return int(digest[:8], 16) % 100


def _should_route_analysis_to_deepseek(current_user_id: str, data: dict) -> bool:
    if ANALYSIS_LLM_MODE == 'deepseek':
        return True
    if ANALYSIS_LLM_MODE == 'gemini':
        return False
    if ANALYSIS_LLM_MODE != 'ab':
        return False
    resume_id = str((data or {}).get('resumeId') or '')
    jd_text = str((data or {}).get('jobDescription') or '')
    seed = f"{current_user_id}|{resume_id}|{len(jd_text)}"
    return _stable_percent_bucket(seed) < ANALYSIS_DEEPSEEK_RATIO


def _deepseek_generate_json(prompt: str, *, timeout_seconds: int = 90):
    if not DEEPSEEK_API_KEY:
        raise RuntimeError('DEEPSEEK_API_KEY not configured')

    response = requests.post(
        f"{DEEPSEEK_BASE_URL}/chat/completions",
        headers={
            'Authorization': f'Bearer {DEEPSEEK_API_KEY}',
            'Content-Type': 'application/json',
        },
        json={
            'model': DEEPSEEK_ANALYSIS_MODEL,
            'messages': [{'role': 'user', 'content': prompt}],
            'temperature': 0.2,
            'response_format': {'type': 'json_object'},
        },
        timeout=timeout_seconds,
    )
    response.raise_for_status()
    payload = response.json() or {}
    choices = payload.get('choices') or []
    if not choices:
        raise RuntimeError('DeepSeek returned empty choices')

    message = choices[0].get('message') or {}
    content = message.get('content')
    if isinstance(content, list):
        text_parts = []
        for part in content:
            if isinstance(part, dict):
                txt = part.get('text')
                if txt:
                    text_parts.append(str(txt))
        content = ''.join(text_parts)

    text = str(content or '').strip()
    if not text:
        raise RuntimeError('DeepSeek returned empty content')
    return SimpleNamespace(text=text), str(payload.get('model') or DEEPSEEK_ANALYSIS_MODEL)


def _analysis_generate_content_resilient(*, current_user_id: str, data: dict, prompt: str, analysis_models_tried):
    use_deepseek = _should_route_analysis_to_deepseek(current_user_id, data)
    if use_deepseek:
        try:
            response, model_name = _deepseek_generate_json(prompt)
            return response, f"deepseek:{model_name}"
        except Exception as deepseek_error:
            logger.warning("DeepSeek analysis failed, fallback to Gemini: %s", deepseek_error)

    last_error = None
    for model_name in (analysis_models_tried or []):
        try:
            return _gemini_generate_content_resilient(model_name, prompt, want_json=True)
        except Exception as model_error:
            last_error = model_error
            logger.warning("Analysis model failed: %s, error=%s", model_name, model_error)

    if use_deepseek and not analysis_models_tried:
        raise RuntimeError("No available analysis model (DeepSeek failed; Gemini candidates empty)")
    raise last_error or RuntimeError("No available analysis model")


def _can_run_analysis_ai(current_user_id: str, data: dict) -> bool:
    if _should_route_analysis_to_deepseek(current_user_id, data) and DEEPSEEK_API_KEY:
        return True
    return bool(gemini_client and check_gemini_quota())

# Anti-bot / anti-crawler guard (in-memory, per worker)
antibot_config = build_antibot_config_from_env(os.getenv)
anti_bot_guard = AntiBotGuard(antibot_config, logger=logger)
logger.info(
    "AntiBot enabled=%s mode=%s global=%s/%ss auth=%s/%ss heavy=%s/%ss",
    antibot_config.enabled,
    antibot_config.mode,
    antibot_config.global_max_requests,
    antibot_config.global_window_seconds,
    antibot_config.auth_max_requests,
    antibot_config.auth_window_seconds,
    antibot_config.heavy_max_requests,
    antibot_config.heavy_window_seconds,
)


def _extract_client_ip() -> str:
    for header_name in ('X-Forwarded-For', 'CF-Connecting-IP', 'X-Real-IP'):
        raw = request.headers.get(header_name, '')
        if not raw:
            continue
        ip = raw.split(',')[0].strip()
        if ip:
            return ip
    return (request.remote_addr or '').strip()

try:
    supabase = init_supabase_client(
        supabase_url=SUPABASE_URL,
        supabase_key=SUPABASE_KEY,
        logger=logger,
    )
except Exception as exc:
    logger.error("Supabase connection failed: %s", exc)
    supabase = None

storage_context = create_storage_context_service(
    supabase_client=supabase,
    logger=logger,
)
supabase = storage_context.supabase

def is_mock_mode():
    return is_mock_mode_service(storage_context=storage_context)

def mock_supabase_response(data=None, error=None):
    return mock_supabase_response_service(data=data, error=error, storage_context=storage_context)

mock_users = storage_context.mock_users
mock_resumes = storage_context.mock_resumes
mock_feedback = storage_context.mock_feedback


def get_mock_resumes_for_user(user_id: str):
    return get_mock_resumes_for_user_service(user_id=user_id, storage_context=storage_context)


def _normalize_resume_id(value):
    return normalize_resume_id_service(value)


def _find_existing_optimized_resume(current_user_id: str, optimized_from_id: str):
    return find_existing_optimized_resume_service(
        current_user_id,
        optimized_from_id,
        storage_context=storage_context,
        logger=logger,
    )


def _delete_user_everywhere(user_id: str, delete_auth: bool = True):
    return delete_user_everywhere_service(
        user_id=user_id,
        delete_auth=delete_auth,
        storage_context=storage_context,
        logger=logger,
        delete_supabase_auth_user_fn=_delete_supabase_auth_user,
    )


def run_expired_deletion_sweep(force: bool = False, limit: int = 200):
    return run_expired_deletion_sweep_service(
        force=force,
        limit=limit,
        sweep_state=_deletion_sweep_state,
        interval_seconds=AUTO_DELETION_SWEEP_INTERVAL_SECONDS,
        storage_context=storage_context,
        delete_user_everywhere_fn=_delete_user_everywhere,
        logger=logger,
        is_missing_deletion_column_error_fn=_is_missing_deletion_column_error,
    )


configure_flask_http_hooks(
    app=app,
    anti_bot_guard=anti_bot_guard,
    extract_client_ip=_extract_client_ip,
    auto_deletion_sweep_enabled=AUTO_DELETION_SWEEP_ENABLED,
    run_expired_deletion_sweep=run_expired_deletion_sweep,
)

try:
    from services.rag_service import (
        configure_rag_service,
        generate_embedding,
        parse_seniority_refined,
        find_relevant_cases_vector,
        resolve_rag_strategy,
    )
except ImportError:
    from backend.services.rag_service import (
        configure_rag_service,
        generate_embedding,
        parse_seniority_refined,
        find_relevant_cases_vector,
        resolve_rag_strategy,
    )

try:
    from services.payload_sanitizer import (
        validate_email,
        validate_password,
        clean_string,
        clean_list_strings,
        clean_list_dicts,
        clean_resume_payload,
    )
    from services.resume_crud_service import (
        list_resumes,
        create_resume_record,
        get_resume_detail,
        update_resume_record,
        delete_resume_record,
    )
    from services.auth_user_service import (
        register_user,
        login_user,
        forgot_password as forgot_password_service,
        get_profile as get_profile_service,
        request_deletion as request_deletion_service,
        cancel_deletion as cancel_deletion_service,
        delete_account_immediate as delete_account_immediate_service,
        update_profile as update_profile_service,
        get_templates as get_templates_service,
        submit_feedback as submit_feedback_service,
    )
except ImportError:
    from backend.services.payload_sanitizer import (
        validate_email,
        validate_password,
        clean_string,
        clean_list_strings,
        clean_list_dicts,
        clean_resume_payload,
    )
    from backend.services.resume_crud_service import (
        list_resumes,
        create_resume_record,
        get_resume_detail,
        update_resume_record,
        delete_resume_record,
    )
    from backend.services.auth_user_service import (
        register_user,
        login_user,
        forgot_password as forgot_password_service,
        get_profile as get_profile_service,
        request_deletion as request_deletion_service,
        cancel_deletion as cancel_deletion_service,
        delete_account_immediate as delete_account_immediate_service,
        update_profile as update_profile_service,
        get_templates as get_templates_service,
        submit_feedback as submit_feedback_service,
    )

@app.route('/api/auth/register', methods=['POST'])
def register():
    try:
        body, status = register_user(
            request.get_json() or {},
            {
                'validate_email': validate_email,
                'validate_password': validate_password,
                'storage_context': storage_context,
                'generate_password_hash': generate_password_hash,
                'JWT_SECRET': JWT_SECRET,
                'jwt': jwt,
            },
        )
        return jsonify(body), status
    except Exception:
        return jsonify({'error': '服务器内部错误'}), 500

@app.route('/api/auth/login', methods=['POST'])
def login():
    try:
        body, status = login_user(
            request.get_json() or {},
            {
                'storage_context': storage_context,
                'check_password_hash': check_password_hash,
                'JWT_SECRET': JWT_SECRET,
                'jwt': jwt,
            },
        )
        return jsonify(body), status
    except Exception:
        return jsonify({'error': '服务器内部错误'}), 500

@app.route('/api/auth/forgot-password', methods=['POST'])
def forgot_password():
    try:
        body, status = forgot_password_service(request.get_json() or {})
        return jsonify(body), status
    except Exception:
        return jsonify({'error': '服务器内部错误'}), 500

@app.route('/api/resumes', methods=['GET'])
@token_required
def get_resumes(current_user_id):
    try:
        body, status = list_resumes(
            current_user_id=current_user_id,
            storage_context=storage_context,
        )
        return jsonify(body), status
    except Exception:
        return jsonify({'error': '服务器内部错误'}), 500

@app.route('/api/resumes', methods=['POST'])
@token_required
def create_resume(current_user_id):
    try:
        body, status = create_resume_record(
            current_user_id=current_user_id,
            data=request.get_json() or {},
            clean_string=clean_string,
            clean_resume_payload=clean_resume_payload,
            normalize_resume_id=_normalize_resume_id,
            find_existing_optimized_resume=_find_existing_optimized_resume,
            storage_context=storage_context,
        )
        return jsonify(body), status
    except Exception:
        return jsonify({'error': '服务器内部错误'}), 500

@app.route('/api/resumes/<resume_id>', methods=['GET'])
@token_required
def get_resume(current_user_id, resume_id):
    try:
        body, status = get_resume_detail(
            current_user_id=current_user_id,
            resume_id=resume_id,
            storage_context=storage_context,
        )
        return jsonify(body), status
    except Exception:
        return jsonify({'error': '服务器内部错误'}), 500

@app.route('/api/resumes/<resume_id>', methods=['PUT'])
@token_required
def update_resume(current_user_id, resume_id):
    try:
        body, status = update_resume_record(
            current_user_id=current_user_id,
            resume_id=resume_id,
            data=request.get_json() or {},
            clean_resume_payload=clean_resume_payload,
            storage_context=storage_context,
        )
        return jsonify(body), status
    except Exception:
        return jsonify({'error': '服务器内部错误'}), 500

@app.route('/api/resumes/<resume_id>', methods=['DELETE'])
@token_required
def delete_resume(current_user_id, resume_id):
    try:
        body, status = delete_resume_record(
            current_user_id=current_user_id,
            resume_id=resume_id,
            storage_context=storage_context,
        )
        return jsonify(body), status
    except Exception:
        return jsonify({'error': '服务器内部错误'}), 500

try:
    from services.suggestion_service import (
        calculate_resume_score,
        generate_enhanced_suggestions,
        generate_suggestions,
    )
except ImportError:
    from backend.services.suggestion_service import (
        calculate_resume_score,
        generate_enhanced_suggestions,
        generate_suggestions,
    )

@app.route('/api/user/profile', methods=['GET'])
@token_required
def get_profile(current_user_id):
    try:
        body, status = get_profile_service(
            current_user_id,
            {
                'storage_context': storage_context,
                '_is_missing_deletion_column_error': _is_missing_deletion_column_error,
            },
        )
        return jsonify(body), status
    except Exception:
        logger.exception(f"get_profile failed for user={current_user_id}")
        return jsonify({'error': '服务器内部错误'}), 500

@app.route('/api/user/request-deletion', methods=['POST'])
@token_required
def request_deletion(current_user_id):
    try:
        body, status = request_deletion_service(
            current_user_id,
            {
                'storage_context': storage_context,
            },
        )
        return jsonify(body), status
    except Exception as e:
        logger.exception(f"request_deletion failed for user={current_user_id}")
        if _is_missing_deletion_column_error(e):
            return jsonify({
                'error': '当前数据库缺少 deletion_pending_until 字段，暂不支持冷静期注销。请先执行数据库迁移，或使用“立即永久注销”。'
            }), 400
        return jsonify({'error': f'注销操作失败：{str(e)}'}), 500

@app.route('/api/user/cancel-deletion', methods=['POST'])
@token_required
def cancel_deletion(current_user_id):
    try:
        body, status = cancel_deletion_service(
            current_user_id,
            {
                'storage_context': storage_context,
            },
        )
        return jsonify(body), status
    except Exception as e:
        logger.exception(f"cancel_deletion failed for user={current_user_id}")
        if _is_missing_deletion_column_error(e):
            return jsonify({
                'error': '当前数据库缺少 deletion_pending_until 字段，无法撤销冷静期注销。请先执行数据库迁移。'
            }), 400
        return jsonify({'error': f'撤销注销失败：{str(e)}'}), 500

@app.route('/api/user/delete-account-immediate', methods=['POST'])
@token_required
def delete_account_immediate(current_user_id):
    try:
        body, status = delete_account_immediate_service(
            current_user_id,
            {'_delete_user_everywhere': _delete_user_everywhere},
        )
        return jsonify(body), status
    except Exception as e:
        logger.exception(f"delete_account_immediate failed for user={current_user_id}")
        return jsonify({'error': f'立即注销失败：{str(e)}'}), 500


@app.route('/api/internal/sweep-expired-deletions', methods=['POST'])
def sweep_expired_deletions():
    """
    Internal maintenance endpoint (for cron):
    Deletes users whose deletion_pending_until has expired.
    Protect with INTERNAL_CRON_TOKEN.
    """
    try:
        if not INTERNAL_CRON_TOKEN:
            return jsonify({'error': 'INTERNAL_CRON_TOKEN 未配置'}), 503

        token = (
            (request.headers.get('X-Internal-Token') or '').strip()
            or request.headers.get('Authorization', '').replace('Bearer', '').strip()
        )
        if token != INTERNAL_CRON_TOKEN:
            return jsonify({'error': 'Unauthorized'}), 401

        result = run_expired_deletion_sweep(force=True, limit=500)
        return jsonify({
            'message': 'Sweep completed',
            **result
        }), 200
    except Exception as e:
        logger.exception(f"sweep_expired_deletions failed: {e}")
        return jsonify({'error': f'sweep failed: {str(e)}'}), 500

@app.route('/api/user/profile', methods=['PUT'])
@token_required
def update_profile(current_user_id):
    try:
        body, status = update_profile_service(
            current_user_id,
            request.get_json() or {},
            {
                'storage_context': storage_context,
            },
        )
        return jsonify(body), status
    except Exception:
        return jsonify({'error': '服务器内部错误'}), 500

@app.route('/api/templates', methods=['GET'])
def get_templates():
    try:
        body, status = get_templates_service()
        return jsonify(body), status
    except Exception:
        return jsonify({'error': '服务器内部错误'}), 500

@app.route('/api/feedback', methods=['POST'])
@token_required
def submit_feedback(current_user_id):
    try:
        body, status = submit_feedback_service(
            current_user_id,
            request.get_json() or {},
            {
                'storage_context': storage_context,
            },
        )
        return jsonify(body), status
    except Exception:
        return jsonify({'error': '服务器内部错误'}), 500

@app.route('/api/export-pdf', methods=['POST'])
def export_pdf():
    try:
        data = request.get_json() or {}
        payload = build_pdf_export_payload(data, logger=logger, patch_version=PDF_EXPORT_PATCH_VERSION)
        result = payload['stream']
        result.seek(0)
        filename = payload['filename']
        resolved_font = payload['resolved_font']
        logger.info("PDF generated successfully with Playwright")

        response = send_file(
            result,
            as_attachment=True,
            download_name=filename,
            mimetype='application/pdf'
        )
        response.headers['X-PDF-Export-Patch'] = PDF_EXPORT_PATCH_VERSION
        response.headers['X-PDF-Font-File'] = os.path.basename(resolved_font)
        return response

    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except PDFExportBusyError as e:
        response = jsonify({'error': str(e)})
        response.status_code = 429
        response.headers['Retry-After'] = str(int(os.getenv('PDF_EXPORT_ACQUIRE_TIMEOUT_SECONDS', '8') or '8'))
        return response
    except Exception as e:
        logger.error(f"PDF generation error: {str(e)}")
        logger.error(f"Full traceback: {traceback.format_exc()}")
        logger.error(f"Resume data received: {locals().get('data')}")
        return jsonify({'error': '生成 PDF 失败'}), 500

try:
    from services.export_service import build_pdf_export_payload, PDFExportBusyError
    from services.resume_parse_service import (
        configure_resume_parse_service,
        extract_text_from_pdf,
        extract_text_multimodal,
        extract_text_from_docx,
        parse_resume_text_with_ai,
        _extract_text_via_pymupdf,
        _extract_text_via_pypdf,
        _gemini_generate_content_resilient,
        _parse_json_object_from_text,
    )
    from services.analysis_utils import (
        format_resume_for_ai,
        parse_ai_response,
        is_gender_related_suggestion,
        is_education_related_suggestion,
        ensure_analysis_summary,
        generate_mock_chat_response,
    )
    from services.resume_generation_service import generate_optimized_resume
    from services.parse_endpoint_service import parse_resume_core, parse_pdf_core
    from services.ai_endpoint_service import (
        analyze_resume_core,
        parse_screenshot_core,
        ai_chat_core,
        ai_chat_stream_core,
        transcribe_core,
    )
    from routes.ai_routes import register_ai_routes
    from routes.ai_route_deps import build_ai_route_deps
except ImportError:
    from backend.services.export_service import build_pdf_export_payload, PDFExportBusyError
    from backend.services.resume_parse_service import (
        configure_resume_parse_service,
        extract_text_from_pdf,
        extract_text_multimodal,
        extract_text_from_docx,
        parse_resume_text_with_ai,
        _extract_text_via_pymupdf,
        _extract_text_via_pypdf,
        _gemini_generate_content_resilient,
        _parse_json_object_from_text,
    )
    from backend.services.analysis_utils import (
        format_resume_for_ai,
        parse_ai_response,
        is_gender_related_suggestion,
        is_education_related_suggestion,
        ensure_analysis_summary,
        generate_mock_chat_response,
    )
    from backend.services.resume_generation_service import generate_optimized_resume
    from backend.services.parse_endpoint_service import parse_resume_core, parse_pdf_core
    from backend.services.ai_endpoint_service import (
        analyze_resume_core,
        parse_screenshot_core,
        ai_chat_core,
        ai_chat_stream_core,
        transcribe_core,
    )
    from backend.routes.ai_routes import register_ai_routes
    from backend.routes.ai_route_deps import build_ai_route_deps

configure_resume_parse_service(
    logger_obj=logger,
    gemini_client_obj=gemini_client,
    gemini_resume_parse_model=GEMINI_RESUME_PARSE_MODEL,
    pdf_parse_debug=PDF_PARSE_DEBUG,
    get_ocr_model_candidates_fn=get_ocr_model_candidates,
)
configure_rag_service(
    logger_obj=logger,
    gemini_client_obj=gemini_client,
    supabase_client=supabase,
    rag_match_threshold=RAG_MATCH_THRESHOLD,
)
configure_auth_guard(
    logger_obj=logger,
    supabase_client=supabase,
    jwt_secret=JWT_SECRET,
)

register_ai_routes(
    app,
    build_ai_route_deps(
        token_required=token_required,
        parse_resume_core=parse_resume_core,
        parse_pdf_core=parse_pdf_core,
        analyze_resume_core=analyze_resume_core,
        parse_screenshot_core=parse_screenshot_core,
        ai_chat_core=ai_chat_core,
        ai_chat_stream_core=ai_chat_stream_core,
        transcribe_core=transcribe_core,
        parse_resume_text_with_ai=parse_resume_text_with_ai,
        extract_text_from_pdf=extract_text_from_pdf,
        extract_text_multimodal=extract_text_multimodal,
        extract_text_from_docx=extract_text_from_docx,
        _extract_text_via_pymupdf=_extract_text_via_pymupdf,
        _extract_text_via_pypdf=_extract_text_via_pypdf,
        logger=logger,
        traceback=traceback,
        gemini_client=gemini_client,
        PDF_PARSE_DEBUG=PDF_PARSE_DEBUG,
        parse_bool_flag=parse_bool_flag,
        RAG_ENABLED=RAG_ENABLED,
        resolve_rag_strategy=resolve_rag_strategy,
        PII_GUARD_MODE=PII_GUARD_MODE,
        _payload_pii_types=_payload_pii_types,
        check_gemini_quota=check_gemini_quota,
        _can_run_analysis_ai=_can_run_analysis_ai,
        find_relevant_cases_vector=find_relevant_cases_vector,
        format_resume_for_ai=format_resume_for_ai,
        get_ocr_model_candidates=get_ocr_model_candidates,
        get_jd_ocr_model_candidates=get_jd_ocr_model_candidates,
        get_analysis_model_candidates=get_analysis_model_candidates,
        get_transcribe_model_candidates=get_transcribe_model_candidates,
        _gemini_generate_content_resilient=_gemini_generate_content_resilient,
        _analysis_generate_content_resilient=_analysis_generate_content_resilient,
        _parse_json_object_from_text=_parse_json_object_from_text,
        GEMINI_RESUME_GENERATION_MODEL=GEMINI_RESUME_GENERATION_MODEL,
        GEMINI_INTERVIEW_MODEL=GEMINI_INTERVIEW_MODEL,
        GEMINI_INTERVIEW_SUMMARY_MODEL=GEMINI_INTERVIEW_SUMMARY_MODEL,
        parse_ai_response=parse_ai_response,
        is_gender_related_suggestion=is_gender_related_suggestion,
        is_education_related_suggestion=is_education_related_suggestion,
        ensure_analysis_summary=ensure_analysis_summary,
        calculate_resume_score=calculate_resume_score,
        generate_enhanced_suggestions=generate_enhanced_suggestions,
        generate_suggestions=generate_suggestions,
        generate_optimized_resume=generate_optimized_resume,
    ),
)

if __name__ == '__main__':
    # 使用配置的端口
    app.run(host='0.0.0.0', port=PORT)
