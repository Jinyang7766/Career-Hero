from flask import request, jsonify, Response, stream_with_context

try:
    from services.career_profile_service import organize_career_profile_core
except ImportError:
    from backend.services.career_profile_service import organize_career_profile_core


def get_json_payload(req):
    data = req.get_json(silent=True)
    if data is None:
        return {}
    return data


def register_ai_routes(app, deps):
    token_required = deps['token_required']

    parse_resume_core = deps['parse_resume_core']
    parse_pdf_core = deps['parse_pdf_core']
    analyze_resume_core = deps['analyze_resume_core']
    parse_screenshot_core = deps['parse_screenshot_core']
    ai_chat_core = deps['ai_chat_core']
    ai_chat_stream_core = deps['ai_chat_stream_core']
    transcribe_core = deps['transcribe_core']

    parse_resume_text_with_ai = deps['parse_resume_text_with_ai']
    extract_text_from_pdf = deps['extract_text_from_pdf']
    extract_text_multimodal = deps['extract_text_multimodal']
    extract_text_from_docx = deps['extract_text_from_docx']
    _extract_text_via_pymupdf = deps['_extract_text_via_pymupdf']
    _extract_text_via_pypdf = deps['_extract_text_via_pypdf']

    logger = deps['logger']
    traceback = deps['traceback']
    gemini_client = deps['gemini_client']
    PDF_PARSE_DEBUG = deps['PDF_PARSE_DEBUG']
    parse_bool_flag = deps['parse_bool_flag']
    RAG_ENABLED = deps['RAG_ENABLED']
    resolve_rag_strategy = deps['resolve_rag_strategy']
    PII_GUARD_MODE = deps['PII_GUARD_MODE']
    _payload_pii_types = deps['_payload_pii_types']
    check_gemini_quota = deps['check_gemini_quota']
    _can_run_analysis_ai = deps['_can_run_analysis_ai']
    find_relevant_cases_vector = deps['find_relevant_cases_vector']
    format_resume_for_ai = deps['format_resume_for_ai']
    get_ocr_model_candidates = deps['get_ocr_model_candidates']
    get_jd_ocr_model_candidates = deps['get_jd_ocr_model_candidates']
    get_analysis_model_candidates = deps['get_analysis_model_candidates']
    get_transcribe_model_candidates = deps['get_transcribe_model_candidates']
    _gemini_generate_content_resilient = deps['_gemini_generate_content_resilient']
    _analysis_generate_content_resilient = deps['_analysis_generate_content_resilient']
    _parse_json_object_from_text = deps['_parse_json_object_from_text']
    GEMINI_RESUME_GENERATION_MODEL = deps['GEMINI_RESUME_GENERATION_MODEL']
    GEMINI_INTERVIEW_MODEL = deps['GEMINI_INTERVIEW_MODEL']
    GEMINI_INTERVIEW_SUMMARY_MODEL = deps['GEMINI_INTERVIEW_SUMMARY_MODEL']
    parse_ai_response = deps['parse_ai_response']
    is_gender_related_suggestion = deps['is_gender_related_suggestion']
    is_education_related_suggestion = deps['is_education_related_suggestion']
    ensure_analysis_summary = deps['ensure_analysis_summary']
    calculate_resume_score = deps['calculate_resume_score']
    generate_enhanced_suggestions = deps['generate_enhanced_suggestions']
    generate_suggestions = deps['generate_suggestions']
    generate_optimized_resume = deps['generate_optimized_resume']

    @app.route('/api/ai/parse-resume', methods=['POST'])
    def parse_resume():
        """使用 AI 解析简历文本"""
        try:
            body, status = parse_resume_core(
                get_json_payload(request),
                {'parse_resume_text_with_ai': parse_resume_text_with_ai},
            )
            return jsonify(body), status
        except Exception as e:
            logger.error(f"Resume parsing error: {str(e)}")
            logger.error(f"Full traceback: {traceback.format_exc()}")
            return jsonify({'error': '解析简历失败'}), 500

    @app.route('/api/parse-pdf', methods=['POST'])
    def parse_pdf():
        """解析 PDF/DOCX 简历并返回结构化数据"""
        try:
            if 'file' not in request.files:
                return jsonify({'error': '未上传文件'}), 400
            body, status = parse_pdf_core(
                request.files['file'],
                {
                    'extract_text_from_pdf': extract_text_from_pdf,
                    'extract_text_multimodal': extract_text_multimodal,
                    'extract_text_from_docx': extract_text_from_docx,
                    '_extract_text_via_pymupdf': _extract_text_via_pymupdf,
                    '_extract_text_via_pypdf': _extract_text_via_pypdf,
                    'parse_resume_text_with_ai': parse_resume_text_with_ai,
                    'gemini_client': gemini_client,
                    'PDF_PARSE_DEBUG': PDF_PARSE_DEBUG,
                    'logger': logger,
                },
            )
            return jsonify(body), status
        except Exception as e:
            logger.error(f"PDF parsing error: {str(e)}")
            logger.error(f"Full traceback: {traceback.format_exc()}")
            return jsonify({'error': 'PDF 解析失败'}), 500

    @app.route('/api/ai/analyze', methods=['POST'])
    @token_required
    def analyze_resume(current_user_id):
        try:
            body, status = analyze_resume_core(
                current_user_id=current_user_id,
                data=request.get_json() or {},
                deps={
                    'logger': logger,
                    'parse_bool_flag': parse_bool_flag,
                    'RAG_ENABLED': RAG_ENABLED,
                    'resolve_rag_strategy': resolve_rag_strategy,
                    'PII_GUARD_MODE': PII_GUARD_MODE,
                    '_payload_pii_types': _payload_pii_types,
                    'gemini_client': gemini_client,
                    'check_gemini_quota': check_gemini_quota,
                    'can_run_analysis_ai': _can_run_analysis_ai,
                    'find_relevant_cases_vector': find_relevant_cases_vector,
                    'format_resume_for_ai': format_resume_for_ai,
                    'get_analysis_model_candidates': get_analysis_model_candidates,
                    '_gemini_generate_content_resilient': _gemini_generate_content_resilient,
                    'analysis_generate_content_resilient': _analysis_generate_content_resilient,
                    'GEMINI_RESUME_GENERATION_MODEL': GEMINI_RESUME_GENERATION_MODEL,
                    'parse_ai_response': parse_ai_response,
                    'is_gender_related_suggestion': is_gender_related_suggestion,
                    'is_education_related_suggestion': is_education_related_suggestion,
                    'ensure_analysis_summary': ensure_analysis_summary,
                    'calculate_resume_score': calculate_resume_score,
                    'generate_enhanced_suggestions': generate_enhanced_suggestions,
                    'generate_suggestions': generate_suggestions,
                    'generate_optimized_resume': generate_optimized_resume,
                },
            )
            return jsonify(body), status
        except Exception:
            logger.error(f"简历分析出错: {traceback.format_exc()}")
            return jsonify({'error': '服务器内部错误'}), 500

    @app.route('/api/ai/parse-screenshot', methods=['POST'])
    @token_required
    def parse_screenshot(current_user_id):
        try:
            body, status = parse_screenshot_core(
                request.get_json() or {},
                {
                    'gemini_client': gemini_client,
                    'check_gemini_quota': check_gemini_quota,
                    'get_ocr_model_candidates': get_ocr_model_candidates,
                    'get_jd_ocr_model_candidates': get_jd_ocr_model_candidates,
                    'logger': logger,
                },
            )
            return jsonify(body), status
        except Exception:
            return jsonify({'error': '服务器内部错误'}), 500

    @app.route('/api/ai/chat', methods=['POST'])
    @token_required
    def ai_chat(current_user_id):
        try:
            body, status = ai_chat_core(
                request.get_json() or {},
                {
                    'logger': logger,
                    'gemini_client': gemini_client,
                    'check_gemini_quota': check_gemini_quota,
                    'get_transcribe_model_candidates': get_transcribe_model_candidates,
                    '_gemini_generate_content_resilient': _gemini_generate_content_resilient,
                    '_parse_json_object_from_text': _parse_json_object_from_text,
                    'GEMINI_INTERVIEW_MODEL': GEMINI_INTERVIEW_MODEL,
                    'GEMINI_INTERVIEW_SUMMARY_MODEL': GEMINI_INTERVIEW_SUMMARY_MODEL,
                    'format_resume_for_ai': format_resume_for_ai,
                },
            )
            return jsonify(body), status
        except Exception:
            return jsonify({'error': '服务器内部错误'}), 500

    @app.route('/api/ai/chat/stream', methods=['POST'])
    @token_required
    def ai_chat_stream(current_user_id):
        """
        SSE streaming endpoint for interview chat.
        Emits events as `data: {"type":"chunk","delta":"..."}` / `done` / `error`.
        """
        try:
            data = request.get_json() or {}
            events_iter, immediate_body, status = ai_chat_stream_core(
                data,
                {
                    'logger': logger,
                    'request_trace_id': (request.headers.get('X-Client-Trace-Id') or '').strip(),
                    'gemini_client': gemini_client,
                    'check_gemini_quota': check_gemini_quota,
                    'get_transcribe_model_candidates': get_transcribe_model_candidates,
                    '_gemini_generate_content_resilient': _gemini_generate_content_resilient,
                    '_parse_json_object_from_text': _parse_json_object_from_text,
                    'GEMINI_INTERVIEW_MODEL': GEMINI_INTERVIEW_MODEL,
                    'GEMINI_INTERVIEW_SUMMARY_MODEL': GEMINI_INTERVIEW_SUMMARY_MODEL,
                    'format_resume_for_ai': format_resume_for_ai,
                },
            )

            if immediate_body is not None:
                # Validation/early-return path keeps JSON semantics for easier fallback handling.
                return jsonify(immediate_body), status

            def _format_sse(payload: dict) -> str:
                import json as _json
                return f"data: {_json.dumps(payload, ensure_ascii=False)}\\n\\n"

            @stream_with_context
            def _stream():
                try:
                    yield _format_sse({'type': 'start'})
                    for event in events_iter:
                        yield _format_sse(event)
                except GeneratorExit:
                    return
                except Exception as stream_err:
                    logger.error("SSE stream failed: %s", stream_err)
                    yield _format_sse({'type': 'error', 'message': '流式输出异常，请稍后重试'})

            headers = {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no',
            }
            return Response(_stream(), status=200, headers=headers)
        except Exception:
            return jsonify({'error': '服务器内部错误'}), 500

    @app.route('/api/ai/transcribe', methods=['POST'])
    @token_required
    def ai_transcribe(current_user_id):
        """
        Speech-to-text for short user voice answers.

        Input:
          { audio: { mime_type: "audio/webm", data: "<base64 or data:...>" }, lang?: "zh-CN" }

        Output:
          { success: true, text: "...", model: "models/..." }
        """
        try:
            payload = request.get_json(silent=True) or {}
            # Fast path for frontend upload: multipart/form-data with raw audio file.
            if not payload and request.files and request.files.get('file'):
                import base64 as _base64
                file_obj = request.files.get('file')
                mime_type = (request.form.get('mime_type') or getattr(file_obj, 'mimetype', '') or 'audio/webm').strip()
                lang = (request.form.get('lang') or 'zh-CN').strip() or 'zh-CN'
                file_bytes = file_obj.read() if file_obj else b''
                payload = {
                    'audio': {
                        'mime_type': mime_type,
                        'data': _base64.b64encode(file_bytes).decode('utf-8'),
                    },
                    'lang': lang,
                }

            body, status = transcribe_core(
                payload,
                {
                    'logger': logger,
                    'gemini_client': gemini_client,
                    'check_gemini_quota': check_gemini_quota,
                    'get_transcribe_model_candidates': get_transcribe_model_candidates,
                    '_gemini_generate_content_resilient': _gemini_generate_content_resilient,
                },
            )
            return jsonify(body), status
        except Exception as e:
            logger.error("AI transcribe failed: %s", e)
            return jsonify({'success': False, 'text': '', 'error': '服务器内部错误'}), 500

    @app.route('/api/ai/generate-resume', methods=['POST'])
    @token_required
    def generate_resume(current_user_id):
        try:
            data = request.get_json() or {}
            resume_data = data.get('resumeData')
            chat_history = data.get('chatHistory', [])
            score = data.get('score', 0)
            suggestions = data.get('suggestions', [])
            career_profile = data.get('careerProfile') or None

            generated_resume = generate_optimized_resume(
                gemini_client=gemini_client,
                check_gemini_quota=check_gemini_quota,
                gemini_analysis_model=GEMINI_RESUME_GENERATION_MODEL,
                parse_ai_response=parse_ai_response,
                format_resume_for_ai=format_resume_for_ai,
                logger=logger,
                resume_data=resume_data,
                chat_history=chat_history,
                score=score,
                suggestions=suggestions,
                career_profile=career_profile,
            )
            return jsonify({'resumeData': generated_resume}), 200
        except ValueError as e:
            return jsonify({'error': str(e)}), 400
        except Exception:
            return jsonify({'error': '服务器内部错误'}), 500

    @app.route('/api/ai/organize-career-profile', methods=['POST'])
    @token_required
    def organize_career_profile(current_user_id):
        try:
            body, status = organize_career_profile_core(
                current_user_id=current_user_id,
                data=request.get_json() or {},
                deps={
                    'logger': logger,
                    'gemini_client': gemini_client,
                    'check_gemini_quota': check_gemini_quota,
                    'parse_ai_response': parse_ai_response,
                    'analysis_generate_content_resilient': _analysis_generate_content_resilient,
                    'get_analysis_model_candidates': get_analysis_model_candidates,
                    'GEMINI_RESUME_GENERATION_MODEL': GEMINI_RESUME_GENERATION_MODEL,
                    'can_run_analysis_ai': _can_run_analysis_ai,
                },
            )
            return jsonify(body), status
        except Exception:
            logger.error("organize_career_profile failed: %s", traceback.format_exc())
            return jsonify({'error': '服务器内部错误'}), 500
