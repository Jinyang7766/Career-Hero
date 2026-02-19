import os


def get_ocr_model_candidates(vision_models):
    models = []
    for model_name in vision_models or []:
        if not model_name:
            continue
        if model_name not in models:
            models.append(model_name)
    return models


def get_analysis_model_candidates(primary_model):
    speed_priority = str(os.getenv('ANALYSIS_SPEED_PRIORITY', '0')).strip().lower() in ('1', 'true', 'yes', 'on')
    default_primary = 'gemini-3-flash-preview'
    raw_fallback = os.getenv('GEMINI_ANALYSIS_FALLBACK_MODELS', '')
    env_fallback = [item.strip() for item in raw_fallback.split(',') if item.strip()]

    primary = str(primary_model or '').strip() or default_primary
    if 'pro' in primary.lower():
        primary = default_primary

    # Enforce flash-only analysis chain: primary flash -> 2.5 flash -> 2.5 flash lite.
    if speed_priority:
        candidates = ['gemini-2.5-flash', primary, 'gemini-2.5-flash-lite', *env_fallback]
    else:
        candidates = [primary, 'gemini-2.5-flash', 'gemini-2.5-flash-lite', *env_fallback]
    deduped = []
    for model_name in candidates:
        if not model_name:
            continue
        if 'pro' in str(model_name).lower():
            continue
        if model_name not in deduped:
            deduped.append(model_name)
    return deduped


def get_transcribe_model_candidates(primary_model):
    raw_fallback = os.getenv('GEMINI_TRANSCRIBE_FALLBACK_MODELS', '')
    env_fallback = [item.strip() for item in raw_fallback.split(',') if item.strip()]
    candidates = [primary_model, *env_fallback, 'gemini-2.5-flash', 'gemini-2.5-flash-lite']
    deduped = []
    for model_name in candidates:
        if not model_name:
            continue
        if model_name not in deduped:
            deduped.append(model_name)
    return deduped
