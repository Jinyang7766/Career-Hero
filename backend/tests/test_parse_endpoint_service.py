import json

from flask import Flask, request

from backend.routes.ai_routes import get_json_payload
from backend.services.parse_endpoint_service import parse_resume_core
from backend.services.ai_endpoint_analysis_service import _sanitize_visibility_leaking_suggestions
from backend.services.ai_endpoint_prompt_service import _build_analysis_prompt
from backend.services.resume_generation_service import generate_optimized_resume


def test_get_json_payload_preserves_list_payload():
    app = Flask(__name__)
    with app.test_request_context(
        '/api/ai/parse-resume',
        method='POST',
        data='[]',
        content_type='application/json',
    ):
        assert get_json_payload(request) == []


def test_get_json_payload_preserves_scalar_payload():
    app = Flask(__name__)
    with app.test_request_context(
        '/api/ai/parse-resume',
        method='POST',
        data='"abc"',
        content_type='application/json',
    ):
        assert get_json_payload(request) == 'abc'


def test_get_json_payload_falls_back_to_empty_dict_for_invalid_json():
    app = Flask(__name__)
    with app.test_request_context(
        '/api/ai/parse-resume',
        method='POST',
        data='{"invalid":',
        content_type='application/json',
    ):
        assert get_json_payload(request) == {}


def test_parse_resume_core_rejects_non_object_payload():
    body, status = parse_resume_core(
        'not-an-object',
        {'parse_resume_text_with_ai': lambda _: {'ok': True}},
    )
    assert status == 400
    assert body.get('error') == '请求体必须为 JSON 对象'


def test_parse_resume_core_rejects_numeric_payload():
    body, status = parse_resume_core(
        123,
        {'parse_resume_text_with_ai': lambda _: {'ok': True}},
    )
    assert status == 400
    assert body.get('error') == '请求体必须为 JSON 对象'


def test_parse_resume_core_rejects_list_payload():
    body, status = parse_resume_core(
        [],
        {'parse_resume_text_with_ai': lambda _: {'ok': True}},
    )
    assert status == 400
    assert body.get('error') == '请求体必须为 JSON 对象'


def test_parse_resume_core_rejects_empty_text():
    body, status = parse_resume_core(
        {'resumeText': ''},
        {'parse_resume_text_with_ai': lambda _: {'ok': True}},
    )
    assert status == 400
    assert body.get('error') == '简历文本不能为空'


def test_parse_resume_core_rejects_non_string_text():
    body, status = parse_resume_core(
        {'resumeText': None},
        {'parse_resume_text_with_ai': lambda _: {'ok': True}},
    )
    assert status == 400
    assert body.get('error') == '简历文本必须为字符串'


def test_parse_resume_core_passes_valid_text_to_parser():
    called = {'value': None}

    def _parse(text):
        called['value'] = text
        return {'skills': ['Python']}

    body, status = parse_resume_core(
        {'resumeText': '有效简历内容'},
        {'parse_resume_text_with_ai': _parse},
    )
    assert status == 200
    assert body.get('success') is True
    assert body.get('data') == {'skills': ['Python']}
    assert called['value'] == '有效简历内容'


def test_build_analysis_prompt_uses_jd_gap_narrative_when_jd_provided():
    prompt = _build_analysis_prompt(
        resume_data={'personalInfo': {'name': 'A'}},
        job_description='负责数据分析与SQL建模',
        rag_context='',
        format_resume_for_ai=lambda _: '简历内容',
        analysis_stage='final_report',
        interview_summary='',
        interview_chat_history='',
        diagnosis_context='',
        career_profile_context='',
    )

    assert '"summary": "JD' in prompt
    assert '"summary": "候选人综合匹配度评估简述' not in prompt


def test_generate_optimized_resume_fallback_still_aligns_jd_keywords_into_skills():
    resume_data = {
        'personalInfo': {'name': '候选人'},
        'workExps': [],
        'educations': [],
        'projects': [],
        'skills': ['沟通协作'],
        'summary': '有数据分析经验',
    }

    generated = generate_optimized_resume(
        gemini_client=None,
        check_gemini_quota=lambda: False,
        gemini_analysis_model='gemini-2.5-flash',
        parse_ai_response=lambda _: {},
        format_resume_for_ai=lambda _: 'resume',
        logger=type('L', (), {
            'error': lambda *args, **kwargs: None,
            'warning': lambda *args, **kwargs: None,
            'info': lambda *args, **kwargs: None,
        })(),
        resume_data=resume_data,
        chat_history=[],
        score=70,
        suggestions=[],
        career_profile=None,
        job_description='需要熟悉 Python、SQL、Tableau，具备数据分析能力',
        target_role='数据分析师',
    )

    skills = [str(x) for x in (generated.get('skills') or [])]
    joined = ' '.join(skills).lower()
    assert 'python' in joined
    assert 'sql' in joined


