from google.genai import types


def _build_resume_fallback(resume_data):
    return {
        'personalInfo': resume_data.get('personalInfo', {}) or {},
        'workExps': resume_data.get('workExps', []) or [],
        'educations': resume_data.get('educations', []) or [],
        'projects': resume_data.get('projects', []) or [],
        'skills': resume_data.get('skills', []) or [],
        'summary': resume_data.get('summary', '') or '',
    }


def generate_optimized_resume(
    *,
    gemini_client,
    check_gemini_quota,
    gemini_analysis_model,
    parse_ai_response,
    format_resume_for_ai,
    logger,
    resume_data,
    chat_history,
    score,
    suggestions,
):
    if not resume_data:
        raise ValueError('需要提供简历数据')

    fallback_resume = _build_resume_fallback(resume_data)
    if not (gemini_client and check_gemini_quota()):
        return fallback_resume

    try:
        formatted_chat = ""
        for msg in chat_history or []:
            role = "用户" if msg.get('role') == 'user' else "顾问"
            formatted_chat += f"{role}: {msg.get('text', '')}\n"

        accepted_suggestions = []
        for suggestion in suggestions or []:
            if suggestion.get('status') == 'accepted':
                accepted_suggestions.append(suggestion.get('title', '建议'))

        accepted_suggestions_str = ', '.join(accepted_suggestions) if accepted_suggestions else '无'
        resume_info = format_resume_for_ai(resume_data)
        chat_info = formatted_chat if formatted_chat else '无对话历史'

        prompt = f"""
请根据以下信息生成一份完整且优化后的简历。
请仅使用中文输出，所有字段值必须为中文。
不要包含任何 AI 优化说明或标记。

**输入信息**
1. 原始简历数据：
{resume_info}

2. 对话历史：
{chat_info}

3. 当前评分：
{score}/100

4. 已采纳建议：
{accepted_suggestions_str}

**输出要求**
1. 仅返回 JSON（不要附加额外文本）。
2. 内容需结合原始数据、对话上下文和已采纳建议。
3. 所有字段需完整合理，不得留空。

**输出格式**
{{
  "resumeData": {{
    "personalInfo": {{
      "name": "姓名",
      "title": "职位标题",
      "email": "邮箱地址",
      "phone": "电话号码",
      "location": "所在地"
    }},
    "workExps": [
      {{
        "id": 1,
        "company": "公司名称",
        "position": "职位",
        "startDate": "开始日期",
        "endDate": "结束日期",
        "description": "详细工作描述（包含量化结果）"
      }}
    ],
    "educations": [
      {{
        "id": 1,
        "school": "学校名称",
        "degree": "学位",
        "major": "专业",
        "startDate": "开始日期",
        "endDate": "结束日期"
      }}
    ],
    "projects": [
      {{
        "id": 1,
        "title": "项目名称",
        "description": "详细项目描述",
        "date": "项目时间"
      }}
    ],
    "skills": ["技能1", "技能2", "技能3"],
    "summary": "专业简介"
  }}
}}
"""

        response = gemini_client.models.generate_content(
            model=gemini_analysis_model,
            contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        ai_result = parse_ai_response(response.text)
        if ai_result and ai_result.get('resumeData'):
            generated = ai_result['resumeData']
            return {
                'personalInfo': generated.get('personalInfo', {}) or {},
                'workExps': generated.get('workExps', []) or [],
                'educations': generated.get('educations', []) or [],
                'projects': generated.get('projects', []) or [],
                'skills': generated.get('skills', []) or [],
                'summary': generated.get('summary', '') or '',
            }
    except Exception as ai_error:
        logger.error("AI 生成简历失败: %s", ai_error)
        if "429" in str(ai_error) or "quota" in str(ai_error).lower() or "exceeded" in str(ai_error).lower():
            logger.warning("Gemini 配额超限，回退为本地简历生成")

    return fallback_resume
