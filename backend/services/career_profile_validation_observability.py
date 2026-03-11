import os
import re
from typing import Any, Dict, List


DEFAULT_ALERT_WARN_COUNT = 1
DEFAULT_ALERT_CRITICAL_COUNT = 3
DEFAULT_METRIC_VERSION = 'v1'


def _to_non_negative_int(raw: Any, default: int) -> int:
    try:
        value = int(str(raw).strip())
    except Exception:
        return max(0, int(default))
    return max(0, value)


def _scope_env_key(scope: str) -> str:
    normalized = re.sub(r'[^A-Za-z0-9]+', '_', str(scope or '').strip()).strip('_')
    return normalized.upper() or 'UNKNOWN'


def _resolve_alert_thresholds(scope: str) -> Dict[str, int]:
    global_warn = _to_non_negative_int(
        os.getenv('CAREER_PROFILE_VALIDATION_ALERT_WARN_COUNT', DEFAULT_ALERT_WARN_COUNT),
        DEFAULT_ALERT_WARN_COUNT,
    )
    global_critical = _to_non_negative_int(
        os.getenv('CAREER_PROFILE_VALIDATION_ALERT_CRITICAL_COUNT', DEFAULT_ALERT_CRITICAL_COUNT),
        DEFAULT_ALERT_CRITICAL_COUNT,
    )

    scope_key = _scope_env_key(scope)
    scoped_warn = os.getenv(f'CAREER_PROFILE_VALIDATION_{scope_key}_ALERT_WARN_COUNT')
    scoped_critical = os.getenv(f'CAREER_PROFILE_VALIDATION_{scope_key}_ALERT_CRITICAL_COUNT')

    warn_count = _to_non_negative_int(scoped_warn, global_warn) if scoped_warn is not None else global_warn
    critical_count = (
        _to_non_negative_int(scoped_critical, global_critical)
        if scoped_critical is not None
        else global_critical
    )

    if critical_count and warn_count and critical_count < warn_count:
        critical_count = warn_count

    return {
        'warn_count': warn_count,
        'critical_count': critical_count,
    }


def resolve_validation_alert_level(error_count: int, *, scope: str) -> str:
    count = max(0, int(error_count or 0))
    if count <= 0:
        return 'ok'

    thresholds = _resolve_alert_thresholds(scope)
    critical_count = thresholds['critical_count']
    warn_count = thresholds['warn_count']

    if critical_count > 0 and count >= critical_count:
        return 'critical'
    if warn_count > 0 and count >= warn_count:
        return 'warn'
    return 'info'


def build_validation_error_observability_fields(
    errors: List[Dict[str, Any]],
    *,
    scope: str,
) -> Dict[str, Any]:
    error_list = errors if isinstance(errors, list) else []

    failed_paths = sorted(
        {
            str(item.get('path') or '').strip()
            for item in error_list
            if isinstance(item, dict) and str(item.get('path') or '').strip()
        }
    )
    failed_error_types = sorted(
        {
            str(item.get('error_type') or '').strip()
            for item in error_list
            if isinstance(item, dict) and str(item.get('error_type') or '').strip()
        }
    )
    error_count = len(error_list)

    thresholds = _resolve_alert_thresholds(scope)

    return {
        'validation_scope': str(scope or '').strip() or 'unknown',
        'validation_metric_version': str(
            os.getenv('CAREER_PROFILE_VALIDATION_METRIC_VERSION', DEFAULT_METRIC_VERSION)
        ).strip()
        or DEFAULT_METRIC_VERSION,
        'validation_error_count': error_count,
        'validation_error_paths': failed_paths,
        'validation_error_types': failed_error_types,
        'validation_alert_warn_count': thresholds['warn_count'],
        'validation_alert_critical_count': thresholds['critical_count'],
        'validation_alert_level': resolve_validation_alert_level(error_count, scope=scope),
    }
