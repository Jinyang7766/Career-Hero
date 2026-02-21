import re

from google.genai import types


def _decode_audio_payload(audio):
    from base64 import b64decode

    if not isinstance(audio, dict) or not audio.get('data'):
        raise ValueError('缺少音频数据')

    mime_type = (audio.get('mime_type') or 'audio/webm').strip().lower()
    base64_data = audio.get('data') or ''
    match = re.match(r'^data:(audio/[a-zA-Z0-9.+-]+);base64,(.*)$', base64_data, flags=re.DOTALL)
    if match:
        mime_type = (match.group(1) or mime_type).strip().lower()
        base64_data = match.group(2)
    return b64decode(base64_data), mime_type


def _transcribe_audio_with_gemini(audio, deps, *, lang: str = 'zh-CN'):
    logger = deps['logger']
    try:
        audio_bytes, mime_type = _decode_audio_payload(audio)
    except Exception as dec_err:
        logger.warning("Transcribe audio decode failed: %s", dec_err)
        return '', '', '音频解码失败'

    if deps.get('gemini_client') and deps.get('check_gemini_quota') and deps['check_gemini_quota']():
        transcribe_models = []
        get_candidates = deps.get('get_transcribe_model_candidates')
        if callable(get_candidates):
            try:
                transcribe_models = list(get_candidates() or [])
            except Exception:
                transcribe_models = []
        if not transcribe_models:
            transcribe_models = ['gemini-2.5-flash-lite', 'gemini-2.5-flash']

        prompt = (
            f"请将这段音频转写为{lang}纯文本，只输出转写结果本身，不要解释、不要标点修饰、不要加前缀。"
        )
        contents = [prompt, types.Part.from_bytes(data=audio_bytes, mime_type=mime_type)]
        last_gemini_error = None
        for model_name in transcribe_models:
            try:
                response, used_model = deps['_gemini_generate_content_resilient'](model_name, contents, want_json=False)
                text = str(getattr(response, 'text', '') or '').strip()
                if text:
                    return text, f'gemini:{used_model}', ''
            except Exception as model_err:
                last_gemini_error = model_err
                logger.warning("Gemini transcribe failed on model %s: %s", model_name, model_err)
        if last_gemini_error is not None:
            logger.warning("Gemini transcribe all models failed: %s", last_gemini_error)

    return '', '', '转写未配置或不可用（请检查 GEMINI_API_KEY / 转写模型配置）'


def transcribe_core(data, deps):
    audio = data.get('audio') or {}
    lang = (data.get('lang') or 'zh-CN').strip() or 'zh-CN'
    if not isinstance(audio, dict) or not audio.get('data'):
        return {'success': False, 'text': '', 'error': '缺少音频数据'}, 400

    text, provider, error = _transcribe_audio_with_gemini(audio, deps, lang=lang)
    if text:
        return {'success': True, 'text': text, 'provider': provider}, 200
    return {'success': False, 'text': '', 'error': error or '转写失败'}, 200
