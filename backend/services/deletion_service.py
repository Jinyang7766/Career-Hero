from datetime import datetime, timezone


def is_missing_deletion_column_error(err: Exception) -> bool:
    text = str(err or '')
    return (
        'deletion_pending_until' in text
        and ('PGRST204' in text or 'schema cache' in text or 'Could not find' in text)
    )


def delete_supabase_auth_user(*, user_id: str, supabase_url: str, supabase_key: str, requests_module):
    if not supabase_url or supabase_url == 'your-supabase-url':
        raise RuntimeError('SUPABASE_URL 未配置')
    if not supabase_key or supabase_key == 'your-supabase-key':
        raise RuntimeError('SUPABASE_KEY 未配置')

    admin_url = f"{supabase_url.rstrip('/')}/auth/v1/admin/users/{user_id}"
    headers = {
        'apikey': supabase_key,
        'Authorization': f'Bearer {supabase_key}',
        'Content-Type': 'application/json'
    }
    resp = requests_module.delete(admin_url, headers=headers, timeout=20)
    if resp.status_code in (200, 204, 404):
        return True
    try:
        payload = resp.json()
    except Exception:
        payload = {'raw': resp.text}
    raise RuntimeError(f"删除 Auth 用户失败(status={resp.status_code}): {payload}")


def parse_iso_datetime(value: str):
    text = str(value or '').strip()
    if not text:
        return None
    if text.endswith('Z'):
        text = text[:-1] + '+00:00'
    dt = datetime.fromisoformat(text)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def delete_user_everywhere(
    *,
    user_id: str,
    delete_auth: bool,
    storage_context,
    logger,
    delete_supabase_auth_user_fn,
):
    profile_deleted = bool(storage_context.delete_user_related_records(user_id, logger=logger))

    auth_deleted = True
    if delete_auth:
        delete_supabase_auth_user_fn(user_id)
    return {'profile_deleted': profile_deleted, 'auth_deleted': auth_deleted}


def run_expired_deletion_sweep(
    *,
    force: bool,
    limit: int,
    sweep_state: dict,
    interval_seconds: int,
    storage_context,
    delete_user_everywhere_fn,
    logger,
    is_missing_deletion_column_error_fn,
):
    now_ts = datetime.now(timezone.utc).timestamp()
    lock = sweep_state['lock']
    with lock:
        if (
            not force
            and interval_seconds > 0
            and (now_ts - sweep_state.get('last_at', 0.0)) < interval_seconds
        ):
            return {'ran': False, 'reason': 'throttled', 'deleted': 0, 'candidates': 0}
        sweep_state['last_at'] = now_ts

    deleted = 0
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        rows = storage_context.list_due_deletion_users(now_iso=now_iso, limit=limit)
    except Exception as query_err:
        if is_missing_deletion_column_error_fn(query_err):
            logger.warning("deletion sweep skipped: users.deletion_pending_until column missing")
            return {'ran': True, 'deleted': 0, 'candidates': 0, 'warning': 'missing_deletion_pending_until_column'}
        raise

    for row in rows:
        uid = row.get('id')
        if not uid:
            continue
        try:
            delete_user_everywhere_fn(uid, delete_auth=True)
            deleted += 1
        except Exception as del_err:
            logger.exception("deletion sweep failed for user=%s: %s", uid, del_err)
    return {'ran': True, 'deleted': deleted, 'candidates': len(rows)}
