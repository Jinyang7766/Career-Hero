from backend.services.auth_user_service import get_templates


def test_get_templates_returns_expected_shape():
    payload, status = get_templates()

    assert status == 200
    assert isinstance(payload, dict)
    assert "templates" in payload
    assert isinstance(payload["templates"], list)
    assert len(payload["templates"]) >= 3

    first_template = payload["templates"][0]
    assert isinstance(first_template, dict)
    assert "id" in first_template
    assert "name" in first_template
    assert "description" in first_template
    assert "preview" in first_template

