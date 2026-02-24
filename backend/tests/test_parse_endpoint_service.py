from flask import Flask, request

from backend.routes.ai_routes import get_json_payload
from backend.services.parse_endpoint_service import parse_resume_core


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
