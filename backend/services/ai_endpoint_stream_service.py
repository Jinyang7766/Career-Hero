import re
import time
import traceback

from google.genai import types

try:
    from services.ai_endpoint_suggestion_service import _format_diagnosis_dossier
    from services.ai_endpoint_stt_service import _transcribe_audio_with_gemini
    from services.ai_endpoint_summary_service import normalize_summary_output
except ImportError:
    from backend.services.ai_endpoint_suggestion_service import _format_diagnosis_dossier
    from backend.services.ai_endpoint_stt_service import _transcribe_audio_with_gemini
    from backend.services.ai_endpoint_summary_service import normalize_summary_output
def ai_chat_stream_core(data, deps):
    """
    Stream interview chat response as incremental chunks.
    Yields dict events: {"type":"chunk","delta":"..."} / {"type":"done","text":"..."} / {"type":"error","message":"..."}
    """
    mode = (data.get('mode') or '').strip().lower()
    message = data.get('message', '')
    audio = data.get('audio')
    resume_data = data.get('resumeData')
    diagnosis_dossier = data.get('diagnosisDossier') or {}
    job_description = data.get('jobDescription', '')
    chat_history = data.get('chatHistory', [])
    if not isinstance(chat_history, list):
        chat_history = []
    try:
        history_window = int(data.get('historyWindow') or deps.get('INTERVIEW_HISTORY_WINDOW') or 14)
    except Exception:
        history_window = 14
    history_window = max(6, min(30, history_window))
    chat_history_for_prompt = chat_history[-history_window:]
    interview_type = str(data.get('interviewType') or 'general').strip().lower()
    diagnosis_context = _format_diagnosis_dossier(diagnosis_dossier)

    has_audio = isinstance(audio, dict) and bool(audio.get('data'))
    audio_duration_sec = None
    try:
        if isinstance(audio, dict):
            value = audio.get('duration_sec')
            if value is not None and str(value).strip() != '':
                audio_duration_sec = float(value)
    except Exception:
        audio_duration_sec = None

    if (not message) and (not has_audio):
        return None, {'error': '消息内容不能为空'}, 400

    is_micro_mode = (mode == 'micro_interview') or ('[MICRO_INTERVIEW_MODE]' in str(message or ''))
    clean_message = (
        str(message or '')
        .replace('[INTERVIEW_MODE]', '')
        .replace('[INTERVIEW_SUMMARY]', '')
        .replace('[MICRO_INTERVIEW_MODE]', '')
        .strip()
    )
    # Frontend interview wrapper contains long control text plus
    # "候选人回答：...". Always extract raw candidate answer first,
    # otherwise low-information checks can be bypassed in interview mode.
    m = re.search(r'候选人回答[:：]\s*(.*)$', clean_message, flags=re.DOTALL)
    if m:
        clean_message = str(m.group(1) or '').strip()

    def _is_voice_placeholder_text(text: str) -> bool:
        stripped = str(text or '').strip()
        return bool(stripped) and stripped in {'（语音）', '(语音)', '[语音]', '语音', 'voice'}

    def _extract_question_from_interviewer_text(text: str) -> str:
        stripped = str(text or '').strip()
        if not stripped:
            return ''
        match = re.search(r'下一题[:：]\s*(.*)$', stripped, flags=re.DOTALL)
        return (match.group(1) or '').strip() if match else stripped

    def _get_last_interviewer_question(chat_history_list) -> str:
        if not isinstance(chat_history_list, list):
            return ''
        for item in reversed(chat_history_list):
            if not isinstance(item, dict):
                continue
            if item.get('role') != 'model':
                continue
            txt = str(item.get('text') or '').replace('[INTERVIEW_MODE]', '').strip()
            if not txt or txt.startswith('SYSTEM_'):
                continue
            return _extract_question_from_interviewer_text(txt)
        return ''

    def _is_low_information_answer(text: str) -> bool:
        stripped = str(text or '').strip()
        if not stripped:
            return True
        if _is_voice_placeholder_text(stripped):
            return True
        compact = re.sub(r'[\s\.,;:!?\-—_·~`"\'“”‘’（）()\[\]{}<>《》【】|/\\\\]+', '', stripped)
        if len(compact) < 6:
            return True
        low = compact.lower()
        if low in {'不知道', '不清楚', '没想过', '随便', '都可以', '没有', '没了', '嗯', '啊', '额', 'emmm', 'ok', 'okay', '是的', '不是', '还行', '一般', '差不多', '就那样'}:
            return True
        return False

    if _is_voice_placeholder_text(clean_message):
        clean_message = ''

    if mode != 'interview_summary':
        last_q = _get_last_interviewer_question(chat_history)
        if has_audio and not clean_message:
            transcript = ''
            try:
                transcript, _provider, _err = _transcribe_audio_with_gemini(audio, deps, lang='zh-CN')
            except Exception as stt_err:
                deps['logger'].warning("Interview STT check failed, continuing without transcript: %s", stt_err)
                transcript = ''
            if not str(transcript or '').strip():
                question = last_q or '请再说一遍你的回答。'
                return None, {'response': f"我没有识别到有效的语音内容。请重新回答：{question}"}, 200
            clean_message = str(transcript).strip()

        if _is_low_information_answer(clean_message):
            if is_micro_mode:
                return None, {'response': "你的回答信息量不足。请补充这三点：你具体做了什么、怎么做的、结果数据是多少（可用区间或近似值）。"}, 200
            question = last_q or '请把你的回答说得更具体一些。'
            return None, {'response': f"你的回答信息量不足。请只补充当前问题中缺失的关键点（例如你的具体职责、行动细节、结果数据），无需整题重答。当前问题：{question}"}, 200

    if not (deps['gemini_client'] and deps['check_gemini_quota']()):
        return None, {'response': '面试官暂时开小差了。'}, 200

    formatted_chat = ""
    for message_obj in chat_history_for_prompt:
        role = "候选人" if message_obj.get('role') == 'user' else "面试官"
        msg_text = message_obj.get('text', '').replace('[INTERVIEW_MODE]', '').strip()
        if msg_text and not msg_text.startswith('SYSTEM_') and (not _is_voice_placeholder_text(msg_text)):
            formatted_chat += f"{role}: {msg_text}\n"
    self_intro_asked_before = False
    for message_obj in chat_history:
        if not isinstance(message_obj, dict):
            continue
        if message_obj.get('role') != 'model':
            continue
        model_text = str(message_obj.get('text') or '')
        if re.search(r'(自我介绍|介绍一下你自己|简单介绍一下自己)', model_text):
            self_intro_asked_before = True
            break

    is_self_intro_q = bool(re.search(r'(自我介绍|介绍一下你自己|简单介绍一下自己)', _get_last_interviewer_question(chat_history) or ''))

    def _sanitize_micro_reply(text: str) -> str:
        value = str(text or '').replace('*', '').strip()
        value = re.sub(r'(?:\n|^)\s*下一题[:：][\s\S]*$', '', value).strip()
        value = re.sub(r'自我介绍时间为?\s*1分钟[。.]?', '', value).strip()
        if re.search(r'(我是今天的面试官|下一题[:：]|请做.*自我介绍|重新进行自我介绍)', value):
            return "请先补充一条最能体现岗位匹配度的真实经历：你具体做了什么、怎么做、结果数据是多少？"
        return value

    if mode == 'interview_summary':
        prompt = f"""
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
    elif is_micro_mode:
        prompt = f"""