class _FakeGeminiClient:
    def __init__(self, payload):
        self._payload = payload
        self.models = self

    def generate_content(self, **_kwargs):
        return type('Response', (), {'text': json.dumps(self._payload, ensure_ascii=False)})()


class _SilentLogger:
    def info(self, *_args, **_kwargs):
        return None

    def warning(self, *_args, **_kwargs):
        return None

    def error(self, *_args, **_kwargs):
        return None


def test_generate_optimized_resume_strips_mbti_and_preference_leakage():
    resume_data = {
        'personalInfo': {
            'name': '候选人',
            'title': '数据分析师',
            'email': 'candidate@example.com',
            'phone': '13800138000',
            'location': '上海',
        },
        'workExps': [
            {
                'id': 1,
                'company': '示例科技',
                'position': '数据分析师',
                'startDate': '2022-01',
                'endDate': '2024-01',
                'description': '负责数据分析与可视化看板建设。',
            }
        ],
        'educations': [],
        'projects': [
            {
                'id': 1,
                'title': '增长分析项目',
                'subtitle': '项目负责人',
                'startDate': '2023-01',
                'endDate': '2023-08',
                'description': '搭建指标体系并优化投放策略。',
            }
        ],
        'skills': ['Python', 'SQL'],
        'summary': '3年数据分析经验，擅长业务诊断与增长分析。',
    }
    career_profile = {
        'mbti': 'INTJ',
        'workStyle': '偏好远程办公',
        'careerGoal': '希望两年内转管理岗',
        'targetSalary': '30K-40K',
        'constraints': ['仅接受远程办公'],
    }

    ai_payload = {
        'resumeData': {
            'personalInfo': {
                'name': '候选人',
                'title': '数据分析师',
                'email': 'candidate@example.com',
                'phone': '13800138000',
                'location': '上海',
            },
            'workExps': [
                {
                    'id': 1,
                    'company': '示例科技',
                    'position': '数据分析师',
                    'startDate': '2022-01',
                    'endDate': '2024-01',
                    'description': '我是INTJ，偏好远程办公，仅接受远程办公，并希望两年内转管理岗。',
                }
            ],
            'educations': [],
            'projects': [
                {
                    'id': 1,
                    'title': '增长分析项目',
                    'subtitle': '项目负责人',
                    'startDate': '2023-01',
                    'endDate': '2023-08',
                    'description': '期望薪资30K-40K，偏好远程办公。',
                }
            ],
            'skills': ['Python', 'INTJ', '仅接受远程办公'],
            'summary': '我是INTJ，偏好远程办公，期望薪资30K-40K。',
        }
    }

    generated = generate_optimized_resume(
        gemini_client=_FakeGeminiClient(ai_payload),
        check_gemini_quota=lambda: True,
        gemini_analysis_model='gemini-2.5-flash',
        parse_ai_response=lambda text: json.loads(text),
        format_resume_for_ai=lambda _: 'resume',
        logger=_SilentLogger(),
        resume_data=resume_data,
        chat_history=[],
        score=72,
        suggestions=[],
        career_profile=career_profile,
        job_description='',
        target_role='数据分析师',
        enable_verify_pass=False,
    )

    serialized = json.dumps(generated, ensure_ascii=False)
    assert 'INTJ' not in serialized
    assert '远程办公' not in serialized
    assert '30K-40K' not in serialized
    assert '希望两年内转管理岗' not in serialized


def test_analysis_suggestions_filter_mbti_and_preference_raw_text():
    suggestions = [
        {
            'id': 's1',
            'targetSection': 'summary',
            'suggestedValue': '我是INTJ，偏好远程办公。',
        },
        {
            'id': 's2',
            'targetSection': 'skills',
            'suggestedValue': ['Python', 'INTJ', '仅接受远程办公'],
        },
        {
            'id': 's3',
            'targetSection': 'workExps',
            'suggestedValue': '主导数据看板搭建并推动转化效率提升。',
        },
    ]

    profile = {
        'workStyle': '偏好远程办公',
        'constraints': ['仅接受远程办公'],
    }

    cleaned = _sanitize_visibility_leaking_suggestions(suggestions, profile)

    assert len(cleaned) == 2
    kept_ids = {item.get('id') for item in cleaned}
    assert 's1' not in kept_ids
    assert 's3' in kept_ids
    skills_item = next(item for item in cleaned if item.get('id') == 's2')
    assert skills_item.get('suggestedValue') == ['Python']
