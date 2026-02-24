from types import SimpleNamespace


def stable_percent_bucket(seed: str) -> int:
    import hashlib
    digest = hashlib.sha256(str(seed or '').encode('utf-8')).hexdigest()
    return int(digest[:8], 16) % 100


def should_route_analysis_to_deepseek(
    *,
    current_user_id: str,
    data: dict,
    analysis_llm_mode: str,
    analysis_deepseek_ratio: int,
) -> bool:
    if analysis_llm_mode == 'deepseek':
        return True
    if analysis_llm_mode == 'gemini':
        return False
    if analysis_llm_mode != 'ab':
        return False

    resume_id = str((data or {}).get('resumeId') or '')
    jd_text = str((data or {}).get('jobDescription') or '')
    seed = f"{current_user_id}|{resume_id}|{len(jd_text)}"
    return stable_percent_bucket(seed) < analysis_deepseek_ratio


def deepseek_generate_json(
    prompt: str,
    *,
    deepseek_api_key: str,
    deepseek_base_url: str,
    deepseek_model: str,
    requests_module,
    timeout_seconds: int = 90,
):
    if not deepseek_api_key:
        raise RuntimeError('DEEPSEEK_API_KEY not configured')

    response = requests_module.post(
        f"{deepseek_base_url}/chat/completions",
        headers={
            'Authorization': f'Bearer {deepseek_api_key}',
            'Content-Type': 'application/json',
        },
        json={
            'model': deepseek_model,
            'messages': [{'role': 'user', 'content': prompt}],
            'temperature': 0.2,
            'response_format': {'type': 'json_object'},
        },
        timeout=timeout_seconds,
    )
    response.raise_for_status()
    payload = response.json() or {}
    choices = payload.get('choices') or []
    if not choices:
        raise RuntimeError('DeepSeek returned empty choices')

    message = choices[0].get('message') or {}
    content = message.get('content')
    if isinstance(content, list):
        text_parts = []
        for part in content:
            if isinstance(part, dict):
                txt = part.get('text')
                if txt:
                    text_parts.append(str(txt))
        content = ''.join(text_parts)

    text = str(content or '').strip()
    if not text:
        raise RuntimeError('DeepSeek returned empty content')
    return SimpleNamespace(text=text), str(payload.get('model') or deepseek_model)


def analysis_generate_content_resilient(
    *,
    current_user_id: str,
    data: dict,
    prompt: str,
    analysis_models_tried,
    analysis_llm_mode: str,
    analysis_deepseek_ratio: int,
    deepseek_api_key: str,
    deepseek_base_url: str,
    deepseek_model: str,
    requests_module,
    logger,
    gemini_generate_json_fn,
):
    use_deepseek = should_route_analysis_to_deepseek(
        current_user_id=current_user_id,
        data=data,
        analysis_llm_mode=analysis_llm_mode,
        analysis_deepseek_ratio=analysis_deepseek_ratio,
    )
    if use_deepseek:
        try:
            response, model_name = deepseek_generate_json(
                prompt,
                deepseek_api_key=deepseek_api_key,
                deepseek_base_url=deepseek_base_url,
                deepseek_model=deepseek_model,
                requests_module=requests_module,
            )
            return response, f"deepseek:{model_name}"
        except Exception as deepseek_error:
            logger.warning("DeepSeek analysis failed, fallback to Gemini: %s", deepseek_error)

    last_error = None
    for model_name in (analysis_models_tried or []):
        try:
            return gemini_generate_json_fn(model_name, prompt, want_json=True)
        except Exception as model_error:
            last_error = model_error
            logger.warning("Analysis model failed: %s, error=%s", model_name, model_error)

    if use_deepseek and not analysis_models_tried:
        raise RuntimeError("No available analysis model (DeepSeek failed; Gemini candidates empty)")
    raise last_error or RuntimeError("No available analysis model")


def can_run_analysis_ai(
    *,
    current_user_id: str,
    data: dict,
    analysis_llm_mode: str,
    analysis_deepseek_ratio: int,
    deepseek_api_key: str,
    gemini_client,
    check_gemini_quota_fn,
) -> bool:
    use_deepseek = should_route_analysis_to_deepseek(
        current_user_id=current_user_id,
        data=data,
        analysis_llm_mode=analysis_llm_mode,
        analysis_deepseek_ratio=analysis_deepseek_ratio,
    )
    if use_deepseek and deepseek_api_key:
        return True
    return bool(gemini_client and check_gemini_quota_fn())