【严格角色】你是“微访谈补充助手”。
目标：补齐岗位证据（背景、动作、结果、量化数据），用于最终诊断报告。
规则：
- 每轮先一句简短反馈，再提 1 个最关键追问。
- 若回答空泛，继续追问，不要结束，不要进入下一题。
- 仅当信息已足够支撑最终诊断时，输出“结束微访谈”。
- 输出纯文本，不用 Markdown，不要出现“下一题：”。

职位描述：{job_description if job_description else '未提供'}
简历信息：{deps['format_resume_for_ai'](resume_data) if resume_data else '未提供'}
诊断档案：{diagnosis_context if diagnosis_context else '未提供'}
历史对话：{formatted_chat if formatted_chat else '微访谈刚开始'}
候选人回答：{clean_message if clean_message else ('（语音回答见音频附件）' if has_audio else '')}
请直接输出微访谈助手回复：
"""
    else:
        persona_prompts = {
            'technical': "你是极客型技术面试官（Technical Interviewer）。\n风格：深度挖掘技术细节，喜欢追问底层原理、系统设计与性能优化，对模糊回答零容忍。\n关注点：技术栈掌握度、解决复杂问题能力、代码质量、系统架构思维。",
            'hr': "你是资深 HR 面试官（HR Interviewer）。\n风格：温和但敏锐，关注候选人的软性素质、动机匹配度与文化契合度，会用 STAR 法则挖掘行为细节。\n关注点：沟通协作、职业稳定性、驱动力、抗压能力、价值观。",
            'general': "你是专业且平衡的综合面试官（General Interviewer）。\n风格：既关注业务能力也关注综合素质，提问覆盖面广，节奏平稳。\n关注点：简历真实性、过往业绩、核心胜任力。"
        }
        persona_instruction = persona_prompts.get(interview_type, persona_prompts['general'])
        style_rules = {
            'technical': "提问要求：优先围绕候选人项目做技术深挖，至少覆盖1个技术决策追问和1个性能/稳定性追问。问题尽量具体到技术栈、架构、trade-off。",
            'hr': "提问要求：优先行为面与动机面，使用 STAR 导向追问，重点覆盖沟通冲突、压力场景、职业选择与文化匹配，不问底层技术细节。",
            'general': "提问要求：在业务结果、项目实践、协作能力间保持平衡，问题覆盖广但不过度深挖单一方向。"
        }
        interview_style_instruction = style_rules.get(interview_type, style_rules['general'])
        if interview_type in ('technical', 'hr'):
            self_intro_policy_instruction = "自我介绍规则：当前不是初试场景，严禁要求候选人做自我介绍。"
        elif self_intro_asked_before:
            self_intro_policy_instruction = "自我介绍规则：历史对话中已完成自我介绍，后续严禁再次要求自我介绍。"
        else:
            self_intro_policy_instruction = "自我介绍规则：仅在初试场景可出现一次自我介绍题，且只能作为开场首题。"
        prompt = f"""
