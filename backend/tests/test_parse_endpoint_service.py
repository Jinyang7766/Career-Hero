from backend.services.parse_endpoint_service import parse_resume_core


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
