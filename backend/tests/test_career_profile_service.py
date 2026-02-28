from backend.services.career_profile_service import organize_career_profile_core


class _DummyLogger:
    def warning(self, *_args, **_kwargs):
        return None


def _deps_ai_disabled():
    return {
        'logger': _DummyLogger(),
        'gemini_client': None,
        'check_gemini_quota': lambda: False,
        'parse_ai_response': lambda _text: {},
        'analysis_generate_content_resilient': None,
        'get_analysis_model_candidates': lambda: [],
        'GEMINI_RESUME_GENERATION_MODEL': 'gemini-2.5-flash',
        'can_run_analysis_ai': lambda _user_id, _data: False,
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
