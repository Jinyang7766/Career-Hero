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
    raw_fallback = os.getenv('GEMINI_ANALYSIS_FALLBACK_MODELS', '')
    env_fallback = [item.strip() for item in raw_fallback.split(',') if item.strip()]
    candidates = [primary_model, *env_fallback, 'gemini-2.5-flash', 'gemini-2.5-flash-lite']
    deduped = []
    for model_name in candidates:
        if not model_name:
            continue
        if model_name not in deduped:
            deduped.append(model_name)
    return deduped
