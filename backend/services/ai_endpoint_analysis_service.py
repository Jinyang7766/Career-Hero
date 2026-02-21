import re
import copy
import traceback

try:
    from services.ai_endpoint_prompt_service import (
        ANALYSIS_PROMPT_VERSION,
        _build_analysis_prompt,
        _resolve_micro_interview_first_question,
    )
    from services.ai_endpoint_suggestion_service import (
        _format_diagnosis_dossier,
        _sanitize_suggestions_for_metric_consistency,
        _ensure_sentence_level_coverage,
        _merge_duplicate_suggestions,
        _build_final_stage_annotation_suggestions,
    )
    from services.ai_endpoint_shared_service import (
        PIIMasker,
        _normalize_company_confidence,
        _fallback_extract_company_with_confidence,
    )
except ImportError:
    from backend.services.ai_endpoint_prompt_service import (
        ANALYSIS_PROMPT_VERSION,
        _build_analysis_prompt,
        _resolve_micro_interview_first_question,
    )
    from backend.services.ai_endpoint_suggestion_service import (
        _format_diagnosis_dossier,
        _sanitize_suggestions_for_metric_consistency,
        _ensure_sentence_level_coverage,
        _merge_duplicate_suggestions,
        _build_final_stage_annotation_suggestions,
    )
    from backend.services.ai_endpoint_shared_service import (
        PIIMasker,
        _normalize_company_confidence,
        _fallback_extract_company_with_confidence,
    )

