from __future__ import annotations

from typing import Any, Dict


_ANALYSIS_SOURCES = {
    'diagnosis_generated',
    'analysis_generated',
    'interview_refined',
}


def _to_text(value: Any) -> str:
    return str(value or '').strip()


def _to_normalized(value: Any) -> str:
    return _to_text(value).lower()


def _is_non_empty_dict(value: Any) -> bool:
    return isinstance(value, dict) and len(value) > 0


def is_resume_eligible_for_library(resume_data: Dict[str, Any] | Any) -> bool:
    if not isinstance(resume_data, dict):
        return False

    optimization_status = _to_normalized(resume_data.get('optimizationStatus'))
    if optimization_status == 'optimized':
        return True

    if _to_text(resume_data.get('analysisReportId')):
        return True
    if _to_text(resume_data.get('optimizationJdKey')):
        return True

    if _is_non_empty_dict(resume_data.get('analysisSnapshot')):
        return True
    if _is_non_empty_dict(resume_data.get('analysisDossierLatest')):
        return True
    if _is_non_empty_dict(resume_data.get('analysisBindings')):
        return True
    if _is_non_empty_dict(resume_data.get('analysisSessionByJd')):
        return True

    source = _to_normalized(
        resume_data.get('source')
        or resume_data.get('resumeSource')
        or resume_data.get('generatedSource')
    )
    if source in _ANALYSIS_SOURCES:
        return True

    return False

