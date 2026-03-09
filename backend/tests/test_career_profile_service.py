from backend.services.career_profile_service import organize_career_profile_core
from backend.services.payload_sanitizer import clean_resume_payload


class _DummyLogger:
    def __init__(self):
        self.warning_calls = []

    def warning(self, *args, **kwargs):
        self.warning_calls.append((args, kwargs))


def _deps_ai_disabled(logger=None):
    return {
        'logger': logger or _DummyLogger(),
        'gemini_client': None,
        'check_gemini_quota': lambda: False,
        'parse_ai_response': lambda _text: {},
        'analysis_generate_content_resilient': None,
        'get_analysis_model_candidates': lambda: [],
        'GEMINI_RESUME_GENERATION_MODEL': 'gemini-2.5-flash',
        'can_run_analysis_ai': lambda _user_id, _data: False,
    }


def _deps_ai_enabled(parsed_profile, logger=None):
    class _Response:
        text = '{"ok": true}'

    return {
        'logger': logger or _DummyLogger(),
        'gemini_client': object(),
        'check_gemini_quota': lambda: True,
        'parse_ai_response': lambda _text: parsed_profile,
        'analysis_generate_content_resilient': lambda **_kwargs: (_Response(), 'gemini-2.5-flash'),
        'get_analysis_model_candidates': lambda: ['gemini-2.5-flash'],
        'GEMINI_RESUME_GENERATION_MODEL': 'gemini-2.5-flash',
        'can_run_analysis_ai': lambda _user_id, _data: True,
    }


def _build_valid_career_profile_payload(summary='画像'):
    return {
        'summary': summary,
        'targetRole': '资深数据分析师',
        'coreSkills': ['SQL', 'Python'],
        'careerHighlights': ['主导增长分析项目'],
        'constraints': ['仅基于事实'],
        'experiences': [
            {
                'title': '增长运营',
                'period': '2022-2024',
                'organization': '某消费品公司',
                'actions': '主导实验与复盘',
                'results': '复购率提升',
                'skills': ['SQL'],
                'inResume': 'yes',
                'confidence': 'high',
                'evidence': '来自用户自述',
            }
        ],
        'personalInfo': {
            'name': 'A',
            'title': '数据分析师',
            'email': 'a@example.com',
            'phone': '13800000000',
        },
    }


def test_organize_career_profile_requires_input():
    body, status = organize_career_profile_core(
        current_user_id='u1',
        data={'rawExperienceText': ''},
        deps=_deps_ai_disabled(),
    )

    assert status == 400
    assert isinstance(body, dict)
    assert 'error' in body


def test_organize_career_profile_returns_fallback_profile_when_ai_disabled():
    body, status = organize_career_profile_core(
        current_user_id='u1',
        data={
            'rawExperienceText': (
                '2022-2024 在某消费品公司负责电商增长。'
                '主导A/B实验和CRM分层触达，复购率明显提升。'
            ),
        },
        deps=_deps_ai_disabled(),
    )

    assert status == 200
    assert body.get('success') is True
    profile = body.get('profile')
    assert isinstance(profile, dict)
    assert profile.get('source') == 'manual_self_report'
    assert isinstance(profile.get('summary'), str) and profile.get('summary')
    assert isinstance(profile.get('constraints'), list) and profile.get('constraints')
    assert isinstance(profile.get('experiences'), list) and profile.get('experiences')


def test_organize_career_profile_accepts_valid_fact_items_from_ai_payload():
    parsed = {
        'summary': '候选人有增长与数据分析经验。',
        'careerHighlights': ['负责电商增长策略'],
        'coreSkills': ['SQL'],
        'constraints': ['不虚构经历'],
        'factItems': [
            {
                'id': 'fact_1',
                'kind': 'skill',
                'text': 'SQL',
                'key': 'sql',
                'aliases': ['highlight'],
            }
        ],
        'experiences': [
            {
                'title': '增长运营',
                'actions': '负责实验与复盘',
            }
        ],
    }

    body, status = organize_career_profile_core(
        current_user_id='u1',
        data={
            'rawExperienceText': (
                '2022-2024 在某消费品公司负责电商增长。'
                '主导A/B实验和CRM分层触达，复购率明显提升。'
            ),
            'existingProfile': {
                'factItems': [
                    {
                        'id': 'old_1',
                        'kind': 'highlight',
                        'text': '旧画像亮点',
                        'key': 'old-highlight',
                    }
                ]
            },
        },
        deps=_deps_ai_enabled(parsed),
    )

    assert status == 200
    profile = body.get('profile') or {}
    fact_items = profile.get('factItems')
    assert isinstance(fact_items, list)
    assert len(fact_items) == 1
    assert fact_items[0]['id'] == 'fact_1'
    assert fact_items[0]['kind'] == 'skill'


