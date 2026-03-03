# -*- coding: utf-8 -*-
import re
from typing import Any, Dict, List, Optional, Tuple

FACT_ITEM_KINDS = {'skill', 'highlight', 'constraint'}


def validate_email(email):
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None


def validate_password(password):
    return len(password) >= 8


def clean_string(value, max_len=4000):
    if value is None:
        return ''
    if not isinstance(value, str):
        value = str(value)
    value = value.strip()
    return value[:max_len]


def clean_list_strings(values, max_items=200, max_len=200):
    if not isinstance(values, list):
        return []
    cleaned = []
    for item in values[:max_items]:
        if item is None:
            continue
        cleaned.append(clean_string(item, max_len=max_len))
    return cleaned


def clean_list_dicts(values, allowed_keys, max_items=100):
    if not isinstance(values, list):
        return []
    cleaned = []
    for item in values[:max_items]:
        if not isinstance(item, dict):
            continue
        entry = {}
        for key in allowed_keys:
            if key in item:
                if key == 'id':
                    entry[key] = item.get(key)
                else:
                    entry[key] = clean_string(item.get(key), max_len=2000)
        cleaned.append(entry)
    return cleaned


def _error(path: str, error_type: str, detail: str) -> Dict[str, str]:
    return {
        'path': path,
        'error_type': error_type,
        'detail': detail,
    }


def _clean_fact_kind(value: Any) -> str:
    kind = clean_string(value, 32).lower()
    return kind if kind in FACT_ITEM_KINDS else ''


def sanitize_fact_items(
    fact_items: Any,
    *,
    field_path: str = 'factItems',
) -> Tuple[Optional[List[Dict[str, Any]]], List[Dict[str, str]]]:
    """
    Returns:
    - (None, []) when fact_items is None (caller decides fallback)
    - (None, errors) when structure is invalid
    - (cleaned_items, []) when valid
    """
    if fact_items is None:
        return None, []

    if not isinstance(fact_items, list):
        return None, [_error(field_path, 'invalid_type', 'expected array')]

    cleaned: List[Dict[str, Any]] = []
    errors: List[Dict[str, str]] = []

    for idx, item in enumerate(fact_items):
        item_path = f'{field_path}[{idx}]'
        if not isinstance(item, dict):
            errors.append(_error(item_path, 'invalid_type', 'expected object'))
            continue

        item_errors_before = len(errors)

        item_id = clean_string(item.get('id'), 120)
        if not item_id:
            errors.append(_error(f'{item_path}.id', 'required', 'id is required'))

        kind = _clean_fact_kind(item.get('kind'))
        if not kind:
            errors.append(_error(f'{item_path}.kind', 'invalid_enum', 'kind must be one of skill/highlight/constraint'))

        text = clean_string(item.get('text'), 400)
        if not text:
            errors.append(_error(f'{item_path}.text', 'required', 'text is required'))

        key = clean_string(item.get('key'), 160)
        if not key:
            errors.append(_error(f'{item_path}.key', 'required', 'key is required'))

        aliases_raw = item.get('aliases')
        aliases: Optional[List[str]] = None
        if aliases_raw is not None:
            if not isinstance(aliases_raw, list):
                errors.append(_error(f'{item_path}.aliases', 'invalid_type', 'expected array'))
            else:
                aliases = []
                for alias_idx, alias in enumerate(aliases_raw):
                    alias_kind = _clean_fact_kind(alias)
                    if not alias_kind:
                        errors.append(
                            _error(
                                f'{item_path}.aliases[{alias_idx}]',
                                'invalid_enum',
                                'alias must be one of skill/highlight/constraint',
                            )
                        )
                        continue
                    if alias_kind not in aliases:
                        aliases.append(alias_kind)

        if len(errors) > item_errors_before:
            continue

        fact_item = {
            'id': item_id,
            'kind': kind,
            'text': text,
            'key': key,
        }
        if aliases:
            fact_item['aliases'] = aliases
        cleaned.append(fact_item)

    if errors:
        return None, errors

    return cleaned, []


def resolve_fact_items_with_fallback(
    *,
    incoming_fact_items: Any,
    existing_fact_items: Any,
    logger=None,
    field_path: str = 'factItems',
) -> Tuple[List[Dict[str, Any]], str, List[Dict[str, str]]]:
    """
    Returns (fact_items, source, errors)
    source: incoming | existing_profile | empty_list
    """
    incoming_cleaned, incoming_errors = sanitize_fact_items(incoming_fact_items, field_path=field_path)
    if incoming_errors:
        existing_cleaned, existing_errors = sanitize_fact_items(
            existing_fact_items,
            field_path='existingProfile.factItems',
        )
        if existing_cleaned is not None and not existing_errors:
            fallback_items = existing_cleaned
            source = 'existing_profile'
        else:
            fallback_items = []
            source = 'empty_list'

        if logger and hasattr(logger, 'warning'):
            logger.warning(
                'career_profile.fact_items.validation_failed',
                extra={
                    'event': 'career_profile.fact_items.validation_failed',
                    'field_path': field_path,
                    'fallback_source': source,
                    'validation_errors': incoming_errors,
                },
            )

        return fallback_items, source, incoming_errors

    if incoming_cleaned is not None:
        return incoming_cleaned, 'incoming', []

    existing_cleaned, existing_errors = sanitize_fact_items(
        existing_fact_items,
        field_path='existingProfile.factItems',
    )
    if existing_cleaned is not None and not existing_errors:
        return existing_cleaned, 'existing_profile', []

    return [], 'empty_list', []


