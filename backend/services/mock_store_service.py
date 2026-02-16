def is_mock_mode(supabase_client):
    return supabase_client is None


def mock_supabase_response(data=None, error=None):
    class MockResponse:
        def __init__(self, data=None, error=None):
            self.data = data or []
            self.error = error
    return MockResponse(data, error)


def get_mock_resumes_for_user(mock_resumes, user_id: str):
    if user_id not in mock_resumes:
        mock_resumes[user_id] = {}
    return mock_resumes[user_id]


def normalize_resume_id(value):
    return str(value or '').strip()


def find_existing_optimized_resume(
    current_user_id: str,
    optimized_from_id: str,
    *,
    supabase_client,
    mock_mode,
    get_mock_resumes_for_user_fn,
    logger,
):
    target_id = normalize_resume_id(optimized_from_id)
    if not target_id:
        return None

    if mock_mode:
        for resume in get_mock_resumes_for_user_fn(current_user_id).values():
            resume_data = resume.get('resume_data') or {}
            status = str(resume_data.get('optimizationStatus') or '').strip().lower()
            from_id = normalize_resume_id(resume_data.get('optimizedFromId'))
            if status == 'optimized' and from_id == target_id:
                return resume
        return None

    try:
        result = (
            supabase_client.table('resumes')
            .select('*')
            .eq('user_id', current_user_id)
            .order('updated_at', desc=True)
            .execute()
        )
        for resume in (result.data or []):
            resume_data = resume.get('resume_data') or {}
            status = str(resume_data.get('optimizationStatus') or '').strip().lower()
            from_id = normalize_resume_id(resume_data.get('optimizedFromId'))
            if status == 'optimized' and from_id == target_id:
                return resume
    except Exception as exc:
        logger.warning("find existing optimized resume failed: %s", exc)
    return None