def test_organize_career_profile_normalizes_core_skills_with_shared_skill_rules():
    parsed = {
        'summary': '候选人有增长与数据分析经验。',
        'coreSkills': [
            '核心技能：Python、SQL、A/B Testing',
            'Power BI',
            '沟通协作',
            '这是一个过长的技能描述用于验证会被裁剪到合理范围并保持可读',
        ],
        'experiences': [
            {
                'title': '增长运营',
                'actions': '负责实验与复盘',
            }
        ],
    }

    body, status = organize_career_profile_core(
        current_user_id='u1',
        data={
            'rawExperienceText': (
                '2022-2024 在某消费品公司负责电商增长。'
                '主导A/B实验和CRM分层触达，复购率明显提升。'
            ),
        },
        deps=_deps_ai_enabled(parsed),
    )

    assert status == 200
    profile = body.get('profile') or {}
    skills = profile.get('coreSkills') or []

    assert 'Python' in skills
    assert 'SQL' in skills
    assert 'A/B Test' in skills
    assert 'Power BI' in skills
    assert '沟通协作' not in skills
    assert len(skills) <= 12
    assert all(isinstance(item, str) and len(item) <= 36 for item in skills)


def test_organize_career_profile_fallbacks_to_existing_fact_items_on_invalid_input_and_logs_errors():
    logger = _DummyLogger()
    parsed = {
        'summary': '候选人有增长与数据分析经验。',
        'factItems': [
            {
                'id': 'broken_fact',
                'kind': 'unknown-kind',
                'text': '无效事实',
                'key': 'broken',
            }
        ],
        'experiences': [
            {
                'title': '增长运营',
                'actions': '负责实验与复盘',
            }
        ],
    }
    existing_fact_items = [
        {
            'id': 'old_1',
            'kind': 'highlight',
            'text': '历史亮点',
            'key': 'legacy-highlight',
        }
    ]

    body, status = organize_career_profile_core(
        current_user_id='u1',
        data={
            'rawExperienceText': (
                '2022-2024 在某消费品公司负责电商增长。'
                '主导A/B实验和CRM分层触达，复购率明显提升。'
            ),
            'existingProfile': {'factItems': existing_fact_items},
        },
        deps=_deps_ai_enabled(parsed, logger=logger),
    )

    assert status == 200
    profile = body.get('profile') or {}
    assert profile.get('factItems') == existing_fact_items

    validation_warnings = [
        call for call in logger.warning_calls
        if call[0] and call[0][0] == 'career_profile.fact_items.validation_failed'
    ]
    assert validation_warnings

    extra = validation_warnings[0][1].get('extra') or {}
    errors = extra.get('validation_errors') or []
    assert any(
        err.get('path') == 'profile.factItems[0].kind' and err.get('error_type') == 'invalid_enum'
        for err in errors
    )


def test_clean_resume_payload_keeps_valid_career_profile_fact_items():
    payload = {
        'personalInfo': {'name': 'A'},
        'careerProfile': {
            'summary': '画像',
            'factItems': [
                {
                    'id': 'fact_1',
                    'kind': 'constraint',
                    'text': '仅用事实',
                    'key': 'constraint_fact',
                    'aliases': ['highlight'],
                }
            ],
        },
    }

    cleaned, err = clean_resume_payload(payload)

    assert err is None
    assert isinstance(cleaned, dict)
    assert cleaned.get('careerProfile', {}).get('factItems') == payload['careerProfile']['factItems']


