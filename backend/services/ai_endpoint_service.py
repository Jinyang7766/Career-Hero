"""Compatibility facade for AI endpoint services.

This module keeps historical import paths stable while delegating to split services.
"""

try:
    from services.ai_endpoint_prompt_service import (
        ANALYSIS_PROMPT_VERSION,
        _build_analysis_prompt,
        _resolve_micro_interview_first_question,
    )
    from services.ai_endpoint_shared_service import (
        PIIMasker,
        _normalize_company_confidence,
        _fallback_extract_company_with_confidence,
        _fallback_extract_company_from_jd,
    )
    from services.ai_endpoint_suggestion_service import (
        _collect_resume_numeric_tokens,
        _normalize_suggestion_metric_text,
        _sanitize_suggestions_for_metric_consistency,
        _format_diagnosis_dossier,
        _split_into_sentences,
        _is_sentence_low_value,
        _extract_sentence_issue,
        _rewrite_sentence_human,
        _split_compound_suggestions,
        _normalize_training_day_labels,
        _collect_resume_fragments_for_coverage,
        _ensure_sentence_level_coverage,
        _sanitize_final_stage_suggestions,
        _compact_text,
        _merge_duplicate_suggestions,
        _prioritize_final_stage_suggestions,
        _build_final_stage_annotation_suggestions,
    )
    from services.ai_endpoint_analysis_service import analyze_resume_core
    from services.ai_endpoint_ocr_service import parse_screenshot_core
    from services.ai_endpoint_chat_service import (
        _decode_audio_payload,
        _transcribe_audio_with_gemini,
        ai_chat_core,
        ai_chat_stream_core,
        transcribe_core,
    )
except ImportError:
    from backend.services.ai_endpoint_prompt_service import (
        ANALYSIS_PROMPT_VERSION,
        _build_analysis_prompt,
        _resolve_micro_interview_first_question,
    )
    from backend.services.ai_endpoint_shared_service import (
        PIIMasker,
        _normalize_company_confidence,
        _fallback_extract_company_with_confidence,
        _fallback_extract_company_from_jd,
    )
    from backend.services.ai_endpoint_suggestion_service import (
        _collect_resume_numeric_tokens,
        _normalize_suggestion_metric_text,
        _sanitize_suggestions_for_metric_consistency,
        _format_diagnosis_dossier,
        _split_into_sentences,
        _is_sentence_low_value,
        _extract_sentence_issue,
        _rewrite_sentence_human,
        _split_compound_suggestions,
        _normalize_training_day_labels,
        _collect_resume_fragments_for_coverage,
        _ensure_sentence_level_coverage,
        _sanitize_final_stage_suggestions,
        _compact_text,
        _merge_duplicate_suggestions,
        _prioritize_final_stage_suggestions,
        _build_final_stage_annotation_suggestions,
    )
    from backend.services.ai_endpoint_analysis_service import analyze_resume_core
    from backend.services.ai_endpoint_ocr_service import parse_screenshot_core
    from backend.services.ai_endpoint_chat_service import (
        _decode_audio_payload,
        _transcribe_audio_with_gemini,
        ai_chat_core,
        ai_chat_stream_core,
        transcribe_core,
    )
