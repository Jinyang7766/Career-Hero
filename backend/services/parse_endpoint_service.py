def parse_resume_core(data, deps):
    resume_text = data.get('resumeText', '')
    if not isinstance(resume_text, str):
        return {'error': '简历文本必须为字符串'}, 400
    if not resume_text.strip():
        return {'error': '简历文本不能为空'}, 400
    parsed_data = deps['parse_resume_text_with_ai'](resume_text)
    return {'success': True, 'data': parsed_data}, 200


def parse_pdf_core(file_storage, deps):
    debug_meta = {}
    if not file_storage or not file_storage.filename:
        return {'error': '文件名为空'}, 400

    filename = file_storage.filename.lower()
    is_pdf = filename.endswith('.pdf')
    is_docx = filename.endswith('.docx')
    if not is_pdf and not is_docx:
        return {'error': '仅支持 PDF 或 DOCX 文件'}, 400

    file_bytes = file_storage.read()
    debug_meta = {
        'filename': file_storage.filename,
        'size_bytes': len(file_bytes),
        'is_pdf': is_pdf,
        'is_docx': is_docx,
    }
    if not file_bytes:
        return {'error': '文件内容为空'}, 400

    if is_pdf:
        resume_text = deps['extract_text_from_pdf'](file_bytes)
        debug_meta['extract_stage'] = 'pdf_extract'
        debug_meta['text_len_after_extract'] = len(resume_text or "")
        if resume_text == "[EXTERNAL_OCR_REQUIRED]":
            if not deps['gemini_client']:
                payload = {'error': '当前服务未配置 OCR 能力。请上传可复制文本的 PDF，或改用 DOCX。'}
                if deps['PDF_PARSE_DEBUG']:
                    payload['debug'] = {**debug_meta, 'stage': 'ocr_unavailable'}
                return payload, 400
            debug_meta['extract_stage'] = 'ocr'
            resume_text = deps['extract_text_multimodal'](file_bytes)
            debug_meta['text_len_after_ocr'] = len(resume_text or "")
    else:
        resume_text = deps['extract_text_from_docx'](file_bytes)
        debug_meta['extract_stage'] = 'docx_extract'
        debug_meta['text_len_after_extract'] = len(resume_text or "")

    if not resume_text or not resume_text.strip():
        payload = {'error': '未能提取文本，且 OCR 识别失败。请上传内容清晰的 PDF/DOCX。'}
        if deps['PDF_PARSE_DEBUG']:
            payload['debug'] = {**debug_meta, 'stage': 'empty_text_after_extract'}
        return payload, 400

    parsed_data = deps['parse_resume_text_with_ai'](resume_text)
    return {'success': True, 'data': parsed_data}, 200