def test_clean_resume_payload_fallbacks_fact_items_to_existing_profile_when_invalid():
    logger = _DummyLogger()
    existing_fact_items = [
        {
            'id': 'old_1',
            'kind': 'skill',
            'text': 'Python',
            'key': 'python',
        }
    ]
    payload = {
        'personalInfo': {'name': 'A'},
        'careerProfile': {
            'summary': '画像',
            'factItems': [
                {
                    'id': 'broken_1',
                    'kind': 'invalid-kind',
                    'text': '无效事实',
                    'key': 'broken',
                }
            ],
        },
    }

    cleaned, err = clean_resume_payload(
        payload,
        existing_resume_data={
            'careerProfile': {
                'factItems': existing_fact_items,
            }
        },
        logger=logger,
    )

    assert err is None
    assert cleaned.get('careerProfile', {}).get('factItems') == existing_fact_items

    validation_warnings = [
        call for call in logger.warning_calls
        if call[0] and call[0][0] == 'career_profile.fact_items.validation_failed'
    ]
    assert validation_warnings

    extra = validation_warnings[0][1].get('extra') or {}
    errors = extra.get('validation_errors') or []
    assert any(
        err_item.get('path') == 'resumeData.careerProfile.factItems[0].kind'
        and err_item.get('error_type') == 'invalid_enum'
        for err_item in errors
    )


def test_clean_resume_payload_accepts_valid_career_profile_main_fields_for_write():
    payload = {
        'personalInfo': {'name': 'A'},
        'careerProfile': _build_valid_career_profile_payload(summary='新画像'),
    }

    cleaned, err = clean_resume_payload(
        payload,
        existing_resume_data={
            'careerProfile': _build_valid_career_profile_payload(summary='旧画像'),
        },
    )

    assert err is None
    assert cleaned.get('careerProfile', {}).get('summary') == '新画像'
    assert cleaned.get('careerProfile', {}).get('experiences', [{}])[0].get('title') == '增长运营'


def test_clean_resume_payload_main_field_validation_failure_keeps_existing_profile():
    logger = _DummyLogger()
    existing_profile = _build_valid_career_profile_payload(summary='历史画像')
    payload = {
        'personalInfo': {'name': 'A'},
        'careerProfile': {
            **_build_valid_career_profile_payload(summary='损坏画像'),
            'coreSkills': 'SQL',
        },
    }

    cleaned, err = clean_resume_payload(
        payload,
        existing_resume_data={'careerProfile': existing_profile},
        logger=logger,
    )

    assert err is None
    assert cleaned.get('careerProfile') == existing_profile


def test_clean_resume_payload_main_field_validation_logs_path_and_reason():
    logger = _DummyLogger()
    payload = {
        'personalInfo': {'name': 'A'},
        'careerProfile': {
            **_build_valid_career_profile_payload(summary='损坏画像'),
            'experiences': [
                {
                    **_build_valid_career_profile_payload()['experiences'][0],
                    'title': 123,
                }
            ],
        },
    }

    cleaned, err = clean_resume_payload(
        payload,
        existing_resume_data={
            'careerProfile': _build_valid_career_profile_payload(summary='历史画像'),
        },
        logger=logger,
    )

    assert err is None
    assert cleaned.get('careerProfile', {}).get('summary') == '历史画像'

    validation_warnings = [
        call for call in logger.warning_calls
        if call[0] and call[0][0] == 'career_profile.main_fields.validation_failed'
    ]
    assert validation_warnings

    extra = validation_warnings[0][1].get('extra') or {}
    errors = extra.get('validation_errors') or []
    assert any(
        err_item.get('path') == 'resumeData.careerProfile.experiences[0].title'
        and err_item.get('error_type') == 'invalid_type'
        and err_item.get('detail') == 'expected string'
        for err_item in errors
    )


def test_clean_resume_payload_reads_legacy_target_company_into_target_role():
    payload = {
        'personalInfo': {'name': 'A'},
        'targetCompany': '资深数据分析师',
    }

    cleaned, err = clean_resume_payload(payload)

    assert err is None
    assert cleaned.get('targetRole') == '资深数据分析师'
    assert cleaned.get('targetCompany') == ''


def test_clean_resume_payload_prefers_target_role_and_clears_target_company():
    payload = {
        'personalInfo': {'name': 'A'},
        'targetRole': '算法工程师',
        'targetCompany': '旧字段残留',
    }

    cleaned, err = clean_resume_payload(payload)

    assert err is None
    assert cleaned.get('targetRole') == '算法工程师'
    assert cleaned.get('targetCompany') == ''
