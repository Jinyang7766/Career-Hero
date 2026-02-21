import re
from google.genai import types

def parse_screenshot_core(data, deps):
    image = data.get('image', '')
    if not image:
        return {'error': '图片不能为空'}, 400

    if deps['gemini_client'] and deps['check_gemini_quota']():
        try:
            prompt = (
                "你是职位描述文本OCR助手。"
                "任务：从图片中提取完整职位描述文本。"
                "要求：保留原有分段和项目符号；去掉无关UI文字；只输出纯文本，不要解释，不要Markdown，不要JSON。"
            )
            from base64 import b64decode
            mime_type = "image/png"
            base64_data = image

            match = re.match(r'^data:(image/[a-zA-Z0-9.+-]+);base64,(.*)$', image, flags=re.DOTALL)
            if match:
                mime_type = (match.group(1) or "image/png").strip().lower()
                base64_data = match.group(2)

            image_data = b64decode(base64_data)
            if len(image_data) > 8 * 1024 * 1024:
                return {'success': False, 'text': '', 'error': '图片过大，请裁剪后重试（建议不超过 8MB）。'}, 200
            contents = [prompt, types.Part.from_bytes(data=image_data, mime_type=mime_type)]
            get_jd_candidates = deps.get('get_jd_ocr_model_candidates')
            if callable(get_jd_candidates):
                candidate_models = get_jd_candidates()
            else:
                candidate_models = deps['get_ocr_model_candidates']()

            last_error = None
            for model_name in candidate_models:
                try:
                    response = deps['gemini_client'].models.generate_content(
                        model=model_name,
                        contents=contents,
                        config=types.GenerateContentConfig(
                            temperature=0,
                            max_output_tokens=2200,
                        ),
                    )
                    text = (response.text or '').strip()
                    if text.startswith("```"):
                        text = re.sub(r"^```[a-zA-Z]*\s*", "", text)
                        text = re.sub(r"\s*```$", "", text).strip()
                    if text:
                        return {'success': True, 'text': text, 'model': model_name}, 200
                except Exception as model_err:
                    last_error = model_err
                    deps['logger'].warning("职位描述 screenshot OCR failed on model %s: %s", model_name, model_err)

            deps['logger'].error("职位描述 screenshot OCR all models failed: %s", last_error)
            return {'success': False, 'text': '', 'error': '职位描述截图识别失败，请尝试更清晰截图或直接粘贴职位描述文本。'}, 200
        except Exception as ai_error:
            deps['logger'].error("AI 截图解析失败: %s", ai_error)
            return {'success': False, 'text': '', 'error': '职位描述截图识别失败，请稍后重试或手动粘贴。'}, 200

    return {'success': False, 'text': '', 'error': 'AI服务不可用，请手动粘贴职位描述文本。'}, 200


