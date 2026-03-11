# -*- coding: utf-8 -*-
import re
from typing import Any, Dict, List, Optional, Tuple

from .career_profile_validation_observability import (
    build_validation_error_observability_fields,
)

FACT_ITEM_KINDS = {'skill', 'highlight', 'constraint'}

CAREER_PROFILE_MAIN_FIELD_SCHEMA = {
    'type': 'object',
    'properties': {
        'summary': {'type': 'string'},
        'targetRole': {'type': 'string'},
        'jobDirection': {'type': 'string'},
        'mbti': {'type': 'string'},
        'personality': {'type': 'string'},
        'workStyle': {'type': 'string'},
        'careerGoal': {'type': 'string'},
        'targetSalary': {'type': 'string'},
        'gender': {'type': 'string'},
        'careerHighlights': {'type': 'array', 'items': {'type': 'string'}},
        'coreSkills': {'type': 'array', 'items': {'type': 'string'}},
        'constraints': {'type': 'array', 'items': {'type': 'string'}},
        'experiences': {
            'type': 'array',
            'items': {
                'type': 'object',
                'properties': {
                    'title': {'type': 'string'},
                    'period': {'type': 'string'},
                    'organization': {'type': 'string'},
                    'actions': {'type': 'string'},
                    'results': {'type': 'string'},
                    'skills': {'type': 'array', 'items': {'type': 'string'}},
                    'inResume': {'type': 'string', 'enum': ['yes', 'no', 'unknown']},
                    'confidence': {'type': 'string', 'enum': ['high', 'medium', 'low']},
                    'evidence': {'type': 'string'},
                },
                'additionalProperties': True,
            },
        },
        'educations': {
            'type': 'array',
            'items': {
                'type': 'object',
                'properties': {
                    'id': {'type': ['string', 'number', 'integer']},
                    'school': {'type': 'string'},
                    'degree': {'type': 'string'},
                    'major': {'type': 'string'},
                    'period': {'type': 'string'},
                    'description': {'type': 'string'},
                },
                'additionalProperties': True,
            },
        },
        'projects': {
            'type': 'array',
            'items': {
                'type': 'object',
                'properties': {
                    'id': {'type': ['string', 'number', 'integer']},
                    'title': {'type': 'string'},
                    'subtitle': {'type': 'string'},
                    'period': {'type': 'string'},
                    'description': {'type': 'string'},
                    'link': {'type': 'string'},
                },
                'additionalProperties': True,
            },
        },
        'personalInfo': {
            'type': 'object',
            'properties': {
                'name': {'type': 'string'},
                'title': {'type': 'string'},
                'email': {'type': 'string'},
                'phone': {'type': 'string'},
                'location': {'type': 'string'},
                'linkedin': {'type': 'string'},
                'website': {'type': 'string'},
                'age': {'type': 'string'},
                'gender': {'type': 'string'},
            },
            'additionalProperties': True,
        },
    },
    'additionalProperties': True,
}


def _matches_schema_type(value: Any, expected_type: str) -> bool:
    if expected_type == 'string':
        return isinstance(value, str)
    if expected_type == 'object':
        return isinstance(value, dict)
    if expected_type == 'array':
        return isinstance(value, list)
    if expected_type == 'number':
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected_type == 'integer':
        return isinstance(value, int) and not isinstance(value, bool)
    if expected_type == 'boolean':
        return isinstance(value, bool)
    if expected_type == 'null':
        return value is None
    return False


def _schema_type_label(expected_type: Any) -> str:
    if isinstance(expected_type, list):
        return '|'.join(str(item) for item in expected_type)
    return str(expected_type)


def _validate_json_schema(value: Any, schema: Dict[str, Any], path: str) -> List[Dict[str, str]]:
    errors: List[Dict[str, str]] = []

    expected_type = schema.get('type')
    if expected_type:
        expected_types = expected_type if isinstance(expected_type, list) else [expected_type]
        if not any(_matches_schema_type(value, str(item)) for item in expected_types):
            errors.append(
                _error(
                    path,
                    'invalid_type',
                    f'expected {_schema_type_label(expected_type)}',
                )
            )
            return errors

    enum_values = schema.get('enum')
    if enum_values is not None and value not in enum_values:
        errors.append(
            _error(
                path,
                'invalid_enum',
                f"value must be one of {', '.join(str(item) for item in enum_values)}",
            )
        )

    if isinstance(value, dict):
        properties = schema.get('properties') if isinstance(schema.get('properties'), dict) else {}
        required_fields = schema.get('required') if isinstance(schema.get('required'), list) else []

        for required_key in required_fields:
            if required_key not in value:
                errors.append(_error(f'{path}.{required_key}', 'required', f'{required_key} is required'))

        for key, item in value.items():
            next_path = f'{path}.{key}'
            if key in properties:
                errors.extend(_validate_json_schema(item, properties[key], next_path))
                continue
            if schema.get('additionalProperties', True) is False:
                errors.append(_error(next_path, 'additional_property', 'unexpected field'))

    if isinstance(value, list):
        item_schema = schema.get('items')
        if isinstance(item_schema, dict):
            for idx, item in enumerate(value):
                errors.extend(_validate_json_schema(item, item_schema, f'{path}[{idx}]'))

    return errors


def validate_career_profile_main_fields(
    profile: Any,
    *,
    field_path: str = 'careerProfile',
) -> List[Dict[str, str]]:
    if not isinstance(profile, dict):
        return [_error(field_path, 'invalid_type', 'careerProfile must be object')]

    profile_main_fields = {
        key: profile.get(key)
        for key in CAREER_PROFILE_MAIN_FIELD_SCHEMA['properties'].keys()
        if key in profile
    }

    if not profile_main_fields:
        return []

    return _validate_json_schema(profile_main_fields, CAREER_PROFILE_MAIN_FIELD_SCHEMA, field_path)


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
                    **build_validation_error_observability_fields(incoming_errors, scope='fact_items'),
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

    if profile is None:
        return dict(existing) if existing else None

    if not isinstance(profile, dict):
        if logger and hasattr(logger, 'warning'):
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

    main_field_errors = validate_career_profile_main_fields(profile, field_path=field_path)
    if main_field_errors:
        fallback_source = 'existing_profile' if existing else 'empty_value'
        if logger and hasattr(logger, 'warning'):
            logger.warning(
                'career_profile.main_fields.validation_failed',
                extra={
                    'event': 'career_profile.main_fields.validation_failed',
                    'field_path': field_path,
                    'fallback_source': fallback_source,
                    'validation_errors': main_field_errors,
                    **build_validation_error_observability_fields(main_field_errors, scope='main_fields'),
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

    normalized_target_role = clean_string(payload.get('targetRole'), 300)
    if not normalized_target_role:
        # Backward-compatible read for legacy payloads.
        normalized_target_role = clean_string(payload.get('targetCompany'), 300)

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
        'targetRole': normalized_target_role,
        'targetCompany': '',
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