def clean_career_profile_payload(
    profile: Any,
    *,
    existing_profile: Any = None,
    logger=None,
    field_path: str = 'careerProfile',
):
    existing = existing_profile if isinstance(existing_profile, dict) else {}

    if not isinstance(profile, dict):
        if profile is not None and logger and hasattr(logger, 'warning'):
            logger.warning(
                'career_profile.invalid_type_fallback',
                extra={
                    'event': 'career_profile.invalid_type_fallback',
                    'field_path': field_path,
                    'error_type': 'invalid_type',
                    'detail': 'careerProfile must be object',
                },
            )
        return dict(existing) if existing else None

    cleaned_profile = dict(profile)
    fact_items, source, _errors = resolve_fact_items_with_fallback(
        incoming_fact_items=profile.get('factItems') if 'factItems' in profile else None,
        existing_fact_items=existing.get('factItems'),
        logger=logger,
        field_path=f'{field_path}.factItems',
    )

    if 'factItems' in profile or 'factItems' in existing:
        cleaned_profile['factItems'] = fact_items
        if source != 'incoming' and logger and hasattr(logger, 'warning') and 'factItems' in profile:
            logger.warning(
                'career_profile.fact_items.fallback_applied',
                extra={
                    'event': 'career_profile.fact_items.fallback_applied',
                    'field_path': f'{field_path}.factItems',
                    'fallback_source': source,
                },
            )

    return cleaned_profile


def clean_resume_payload(payload, *, existing_resume_data=None, logger=None):
    if not isinstance(payload, dict):
        return None, '简历数据缺失'

    personal_info = payload.get('personalInfo', {})
    if not isinstance(personal_info, dict):
        personal_info = {}

    cleaned = {
        'personalInfo': {
            'name': clean_string(personal_info.get('name'), 200),
            'title': clean_string(personal_info.get('title'), 200),
            'email': clean_string(personal_info.get('email'), 200),
            'phone': clean_string(personal_info.get('phone'), 100),
            'location': clean_string(personal_info.get('location'), 200),
            'linkedin': clean_string(personal_info.get('linkedin'), 200),
            'website': clean_string(personal_info.get('website'), 200),
            'summary': clean_string(personal_info.get('summary'), 4000),
            'avatar': clean_string(personal_info.get('avatar'), 8000),
            'age': clean_string(personal_info.get('age'), 50)
        },
        'workExps': clean_list_dicts(
            payload.get('workExps'),
            ['id', 'title', 'subtitle', 'date', 'description', 'company', 'position', 'startDate', 'endDate'],
            max_items=50
        ),
        'educations': clean_list_dicts(
            payload.get('educations'),
            ['id', 'title', 'subtitle', 'date', 'school', 'degree', 'major', 'startDate', 'endDate'],
            max_items=50
        ),
        'projects': clean_list_dicts(
            payload.get('projects'),
            ['id', 'title', 'subtitle', 'date', 'description', 'role', 'link'],
            max_items=50
        ),
        'skills': clean_list_strings(payload.get('skills'), max_items=200, max_len=100),
        'summary': clean_string(payload.get('summary'), 4000),
        'gender': clean_string(payload.get('gender'), 20),
        'templateId': clean_string(payload.get('templateId'), 50),
        'optimizationStatus': clean_string(payload.get('optimizationStatus'), 50),
        'optimizedFromId': clean_string(payload.get('optimizedFromId'), 120),
        'lastJdText': clean_string(payload.get('lastJdText'), 8000),
        'targetRole': clean_string(payload.get('targetRole'), 300),
        'targetCompany': clean_string(payload.get('targetCompany'), 300),
    }

    existing_resume = existing_resume_data if isinstance(existing_resume_data, dict) else {}
    if 'careerProfile' in payload or isinstance(existing_resume.get('careerProfile'), dict):
        cleaned_career_profile = clean_career_profile_payload(
            payload.get('careerProfile'),
            existing_profile=existing_resume.get('careerProfile'),
            logger=logger,
            field_path='resumeData.careerProfile',
        )
        if isinstance(cleaned_career_profile, dict):
            cleaned['careerProfile'] = cleaned_career_profile

    analysis_snapshot = payload.get('analysisSnapshot')
    if isinstance(analysis_snapshot, dict):
        cleaned['analysisSnapshot'] = analysis_snapshot

    ai_suggestion_feedback = payload.get('aiSuggestionFeedback')
    if isinstance(ai_suggestion_feedback, dict):
        cleaned['aiSuggestionFeedback'] = ai_suggestion_feedback

    interview_sessions = payload.get('interviewSessions')
    if isinstance(interview_sessions, dict):
        cleaned['interviewSessions'] = interview_sessions

    export_history = payload.get('exportHistory')
    if isinstance(export_history, list):
        cleaned['exportHistory'] = clean_list_dicts(
            export_history,
            ['filename', 'size', 'type', 'exportedAt'],
            max_items=200
        )

    return cleaned, None