【严格角色】{persona_instruction}
基于职位描述和候选人简历进行模拟面试。
禁止提及任何评分，禁止给出建议，保持面试官角色。
{interview_style_instruction}
{self_intro_policy_instruction}
规则：
- 如果候选人回答为空、无法识别、与问题无关或信息量明显不足：不要肯定/夸赞；不要进入下一题。
- 优先采用“定点补充追问”：明确指出缺失维度（如职责边界、关键行动、量化结果、决策依据），要求候选人只补充该部分。
- 仅当回答几乎为空或完全跑题时，才要求整题重答并重复当前问题。
- 输出为纯文本，不要使用任何 Markdown 标记，不要出现任何 * 号。
- 如需提出下一题，必须另起一行，以“下一题：”开头输出（不要把下一题放进参考回复里）。
- 如果下一道问题是自我介绍（如“请做一下自我介绍”），请在问题中提醒：自我介绍时间为1分钟
职位描述：{job_description if job_description else '未提供'}
简历信息：{deps['format_resume_for_ai'](resume_data) if resume_data else '未提供'}
诊断档案：{diagnosis_context if diagnosis_context else '未提供'}
对话历史：{formatted_chat if formatted_chat else '面试刚开始'}
候选人回答：{clean_message if clean_message else ('（语音回答见音频附件）' if has_audio else '')}
候选人语音时长（秒）：{audio_duration_sec if audio_duration_sec is not None else '未知'}
请直接输出面试官回答：简短点评 + 下一道具体问题。
"""

    contents = prompt
    if has_audio and mode != 'interview_summary':
        try:
            from base64 import b64decode
            mime_type = (audio.get('mime_type') or 'audio/webm').strip().lower()
            base64_data = audio.get('data') or ''
            match = re.match(r'^data:(audio/[a-zA-Z0-9.+-]+);base64,(.*)$', base64_data, flags=re.DOTALL)
            if match:
                mime_type = (match.group(1) or mime_type).strip().lower()
                base64_data = match.group(2)
            audio_bytes = b64decode(base64_data)
            contents = [prompt, types.Part.from_bytes(data=audio_bytes, mime_type=mime_type)]
        except Exception as dec_err:
            deps['logger'].warning("Audio decode failed, continuing without audio: %s", dec_err)
            contents = prompt

    stream_api = getattr(deps['gemini_client'].models, 'generate_content_stream', None)
    interview_summary_model = deps.get('GEMINI_INTERVIEW_SUMMARY_MODEL', deps.get('GEMINI_INTERVIEW_MODEL'))
    interview_chat_model = deps.get('GEMINI_INTERVIEW_MODEL')
    active_chat_model = interview_summary_model if mode == 'interview_summary' else interview_chat_model
    request_trace_id = str(deps.get('request_trace_id') or '').strip()

    def _iter_events():
        req_started = time.perf_counter()
        first_chunk_elapsed_ms = None
        chunk_count = 0
        if not callable(stream_api):
            try:
                model_started = time.perf_counter()
                response, _used = deps['_gemini_generate_content_resilient'](active_chat_model, contents, want_json=False)
                model_elapsed_ms = (time.perf_counter() - model_started) * 1000.0
                text = (response.text or "").replace('*', '').strip()
                if mode == 'interview_summary':
                    text = normalize_summary_output(text)
                deps['logger'].info(
                    "interview_stream_latency mode=fallback trace_id=%s model=%s model_ms=%.1f total_ms=%.1f text_len=%s",
                    request_trace_id or '-',
                    active_chat_model,
                    model_elapsed_ms,
                    (time.perf_counter() - req_started) * 1000.0,
                    len(text or ''),
                )
                done_text = text or ('请补充一个关键细节（动作、方法或结果数据）。' if is_micro_mode else '感谢你的回答，我们继续下一题。')
                if is_micro_mode:
                    done_text = _sanitize_micro_reply(done_text)
                    if not done_text:
                        done_text = "请补充你在目标岗位最相关的一段真实经历：你的职责、关键动作和结果数据。"
                yield {'type': 'done', 'text': done_text}
                return
            except Exception as fallback_err:
                deps['logger'].error(
                    "interview_stream_latency mode=fallback_error trace_id=%s model=%s total_ms=%.1f error=%s",
                    request_trace_id or '-',
                    active_chat_model,
                    (time.perf_counter() - req_started) * 1000.0,
                    fallback_err,
                )
                deps['logger'].error("AI 面试流式降级失败: %s", fallback_err)
                yield {'type': 'error', 'message': '面试官暂时开小差了，请稍后再试。'}
                return

        full_text = ''
        try:
            for chunk in stream_api(model=active_chat_model, contents=contents):
                delta = (getattr(chunk, 'text', '') or '').replace('*', '')
                if not delta:
                    continue
                if first_chunk_elapsed_ms is None:
                    first_chunk_elapsed_ms = (time.perf_counter() - req_started) * 1000.0
                chunk_count += 1
                full_text += delta
                yield {'type': 'chunk', 'delta': delta}

            parsed = deps['_parse_json_object_from_text'](full_text)
            if isinstance(parsed, dict):
                full_text = parsed.get('response') or parsed.get('text') or parsed.get('message') or parsed.get('reply') or full_text

            final_text = (full_text or '').replace('*', '').strip()
            if mode == 'interview_summary':
                final_text = normalize_summary_output(final_text)
            deps['logger'].info(
                "interview_stream_latency mode=sse trace_id=%s model=%s first_chunk_ms=%s total_ms=%.1f chunks=%s text_len=%s",
                request_trace_id or '-',
                active_chat_model,
                f"{first_chunk_elapsed_ms:.1f}" if first_chunk_elapsed_ms is not None else '-',
                (time.perf_counter() - req_started) * 1000.0,
                chunk_count,
                len(final_text or ''),
            )
            done_text = final_text or ('请补充一个关键细节（动作、方法或结果数据）。' if is_micro_mode else '感谢你的回答，我们继续下一题。')
            if is_micro_mode:
                done_text = _sanitize_micro_reply(done_text)
                if not done_text:
                    done_text = "请补充你在目标岗位最相关的一段真实经历：你的职责、关键动作和结果数据。"
            yield {'type': 'done', 'text': done_text}
        except Exception as stream_err:
            deps['logger'].error(
                "interview_stream_latency mode=sse_error trace_id=%s model=%s first_chunk_ms=%s total_ms=%.1f chunks=%s error=%s",
                request_trace_id or '-',
                active_chat_model,
                f"{first_chunk_elapsed_ms:.1f}" if first_chunk_elapsed_ms is not None else '-',
                (time.perf_counter() - req_started) * 1000.0,
                chunk_count,
                stream_err,
            )
            deps['logger'].error("AI 面试流式输出失败: %s", stream_err)
            deps['logger'].error("Full traceback: %s", traceback.format_exc())
            if full_text.strip():
                yield {'type': 'done', 'text': full_text.strip()}
            else:
                yield {'type': 'error', 'message': '面试官暂时开小差了，请稍后再试。'}

    return _iter_events(), None, 200



