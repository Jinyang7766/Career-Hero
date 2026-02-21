try:
    from services.ai_endpoint_suggestion_service import _normalize_training_day_labels
except ImportError:
    from backend.services.ai_endpoint_suggestion_service import _normalize_training_day_labels


def build_interview_summary_prompt(job_description: str, formatted_chat: str, clean_message: str) -> str:
    return f"""
【严格角色】你是专业 AI 面试官。现在面试已结束，请基于职位描述与完整对话记录输出“面试综合分析”。
要求：
- 用中文输出；不要提出下一题。
- 评分只基于本场面试作答表现（表达结构、业务深度、案例证据、数据支撑、应变与逻辑）。
- 严禁按简历内容、简历完整度、历史诊断结论、候选人背景标签进行任何加分或兜底。
- 严禁出现“仅按简历静态评估”“若只看简历可得X分”“简历可弥补本场表现”等表述。
- 若对话样本不足，明确说明“面试证据不足”；且总分必须从严（建议不高于59分）。
- 必须给出总分（0-100 的整数）。
- 禁止冗长铺垫与模板废话（如“基于您提供的信息/以下是针对您的分析”）。
- 禁止同义重复；同一结论只说一次。
- 句子要短：单句尽量 <= 35 字。
- 必须严格按以下模板输出，标题与顺序不可变，且每条都以“- ”开头：
总分：<整数>/100
【综合评价】
- ...
- ...
【表现亮点】
- ...
- ...
【需要加强的地方】
- 问题：...｜改进：...｜练习：...
- 问题：...｜改进：...｜练习：...
【职位匹配度与缺口】
- ...
- ...
【后续训练计划】
- Day 1: ...
- Day 2: ...
- 训练计划中的天数标签必须统一使用 `Day N`（例如 Day 1, Day 2），禁止使用“第1天/第一天”。
- 除上述模板外不得输出任何额外段落、前言或结语。

职位描述：{job_description if job_description else '未提供'}
对话记录：{formatted_chat if formatted_chat else '无'}
候选人结束指令：{clean_message if clean_message else '（无）'}
"""


def normalize_summary_output(text: str) -> str:
    return _normalize_training_day_labels(text)