def analyze_resume_core(current_user_id, data, deps):
    logger = deps['logger']
    resume_data = data.get('resumeData')
    job_description = data.get('jobDescription', '')
    interview_summary = str((data or {}).get('interviewSummary') or '').strip()
    diagnosis_dossier = (data or {}).get('diagnosisDossier') or {}
    diagnosis_context = _format_diagnosis_dossier(diagnosis_dossier)
    raw_chat_history = (data or {}).get('chatHistory') or []
    if isinstance(raw_chat_history, list):
        chat_lines = []
        for item in raw_chat_history[-20:]:
            if not isinstance(item, dict):
                continue
            role = '候选人' if str(item.get('role') or '').strip() == 'user' else '面试官'
            text = str(item.get('text') or '').strip()
            if not text:
                continue
            chat_lines.append(f"{role}: {text}")
        interview_chat_history = '\n'.join(chat_lines)
    else:
        interview_chat_history = ''
    analysis_stage = str((data or {}).get('analysisStage') or 'pre_interview').strip().lower()
    rag_enabled_stages = {
        'final',
        'final_report',
        'final_optimization',
        'post_interview',
        'report',
        'optimization',
    }
    is_final_report_stage = analysis_stage in {
        'final',
        'final_report',
        'final_optimization',
        'post_interview',
        'report',
        'optimization',
    }

    def _normalize_text(value):
        return str(value or '').strip().lower()

    def _degree_rank_from_text(text):
        value = _normalize_text(text)
        if not value:
            return -1, ''
        if ('博士后' in value) or ('phd' in value) or ('doctor' in value) or ('博士' in value):
            return 4, '博士'
        if ('硕士' in value) or ('master' in value):
            return 3, '硕士'
        if ('本科' in value) or ('学士' in value) or ('bachelor' in value):
            return 2, '本科'
        if ('大专' in value) or ('专科' in value) or ('associate' in value):
            return 1, '大专'
        return -1, ''

    def _extract_jd_min_degree_rank(jd_text):
        text = _normalize_text(jd_text)
        if not text:
            return -1, ''
        patterns = [
            (4, '博士', r'(博士后|博士)(及以上|以上|学历|学位|优先)?'),
            (3, '硕士', r'(硕士)(及以上|以上|学历|学位|优先)?'),
            (2, '本科', r'(本科|学士)(及以上|以上|学历|学位|优先)?'),
            (1, '大专', r'(大专|专科)(及以上|以上|学历|学位|优先)?'),
        ]
        best_rank = -1
        best_label = ''
        for rank, label, pattern in patterns:
            if re.search(pattern, text, flags=re.IGNORECASE):
                best_rank = max(best_rank, rank)
                if rank >= best_rank:
                    best_label = label
        return best_rank, best_label

    def _extract_resume_best_degree_rank(resume):
        educations = (resume or {}).get('educations') or []
        best_rank = -1
        best_label = ''
        for item in educations:
            if not isinstance(item, dict):
                continue
            candidates = [
                item.get('degree'),
                item.get('title'),
                item.get('subtitle'),
                item.get('major'),
                item.get('school'),
            ]
            for c in candidates:
                rank, label = _degree_rank_from_text(c)
                if rank > best_rank:
                    best_rank = rank
                    best_label = label
        return best_rank, best_label

    def _append_education_gap_advisory(suggestions):
        current = suggestions if isinstance(suggestions, list) else []
        jd_rank, jd_label = _extract_jd_min_degree_rank(job_description)
        if jd_rank < 0:
            return current
        resume_rank, resume_label = _extract_resume_best_degree_rank(resume_data)
        if resume_rank >= jd_rank:
            return current

        reason = (
            f"职位描述要求最低学历为“{jd_label}”，当前简历"
            f"{('最高显示为“' + resume_label + '”') if resume_label else '未明确体现学历层级'}，"
            "可能存在筛选风险。此项仅做匹配风险提示，不建议改动教育背景事实。"
        )
        advisory = {
            'id': 'suggestion-education-gap-warning',
            'type': 'warning',
            'title': '学历匹配风险提示',
            'reason': reason,
            'targetSection': 'education',
            'targetField': 'degree',
            'originalValue': resume_label or '未明确学历层级',
            'suggestedValue': '',
        }
        deduped = []
        seen = set()
        for item in [*current, advisory]:
            if not isinstance(item, dict):
                continue
            key = (
                str(item.get('targetSection') or '').strip().lower(),
                str(item.get('title') or '').strip().lower(),
                str(item.get('reason') or '').strip().lower(),
            )
            if key in seen:
                continue
            seen.add(key)
            deduped.append(item)
        return deduped

    def _is_education_suggestion(item):
        if not isinstance(item, dict):
            return False
        if deps['is_education_related_suggestion'](item):
            return True
        target_section = str(item.get('targetSection') or '').strip().lower()
        return target_section in ('education', 'educations', 'edu')

    def _try_generate_final_resume_for_report(_score, _suggestions):
        if not is_final_report_stage:
            return None
        generator = deps.get('generate_optimized_resume')
        if not callable(generator):
            return None
        try:
            safe_suggestions = [
                s for s in (_suggestions or [])
                if isinstance(s, dict) and (not _is_education_suggestion(s))
            ]
            generated = generator(
                gemini_client=deps.get('gemini_client'),
                check_gemini_quota=deps.get('check_gemini_quota'),
                gemini_analysis_model=deps.get('GEMINI_RESUME_GENERATION_MODEL'),
                parse_ai_response=deps.get('parse_ai_response'),
                format_resume_for_ai=deps.get('format_resume_for_ai'),
                logger=logger,
                resume_data=resume_data,
                chat_history=raw_chat_history if isinstance(raw_chat_history, list) else [],
                score=_score,
                suggestions=safe_suggestions,
            )
            return generated if isinstance(generated, dict) else None
        except Exception as gen_err:
            logger.warning("final_report resume generation failed: %s", gen_err)
            return None
    rag_allowed_by_stage = analysis_stage in rag_enabled_stages
    rag_flag_present = 'ragEnabled' in (data or {})
    rag_requested = deps['parse_bool_flag'](data.get('ragEnabled'), deps['RAG_ENABLED'])
    rag_strategy = deps['resolve_rag_strategy'](resume_data, job_description, rag_flag_present=rag_flag_present)
    force_on = bool(rag_strategy.get('force_case_rag_on', False)) and (not (rag_flag_present and (rag_requested is False)))
    rag_enabled = rag_allowed_by_stage and (not rag_strategy.get('disable_case_rag', False)) and (rag_requested or force_on)
    reference_cases = []

    logger.info(
        "analyze.entry user=%s stage=%s has_resume=%s jd_len=%s",
        str(current_user_id),
        analysis_stage,
        bool(resume_data),
        len(str(job_description or '')),
    )

    if not resume_data:
        return {'error': '需要提供简历数据'}, 400

    logger.info(
        "analyze.start user=%s stage=%s jd_len=%s rag_requested=%s",
        str(current_user_id),
        analysis_stage,
        len(str(job_description or '')),
        rag_requested,
    )

    pii_mode = str(deps['PII_GUARD_MODE'] or 'warn').strip().lower()
    pii_masker = None

    if pii_mode in ('warn', 'reject', 'mask'):
        pii_types = deps['_payload_pii_types'](resume_data, job_description)
        if pii_types:
            logger.warning("PII guard detected types=%s (mode=%s)", sorted(list(pii_types)), pii_mode)
            if pii_mode == 'reject':
                return {
                    'error': '检测到可能的个人敏感信息（PII），已拒绝处理。请使用前端内置脱敏后再重试。',
                    'pii_types': sorted(list(pii_types))
                }, 400
            if pii_mode == 'mask':
                personal = (resume_data or {}).get('personalInfo', {}) or {}
                pii_masker = PIIMasker(
                    user_name=personal.get('name') or '',
                    email=personal.get('email') or '',
                    phone=personal.get('phone') or '',
                )

    can_run_analysis_ai = deps.get('can_run_analysis_ai')
    analysis_ai_enabled = bool(can_run_analysis_ai(current_user_id, data)) if callable(can_run_analysis_ai) else bool(deps['gemini_client'] and deps['check_gemini_quota']())

    if analysis_ai_enabled:
        try:
            masked_resume_data = pii_masker.mask_object(copy.deepcopy(resume_data)) if pii_masker else resume_data
            masked_job_description = pii_masker.mask_text(job_description) if pii_masker else job_description

            rag_context = ""
            if rag_enabled:
                relevant_cases = deps['find_relevant_cases_vector'](masked_resume_data, limit=rag_strategy.get('case_limit', 3))
                if isinstance(relevant_cases, list):
                    reference_cases = [{
                        'id': case.get('id'),
                        'job_role': case.get('job_role'),
                        'industry': case.get('industry'),
                        'seniority': case.get('seniority'),
                        'scenario': case.get('scenario'),
                        'star': case.get('star', {}),
                        'similarity': case.get('similarity')
                    } for case in relevant_cases]
                logger.info("RAG retrieval count: %s", len(reference_cases))

                formatted_cases = ""
                if relevant_cases:
                    for index, case in enumerate(relevant_cases):
                        formatted_cases += f"案例 {index+1}：{case.get('job_role')} ({case.get('industry')})\n"
                        star = case.get('star', {})
                        formatted_cases += f"- 情况: {star.get('situation')}\n"
                        formatted_cases += f"- 任务: {star.get('task')}\n"
                        formatted_cases += f"- 行动: {star.get('action')}\n"
                        formatted_cases += f"- 结果: {star.get('result')}\n\n"
                if formatted_cases:
                    rag_context = f"""
【参考案例（仅限风格约束）】
以下是该领域的优秀简历案例（STAR法则与Bullet Points示范）：
{formatted_cases}

请严格执行以下约束（强制）：
1. 参考案例只允许用于“叙事结构、动词表达、量化逻辑”，不得作为事实来源。
2. 严禁复用或改写参考案例中的任何具体事实，包括但不限于：公司名、项目名、产品名、客户名、品牌名、平台名、组织名、人物名。
3. 严禁复用或映射参考案例中的任何具体数字与时间信息，包括百分比、金额、人数、时长、日期、排名、增长率（例如 14.2%）。
4. 输出中所有事实必须来自用户简历原文；若简历未提供具体事实，使用中性口径表达（严禁 XX/XXX 占位符）或仅给出结构化改写，不得臆造细节。
5. 若发现建议文本与参考案例在实体名或数字上重合，必须重写，直至完全去除案例事实痕迹。
"""
            else:
                logger.info(
                    "RAG disabled for this request (stage=%s, stage_allowed=%s, requested=%s, strategy=%s)",
                    analysis_stage,
                    rag_allowed_by_stage,
                    rag_requested,
                    rag_strategy.get('mode'),
                )
            if rag_enabled and rag_strategy.get('extra_context'):
                rag_context = f"{rag_context}\n{rag_strategy.get('extra_context')}\n"

            prompt = _build_analysis_prompt(
                resume_data=masked_resume_data,
                job_description=masked_job_description,
                rag_context=rag_context,
                format_resume_for_ai=deps['format_resume_for_ai'],
                analysis_stage=analysis_stage,
                interview_summary=interview_summary,
                interview_chat_history=interview_chat_history,
                diagnosis_context=diagnosis_context,
            )

            final_stage_model = str(deps.get('GEMINI_RESUME_GENERATION_MODEL') or '').strip()
            base_models = deps['get_analysis_model_candidates']()
            if analysis_stage in rag_enabled_stages and final_stage_model:
                analysis_models_tried = [final_stage_model, *base_models]
            else:
                analysis_models_tried = list(base_models or [])
            deduped_models = []
            for model_name in analysis_models_tried:
                m = str(model_name or '').strip()
                if not m or m in deduped_models:
                    continue
                # Force analysis pipeline to use flash models only.
                if 'pro' in m.lower():
                    continue
                deduped_models.append(m)
            if not deduped_models:
                deduped_models = ['gemini-2.5-flash']
            analysis_models_tried = deduped_models
            response, used_model = deps['analysis_generate_content_resilient'](
                current_user_id=current_user_id,
                data=data,
                prompt=prompt,
                analysis_models_tried=analysis_models_tried,
            )

            ai_result = deps['parse_ai_response'](response.text)
            if pii_masker:
                ai_result = pii_masker.unmask_object(ai_result)
            model_target_company = str(ai_result.get('targetCompany') or '').strip()
            fallback_target_company, fallback_confidence = _fallback_extract_company_with_confidence(job_description)
            model_confidence = _normalize_company_confidence(ai_result.get('targetCompanyConfidence'), default=0.0)
            extracted_target_company = model_target_company or fallback_target_company
            target_company_confidence = model_confidence if model_target_company else fallback_confidence
            raw_suggestions = ai_result.get('suggestions', [])
            filtered_suggestions = []
            dropped_gender_suggestions = 0
            dropped_education_suggestions = 0
            if isinstance(raw_suggestions, list):
                for suggestion in raw_suggestions:
                    if deps['is_gender_related_suggestion'](suggestion):
                        dropped_gender_suggestions += 1
                        continue
                    if deps['is_education_related_suggestion'](suggestion):
                        dropped_education_suggestions += 1
                        continue
                    filtered_suggestions.append(suggestion)
            else:
                filtered_suggestions = []
            if dropped_gender_suggestions > 0:
                logger.info("Dropped %d gender-related suggestions from AI analyze result", dropped_gender_suggestions)
            if dropped_education_suggestions > 0:
                logger.info("Dropped %d education-related suggestions from AI analyze result", dropped_education_suggestions)
            if analysis_stage == 'pre_interview':
                ai_result['suggestions'] = []
            else:
                ai_result['suggestions'] = _sanitize_suggestions_for_metric_consistency(filtered_suggestions, resume_data)
                if is_final_report_stage:
                    ai_result['suggestions'] = _build_final_stage_annotation_suggestions(
                        ai_result.get('suggestions', []),
                        resume_data,
                        ai_result.get('score', 0),
                    )
                else:
                    ai_result['suggestions'] = _ensure_sentence_level_coverage(ai_result.get('suggestions', []), resume_data)
                    ai_result['suggestions'] = _merge_duplicate_suggestions(ai_result.get('suggestions', []))
                ai_result['suggestions'] = _append_education_gap_advisory(ai_result.get('suggestions', []))
            final_resume_data = _try_generate_final_resume_for_report(
                ai_result.get('score', 70),
                ai_result.get('suggestions', []),
            )
            micro_interview_first_question = _resolve_micro_interview_first_question(ai_result, job_description)
            ensured_summary = deps['ensure_analysis_summary'](
                ai_result.get('summary', ''),
                ai_result.get('strengths', []),
                ai_result.get('weaknesses', []),
                ai_result.get('missingKeywords', []),
                bool(job_description)
            )

            logger.info(
                "analyze.success user=%s stage=%s model=%s score=%s suggestions=%s prompt=%s",
                str(current_user_id),
                analysis_stage,
                str(used_model),
                int(ai_result.get('score', 70) or 0),
                len(ai_result.get('suggestions', []) or []),
                ANALYSIS_PROMPT_VERSION,
            )
            return {
                'score': ai_result.get('score', 70),
                'scoreBreakdown': ai_result.get('scoreBreakdown', {'experience': 0, 'skills': 0, 'format': 0}),
                'summary': ensured_summary,
                'microInterviewFirstQuestion': micro_interview_first_question,
                'suggestions': ai_result.get('suggestions', []),
                'strengths': ai_result.get('strengths', []),
                'weaknesses': ai_result.get('weaknesses', []),
                'missingKeywords': ai_result.get('missingKeywords', []),
                'analysisStage': analysis_stage,
                'targetCompany': extracted_target_company,
                'targetCompanyConfidence': _normalize_company_confidence(target_company_confidence),
                'reference_cases': reference_cases,
                'rag_enabled': rag_enabled,
                'rag_requested': rag_requested,
                'rag_strategy': rag_strategy.get('mode'),
                'analysis_model': used_model,
                'analysisPromptVersion': ANALYSIS_PROMPT_VERSION,
                'resumeData': final_resume_data,
            }, 200

        except Exception as ai_error:
            logger.error("Gemini AI analysis failed: %s", ai_error)
            logger.error("Full traceback: %s", traceback.format_exc())
            score = deps['calculate_resume_score'](resume_data)
            suggestions = deps['generate_enhanced_suggestions'](resume_data, score, job_description)
            fallback_target_company, fallback_confidence = _fallback_extract_company_with_confidence(job_description)
            if analysis_stage == 'pre_interview':
                suggestions = []
            else:
                suggestions = [
                    suggestion for suggestion in (suggestions or [])
                    if not deps['is_gender_related_suggestion'](suggestion) and not deps['is_education_related_suggestion'](suggestion)
                ]
                suggestions = _sanitize_suggestions_for_metric_consistency(suggestions, resume_data)
                suggestions = _ensure_sentence_level_coverage(suggestions, resume_data)
                suggestions = _merge_duplicate_suggestions(suggestions)
                suggestions = _append_education_gap_advisory(suggestions)
            final_resume_data = _try_generate_final_resume_for_report(score, suggestions)

            logger.info(
                "analyze.fallback user=%s stage=%s score=%s suggestions=%s",
                str(current_user_id),
                analysis_stage,
                int(score or 0),
                len(suggestions or []),
            )
            fallback_first_question = _resolve_micro_interview_first_question({
                'weaknesses': ['经历描述较为笼统', '缺少量化结果'],
                'missingKeywords': [] if not job_description else ['岗位关键词覆盖不足'],
            }, job_description)
            return {
                'score': score,
                'summary': '智能分析暂时不可用，已生成基础分析报告，建议稍后再试。',
                'microInterviewFirstQuestion': fallback_first_question,
                'suggestions': suggestions,
                'strengths': ['结构清晰', '格式规范'],
                'weaknesses': ['智能分析暂不可用', '请稍后重试以获取更详细分析'],
                'missingKeywords': [] if not job_description else ['智能分析暂不可用'],
                'analysisStage': analysis_stage,
                'targetCompany': fallback_target_company,
                'targetCompanyConfidence': _normalize_company_confidence(fallback_confidence),
                'reference_cases': reference_cases,
                'rag_enabled': rag_enabled,
                'rag_requested': rag_requested,
                'rag_strategy': rag_strategy.get('mode'),
                'analysis_model': None,
                'analysisPromptVersion': ANALYSIS_PROMPT_VERSION,
                'analysis_models_tried': analysis_models_tried if 'analysis_models_tried' in locals() else [],
                'analysis_error': str(ai_error)[:500],
                'resumeData': final_resume_data,
            }, 200

    score = deps['calculate_resume_score'](resume_data)
    suggestions = [] if analysis_stage == 'pre_interview' else deps['generate_suggestions'](resume_data, score)
    fallback_target_company, fallback_confidence = _fallback_extract_company_with_confidence(job_description)
    if analysis_stage != 'pre_interview':
        suggestions = [
            suggestion for suggestion in (suggestions or [])
            if not deps['is_gender_related_suggestion'](suggestion) and not deps['is_education_related_suggestion'](suggestion)
        ]
        suggestions = _sanitize_suggestions_for_metric_consistency(suggestions, resume_data)
        suggestions = _ensure_sentence_level_coverage(suggestions, resume_data)
        suggestions = _merge_duplicate_suggestions(suggestions)
        suggestions = _append_education_gap_advisory(suggestions)
    final_resume_data = _try_generate_final_resume_for_report(score, suggestions)
    rule_based_first_question = _resolve_micro_interview_first_question({
        'weaknesses': ['简历叙述缺少关键细节'],
        'missingKeywords': [] if not job_description else ['关键词覆盖不足'],
    }, job_description)
    logger.info(
        "analyze.rule_based user=%s stage=%s score=%s suggestions=%s",
        str(current_user_id),
        analysis_stage,
        int(score or 0),
        len(suggestions or []),
    )
    return {
        'score': score,
        'summary': '简历分析完成，请查看优化建议。',
        'microInterviewFirstQuestion': rule_based_first_question,
        'suggestions': suggestions,
        'strengths': ['结构清晰', '格式规范'],
        'weaknesses': ['缺少量化结果', '技能描述过于笼统'],
        'missingKeywords': [] if not job_description else ['正在分析关键词...'],
        'analysisStage': analysis_stage,
        'targetCompany': fallback_target_company,
        'targetCompanyConfidence': _normalize_company_confidence(fallback_confidence),
        'reference_cases': reference_cases,
        'rag_enabled': rag_enabled,
        'rag_requested': rag_requested,
        'rag_strategy': rag_strategy.get('mode'),
        'analysisPromptVersion': ANALYSIS_PROMPT_VERSION,
        'resumeData': final_resume_data,
    }, 200

