import os

from supabase import create_client, Client


def _clear_proxy_env():
    proxy_keys = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']
    removed = {}
    for key in proxy_keys:
        if key in os.environ:
            removed[key] = os.environ.pop(key)
    return removed


def _restore_proxy_env(removed):
    for key, value in removed.items():
        os.environ[key] = value


def init_supabase_client(*, supabase_url, supabase_key, logger):
    if not supabase_url or supabase_url == 'your-supabase-url' or not supabase_url.startswith('http'):
        logger.warning("Invalid SUPABASE_URL detected: %s", supabase_url)
        return None

    try:
        removed_proxy_env = _clear_proxy_env()
        client = create_client(supabase_url, supabase_key)
        _restore_proxy_env(removed_proxy_env)
        logger.info("Supabase connected successfully")
        return client
    except TypeError as err:
        _restore_proxy_env(removed_proxy_env)
        if "proxy" in str(err):
            logger.warning("Detected proxy argument mismatch, attempting simple Client initialization...")
            removed_proxy_env = _clear_proxy_env()
            client = Client(supabase_url=supabase_url, supabase_key=supabase_key)
            _restore_proxy_env(removed_proxy_env)
            logger.info("Supabase connected successfully (manual fallback)")
            return client
        raise
