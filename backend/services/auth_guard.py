# -*- coding: utf-8 -*-
import json
import re
from functools import wraps

import jwt
from flask import jsonify, request

import logging

logger = logging.getLogger(__name__)
supabase = None
JWT_SECRET = ''

# Lightweight server-side PII guard patterns.
_PII_EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
_PII_PHONE_RE = re.compile(r"(?<!\d)(\+?\d[\d\s-]{7,}\d)(?!\d)")
_PII_CN_ID_RE = re.compile(r"(?<!\d)\d{17}[\dXx](?!\d)")


def configure_auth_guard(*, logger_obj=None, supabase_client=None, jwt_secret=''):
    global logger, supabase, JWT_SECRET
    if logger_obj is not None:
        logger = logger_obj
    supabase = supabase_client
    JWT_SECRET = str(jwt_secret or '')

def _detect_pii_types(text: str):
    types = set()
    if not text:
        return types
    if _PII_EMAIL_RE.search(text):
        types.add("email")
    if _PII_PHONE_RE.search(text):
        types.add("phone")
    if _PII_CN_ID_RE.search(text):
        types.add("cn_id")
    return types


def _payload_pii_types(resume_data, job_description):
    try:
        sample = json.dumps(
            {"resumeData": resume_data, "jobDescription": job_description},
            ensure_ascii=False
        )
    except Exception:
        sample = f"{resume_data}\n{job_description}"
    # Prevent pathological huge payload logging; detection doesn't need full text.
    if isinstance(sample, str) and len(sample) > 200_000:
        sample = sample[:200_000]
    return _detect_pii_types(sample)

def token_required(f):
    @wraps(f)
    def decorated(*view_args, **view_kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return jsonify({'message': '缺少 Authorization 请求头'}), 401

        token = auth_header.split(" ", 1)[1].strip() if " " in auth_header else auth_header.strip()
        if not token:
            return jsonify({'message': 'Token 为空'}), 401

        # 1) 优先验证 Supabase access token
        if supabase and hasattr(supabase, 'auth'):
            try:
                user_res = supabase.auth.get_user(token)
                if user_res and user_res.user and getattr(user_res.user, 'id', None):
                    return f(user_res.user.id, *view_args, **view_kwargs)
            except Exception as se:
                logger.warning(f"Supabase token verify failed: {se}")

        # 2) 兼容后端自签 token（JWT_SECRET）
        try:
            payload = jwt.decode(
                token,
                JWT_SECRET,
                algorithms=["HS256"],
                options={"verify_aud": False}
            )
            user_id = payload.get('sub') or payload.get('user_id') or payload.get('id')
            if user_id:
                return f(user_id, *view_args, **view_kwargs)
        except Exception as je:
            logger.warning(f"Custom JWT verify failed: {je}")

        # 验证失败（不再允许无验签放行）
        return jsonify({'message': 'Token 无效或已过期，请重新登录'}), 401

    return decorated

def check_gemini_quota():
    """Local quota guard removed: rely on upstream Gemini quota and retries."""
    return True

def parse_bool_flag(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    s = str(value).strip().lower()
    if s in ('1', 'true', 'yes', 'on'):
        return True
    if s in ('0', 'false', 'no', 'off'):
        return False
    return default

