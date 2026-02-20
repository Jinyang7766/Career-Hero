import re
import traceback
import json
import copy
import time

from google.genai import types

ANALYSIS_PROMPT_VERSION = "analysis-v2.3"


class PIIMasker:
    """
    Reversible PII masker for server-side defense-in-depth.
    Masks name/phone/email before AI calls and restores placeholders after parsing response.
    """

    _EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
    _PHONE_RE = re.compile(r"(?<!\d)(\+?\d[\d\s-]{7,}\d)(?!\d)")

    def __init__(self, *, user_name: str = "", email: str = "", phone: str = ""):
        self.user_name = str(user_name or '').strip()
        self.email = str(email or '').strip()
        self.phone = str(phone or '').strip()

        self.name_token = '[USER_NAME]'
        self.email_token = '[EMAIL_ADDRESS]'
        self.phone_token = '[PHONE_NUMBER]'

    def mask_text(self, text: str) -> str:
        value = str(text or '')

        if self.user_name:
            value = value.replace(self.user_name, self.name_token)
            compact_name = re.sub(r'\s+', '', self.user_name)
            if compact_name and compact_name != self.user_name:
                value = value.replace(compact_name, self.name_token)

        if self.email:
            value = value.replace(self.email, self.email_token)
        value = self._EMAIL_RE.sub(self.email_token, value)

        if self.phone:
            value = value.replace(self.phone, self.phone_token)
            compact_phone = re.sub(r'[\s-]+', '', self.phone)
            if compact_phone and compact_phone != self.phone:
                value = value.replace(compact_phone, self.phone_token)
        value = self._PHONE_RE.sub(self.phone_token, value)

        return value

    def unmask_text(self, text: str) -> str:
        value = str(text or '')
        if self.user_name:
            value = value.replace(self.name_token, self.user_name)
        if self.email:
            value = value.replace(self.email_token, self.email)
        if self.phone:
            value = value.replace(self.phone_token, self.phone)
        return value

    def mask_object(self, value):
        if isinstance(value, dict):
            return {k: self.mask_object(v) for k, v in value.items()}
        if isinstance(value, list):
            return [self.mask_object(v) for v in value]
        if isinstance(value, str):
            return self.mask_text(value)
        return value

    def unmask_object(self, value):
        if isinstance(value, dict):
            return {k: self.unmask_object(v) for k, v in value.items()}
        if isinstance(value, list):
            return [self.unmask_object(v) for v in value]
        if isinstance(value, str):
            return self.unmask_text(value)
        return value


def _normalize_company_confidence(value, default: float = 0.0) -> float:
    try:
        n = float(value)
    except Exception:
        n = default
    if n < 0:
        return 0.0
    if n > 1:
        return 1.0
    return round(n, 4)


def _fallback_extract_company_with_confidence(text: str):
    raw = str(text or '').strip()
    if not raw:
        return '', 0.0

    invalid_keywords = [
        '职位', '岗位', '要求', '职责', '描述', '薪资', '地点', '福利',
        '任职', '优先', '加分', '简历', '投递', '招聘', '急聘', '高薪',
        '职责描述', '岗位职责', '任职要求', '工作地点', '职位描述', '岗位说明'
    ]

    def _normalize(value: str) -> str:
        candidate = str(value or '').strip().replace('｜', '|')
        candidate = candidate.split('|', 1)[0].strip()
        return candidate

    def _is_valid(name: str) -> bool:
        n = _normalize(name)
        if len(n) < 2 or len(n) > 60:
            return False
        if re.match(r'^(?:[一二三四五六七八九十]|\d+)[、.\s]', n):
            return False
        return not any(k in n for k in invalid_keywords)

    lines = [ln.strip() for ln in raw.split('\n') if ln.strip()]
    labeled_patterns = [
        r'(?:公司|企业|Employer|Company)\s*[:：\s-]*([^\n]+)',
        r'招聘单位\s*[:：\s-]*([^\n]+)',
    ]
    for pattern in labeled_patterns:
        match = re.search(pattern, raw, flags=re.IGNORECASE)
        if match and match.group(1):
            candidate = _normalize(match.group(1))
            if _is_valid(candidate):
                return candidate, 0.78

    company_suffix = re.compile(
        r'(?:公司|集团|有限公司|有限责任公司|工作室|研究院|事务所|科技|网络|技术|咨询|银行|证券|基金|保险|'
        r'Inc\.?|Ltd\.?|LLC|Co\.?|Corporation|Group)$',
        re.IGNORECASE,
    )
    for line in lines[:6]:
        candidate = _normalize(line)
        if company_suffix.search(candidate) and _is_valid(candidate):
            return candidate, 0.62

    return '', 0.0


def _fallback_extract_company_from_jd(text: str) -> str:
    company, _confidence = _fallback_extract_company_with_confidence(text)
    return company


def _collect_resume_numeric_tokens(resume_data) -> set:
    """Collect numeric tokens from resume content for anti-fabrication checks."""
    try:
        safe_resume = copy.deepcopy(resume_data) if isinstance(resume_data, dict) else {}
    except Exception:
        safe_resume = resume_data if isinstance(resume_data, dict) else {}

    if isinstance(safe_resume, dict):
        personal = safe_resume.get('personalInfo')
        if isinstance(personal, dict):
            personal.pop('phone', None)
            personal.pop('email', None)

    text = json.dumps(safe_resume or {}, ensure_ascii=False)
    tokens = set()
    for m in re.finditer(r'\d+(?:\.\d+)?%?', text):
        t = m.group(0)
        tokens.add(t)
        if t.endswith('%'):
            tokens.add(t[:-1])
        else:
            tokens.add(f"{t}%")
    return tokens


def _normalize_suggestion_metric_text(text: str, resume_numeric_tokens: set) -> str:
    value = str(text or '')
    if not value:
        return value

    # Normalize placeholder variants to neutral, non-placeholder wording.
    value = re.sub(r'[\{\[\(（【]?\s*数字\s*[\}\]\)）】]?\s*%', '某可验证比例', value)
    value = re.sub(r'(?<![\u4e00-\u9fffA-Za-z0-9])数字(?![\u4e00-\u9fffA-Za-z0-9])', '某可验证数值', value)
    value = re.sub(r'\b[XYZNMK]{1,3}\s*%\b', '某可验证比例', value)
    value = re.sub(r'\b[XYZNMK]{1,3}\b', '某可验证数值', value)
    value = re.sub(r'\bXX\s*%\b', '某可验证比例', value, flags=re.IGNORECASE)
    value = re.sub(r'\bXX\b', '某可验证数值', value, flags=re.IGNORECASE)

    # Replace concrete numbers not present in the original resume with neutral wording.
    def _replace_unknown_number(match):
        token = match.group(0)
        if token in resume_numeric_tokens:
            return token
        return '某可验证比例' if token.endswith('%') else '某可验证数值'

    value = re.sub(r'\d+(?:\.\d+)?%?', _replace_unknown_number, value)
    value = re.sub(r'(某可验证比例[、，/\s]*){2,}', '某可验证比例', value)
    value = re.sub(r'(某可验证数值[、，/\s]*){2,}', '某可验证数值', value)
    return value


def _sanitize_suggestions_for_metric_consistency(suggestions, resume_data):
    if not isinstance(suggestions, list):
        return []
    resume_numeric_tokens = _collect_resume_numeric_tokens(resume_data)
    cleaned = []
    for item in suggestions:
        if not isinstance(item, dict):
            continue
        suggestion = dict(item)
        target_section = str(suggestion.get('targetSection') or '').strip().lower()
        suggested_value = suggestion.get('suggestedValue')
        if target_section != 'skills' and isinstance(suggested_value, str):
            suggestion['suggestedValue'] = _normalize_suggestion_metric_text(
                suggested_value, resume_numeric_tokens
            )
        cleaned.append(suggestion)
    return cleaned


def _format_diagnosis_dossier(dossier):
    if not isinstance(dossier, dict):
        return ''
    try:
        summary = str(dossier.get('summary') or '').strip()
        score = dossier.get('score')
        target_company = str(dossier.get('targetCompany') or '').strip()
        jd_text = str(dossier.get('jdText') or '').strip()
        score_breakdown = dossier.get('scoreBreakdown') or {}
        overview = dossier.get('suggestionsOverview') or {}
        strengths = dossier.get('strengths') or []
        weaknesses = dossier.get('weaknesses') or []
        missing_keywords = dossier.get('missingKeywords') or []

        lines = []
        if summary:
            lines.append(f"- 诊断总结：{summary}")
        if isinstance(score, (int, float)):
            lines.append(f"- 诊断总分：{int(score)}")
        if target_company:
            lines.append(f"- 目标公司：{target_company}")
        if jd_text:
            lines.append(f"- 目标岗位职位描述（摘要）：{jd_text[:500]}")
        if isinstance(score_breakdown, dict) and score_breakdown:
            lines.append(
                f"- 评分拆解：经验{score_breakdown.get('experience', 0)} / 技能{score_breakdown.get('skills', 0)} / 格式{score_breakdown.get('format', 0)}"
            )
        if isinstance(overview, dict) and overview:
            lines.append(
                f"- 建议概览：总计{overview.get('total', 0)}，待处理{overview.get('pending', 0)}，已采纳{overview.get('accepted', 0)}，已忽略{overview.get('ignored', 0)}"
            )
        if strengths:
            lines.append(f"- 亮点：{'；'.join([str(x) for x in strengths[:6]])}")
        if weaknesses:
            lines.append(f"- 短板：{'；'.join([str(x) for x in weaknesses[:6]])}")
        if missing_keywords:
            lines.append(f"- 缺失关键词：{'、'.join([str(x) for x in missing_keywords[:12]])}")

        return '\n'.join(lines)
    except Exception:
        return ''


def _split_into_sentences(text: str):
    raw = str(text or '').strip()
    if not raw:
        return []
    parts = re.split(r'[\n\r；;。！？!?]+', raw)
    return [p.strip() for p in parts if len(p.strip()) >= 4]


def _is_sentence_low_value(sentence: str):
    text = str(sentence or '').strip()
    if not text:
        return False
    vague_patterns = [
        r'^(负责|参与|协助|配合|跟进|完成|处理)',
        r'(相关工作|日常工作|其他工作|等工作|等事项|相关事项)$',
        r'(良好沟通能力|责任心强|抗压能力强|学习能力强|执行力强)',
    ]
    has_action = bool(re.search(r'(主导|搭建|设计|优化|推进|制定|落地|复盘|重构|协调|沉淀)', text))
    has_result = bool(re.search(r'(提升|增长|达成|实现|降低|缩短|优化|结果|产出|转化|ROI|GMV|留存|复购)', text, re.IGNORECASE))
    too_short = len(text) < 14
    too_vague = any(re.search(p, text, flags=re.IGNORECASE) for p in vague_patterns)
    return too_short or too_vague or (not has_action) or (not has_result)


def _extract_sentence_issue(sentence: str):
    text = str(sentence or '').strip()
    has_action = bool(re.search(r'(主导|搭建|设计|优化|推进|制定|落地|复盘|重构|协调|沉淀)', text))
    has_result = bool(re.search(r'(提升|增长|达成|实现|降低|缩短|优化|结果|产出|转化|ROI|GMV|留存|复购)', text, re.IGNORECASE))
    if (not has_action) and (not has_result):
        return (
            '缺少关键动作与结果闭环，招聘方难判断真实贡献。',
            '补齐“动作-方法-结果”三段信息，突出你个人主导部分。',
            '按 STAR 口径复述该经历，至少补 1 个结果指标或结果口径。'
        )
    if not has_action:
        return (
            '动作描述不足，个人贡献边界不清晰。',
            '补充你具体做了什么、用了什么方法或工具。',
            '将“负责/参与”改写为可执行动作动词（如主导、搭建、优化）。'
        )
    if not has_result:
        return (
            '结果证据不足，价值传达不充分。',
            '补充业务结果或指标变化，体现行动产出。',
            '补 1 条可验证结果（效率、成本、转化、质量任一口径）。'
        )
    return (
        '表达仍可增强岗位匹配度。',
        '强化关键动作与业务目标的因果关系。',
        '将句子压缩为“动作+方法+结果”单句版本。'
    )


def _rewrite_sentence_human(sentence: str, section: str) -> str:
    text = str(sentence or '').strip().strip('。；;，,')
    if not text:
        return ''
    text = re.sub(r'^\s*主要?负责', '主导', text)
    text = re.sub(r'^\s*参与', '协同推进', text)
    text = re.sub(r'^\s*协助', '支持并推进', text)
    text = re.sub(r'^\s*跟进', '持续推进', text)
    has_action = bool(re.search(r'(主导|搭建|设计|优化|推进|制定|落地|复盘|重构|协调|沉淀)', text))
    has_result = bool(re.search(r'(提升|增长|达成|实现|降低|缩短|优化|结果|产出|转化|ROI|GMV|留存|复购)', text, re.IGNORECASE))
    if section == 'summary':
        return f"{text}，围绕目标岗位突出核心能力，并用代表性成果建立可信度。"
    if not has_action and not has_result:
        return f"{text}，我主导关键动作并通过明确方法推进，最终形成可验证的业务结果与复盘结论。"
    if not has_action:
        return f"{text}，补充本人主导动作与执行方法，强化个人贡献识别度。"
    if not has_result:
        return f"{text}，并补充关键结果口径，体现行动带来的业务价值。"
    return f"{text}，并进一步突出该结果对目标岗位的直接价值。"


def _split_compound_suggestions(suggestions):
    source = suggestions if isinstance(suggestions, list) else []
    out = []
    for item in source:
        if not isinstance(item, dict):
            continue
        s = dict(item)
        reason = str(s.get('reason') or '').strip()
        # Split overlong "问题1/问题2..." blobs into separate items.
        if not re.search(r'问题\s*\d+\s*[:：]', reason):
            out.append(s)
            continue
        parts = re.split(r'(?=问题\s*\d+\s*[:：])', reason)
        valid_parts = [p.strip(' \n\r\t；;，,。') for p in parts if p and p.strip()]
        if len(valid_parts) <= 1:
            out.append(s)
            continue
        for idx, piece in enumerate(valid_parts, start=1):
            ns = dict(s)
            ns['id'] = f"{s.get('id') or 'suggestion'}-split-{idx}"
            ns['title'] = re.sub(r'改进建议', '问题', str(s.get('title') or '问题')).strip() or '问题'
            ns['reason'] = piece
            out.append(ns)
    return out


def _normalize_training_day_labels(text: str) -> str:
    value = str(text or '')
    if not value:
        return ''

    digit_map = {
        '零': 0, '〇': 0,
        '一': 1, '二': 2, '两': 2, '三': 3, '四': 4,
        '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
    }

    def _parse_day_token(token: str):
        token = str(token or '').strip()
        if not token:
            return None
        if token.isdigit():
            try:
                n = int(token)
            except Exception:
                return None
            return n if 0 < n <= 99 else None

        if token == '十':
            return 10
        if token.startswith('十'):
            tail = token[1:]
            if len(tail) == 1 and tail in digit_map:
                return 10 + int(digit_map[tail])
            return None
        if token.endswith('十'):
            head = token[:-1]
            if len(head) == 1 and head in digit_map and digit_map[head] > 0:
                return int(digit_map[head]) * 10
            return None
        if len(token) == 2 and token[0] in digit_map and token[1] in digit_map and digit_map[token[0]] > 0:
            return int(digit_map[token[0]]) * 10 + int(digit_map[token[1]])
        if len(token) == 1 and token in digit_map and digit_map[token] > 0:
            return int(digit_map[token])
        return None

    def _replace_cn_day(match):
        token = match.group(1)
        n = _parse_day_token(token)
        if not n:
            return match.group(0)
        return f'Day {n}'

    normalized = re.sub(r'第\s*([0-9]{1,2}|[零〇一二两三四五六七八九十]{1,3})\s*天', _replace_cn_day, value)
    normalized = re.sub(r'\bday\s*([0-9]{1,2})\b', lambda m: f"Day {int(m.group(1))}", normalized, flags=re.IGNORECASE)
    return normalized


def _collect_resume_fragments_for_coverage(resume_data):
    fragments = []
    if not isinstance(resume_data, dict):
        return fragments

    personal = resume_data.get('personalInfo') or {}
    summary = str(resume_data.get('summary') or personal.get('summary') or '').strip()
    for sentence in _split_into_sentences(summary):
        fragments.append({'section': 'summary', 'text': sentence, 'label': '个人简介'})

    for exp in (resume_data.get('workExps') or []):
        desc = str(exp.get('description') or '').strip()
        role = str(exp.get('subtitle') or exp.get('title') or exp.get('company') or '工作经历').strip()
        for sentence in _split_into_sentences(desc):
            fragments.append({'section': 'workExps', 'text': sentence, 'label': role})

    for proj in (resume_data.get('projects') or []):
        desc = str(proj.get('description') or '').strip()
        role = str(proj.get('title') or proj.get('subtitle') or '项目经历').strip()
        for sentence in _split_into_sentences(desc):
            fragments.append({'section': 'projects', 'text': sentence, 'label': role})

    return fragments


def _ensure_sentence_level_coverage(suggestions, resume_data):
    base = _split_compound_suggestions(suggestions if isinstance(suggestions, list) else [])
    fragments = _collect_resume_fragments_for_coverage(resume_data)
    if not fragments:
        return base

    def _norm(v: str):
        return re.sub(r'[\s\W_]+', '', str(v or '').lower())

    existing_blob = _norm(' '.join([
        str(item.get('originalValue') or '') + ' ' + str(item.get('reason') or '') + ' ' + str(item.get('title') or '')
        for item in base if isinstance(item, dict)
    ]))

    def _rewrite_sentence(sentence: str, section: str) -> str:
        text = str(sentence or '').strip().strip('。；;')
        if not text:
            return ''
        text = re.sub(r'^\s*负责', '主导', text)
        text = re.sub(r'^\s*参与', '协同推进', text)
        text = re.sub(r'^\s*主要负责', '主导', text)
        has_result_signal = bool(re.search(r'(提升|增长|优化|达成|实现|降低|缩短|沉淀|建立|完善)', text))
        if not has_result_signal:
            if section in ('workExps', 'projects'):
                text = f"{text}，并补充关键动作后的业务结果与复盘结论。"
            else:
                text = f"{text}，并用结果导向表达强化岗位匹配度。"
        return text

    augmented = list(base)
    used = len(augmented)
    seen_sentence = set()
    for frag in fragments:
        sentence = str(frag.get('text') or '').strip()
        if not sentence:
            continue
        ns = _norm(sentence)
        if not ns or ns in seen_sentence:
            continue
        seen_sentence.add(ns)
        if not _is_sentence_low_value(sentence):
            continue
        ns = _norm(sentence)
        if ns and ns in existing_blob:
            continue
        section = str(frag.get('section') or 'workExps')
        label = str(frag.get('label') or '简历内容')
        suggested = _rewrite_sentence_human(sentence, section)
        if not suggested:
            continue
        issue, improve, practice = _extract_sentence_issue(sentence)
        augmented.append({
            'id': f'suggestion-coverage-{used + 1}',
            'type': 'optimization',
            'title': f'{label}逐句批注',
            'reason': f'问题：{issue} 改进：{improve} 练习：{practice}',
            'targetSection': section,
            'targetField': 'description' if section in ('workExps', 'projects') else ('summary' if section == 'summary' else None),
            'originalValue': sentence,
            'suggestedValue': suggested
        })
        used += 1
    return augmented


def _sanitize_final_stage_suggestions(suggestions, resume_data):
    source = suggestions if isinstance(suggestions, list) else []
    resume = resume_data if isinstance(resume_data, dict) else {}
    has_projects = bool(resume.get('projects'))

    cleaned = []
    for idx, item in enumerate(source, start=1):
        if not isinstance(item, dict):
            continue
        s = dict(item)
        s['id'] = s.get('id') or f'suggestion-{idx}'
        s['type'] = s.get('type') or 'optimization'
        s['title'] = str(s.get('title') or '优化建议').strip()
        s['targetSection'] = str(s.get('targetSection') or '').strip()

        reason = str(s.get('reason') or '').strip()
        reason = re.sub(r'\s*[-=]*>\s*', '，', reason)
        reason = re.sub(r'\s+', ' ', reason).strip(' ，;；')
        if not reason:
            reason = '该项内容可进一步强化岗位匹配表达。'

        # Fix false positive: resume already has projects.
        if has_projects and s['targetSection'].lower() == 'projects':
            reason = re.sub(r'简历(?:目前)?缺[乏少]独立的?项目(?:经历)?模块[，,。]?', '', reason)
            reason = re.sub(r'缺[乏少]独立(?:项目)?案例[，,。]?', '', reason)
            reason = reason.strip(' ，;；')
            if not reason:
                reason = '建议将现有项目改写为“动作-方法-结果”结构，强化可验证性。'

        # Remove noisy phrasing.
        reason = re.sub(r'建议按\s*STAR\s*结构完整表达[。]?', '建议补充动作细节与结果指向。', reason, flags=re.IGNORECASE)
        reason = re.sub(r'^\s*该句[，,:：\s]*', '', reason)
        reason = re.sub(r'^\s*此句[，,:：\s]*', '', reason)
        if ('问题：' not in reason) and ('改进：' not in reason) and ('练习：' not in reason):
            if '建议补充动作细节与结果指向' in reason:
                reason = '问题：动作与结果证据不足。 改进：补充关键动作细节与结果指向。 练习：按 STAR 口径补写一条可验证结果。'
        s['reason'] = reason[:160]

        cleaned.append(s)

    return cleaned


def _compact_text(value: str) -> str:
    return re.sub(r'[\s\W_]+', '', str(value or '').lower())


def _merge_duplicate_suggestions(suggestions):
    source = suggestions if isinstance(suggestions, list) else []
    prepared = []
    for idx, item in enumerate(source, start=1):
        if not isinstance(item, dict):
            continue
        s = dict(item)
        s['id'] = s.get('id') or f'suggestion-{idx}'
        s['type'] = s.get('type') or 'optimization'
        s['title'] = str(s.get('title') or '优化建议').strip()
        s['targetSection'] = str(s.get('targetSection') or '').strip()
        s['targetField'] = str(s.get('targetField') or '').strip()
        s['reason'] = str(s.get('reason') or '').strip()
        prepared.append(s)

    # Drop suggestions that do not change content (original == suggested).
    filtered = []
    for s in prepared:
        original_value = s.get('originalValue')
        suggested_value = s.get('suggestedValue')
        if isinstance(original_value, str) and isinstance(suggested_value, str):
            if _compact_text(original_value) and _compact_text(original_value) == _compact_text(suggested_value):
                continue
        filtered.append(s)

    grouped = {}
    order = []
    for s in filtered:
        suggested_value = s.get('suggestedValue')
        if isinstance(suggested_value, str):
            key = (
                str(s.get('targetSection') or '').strip().lower(),
                str(s.get('targetField') or '').strip().lower(),
                _compact_text(s.get('title') or ''),
                _compact_text(s.get('reason') or ''),
                _compact_text(suggested_value),
            )
        else:
            key = ('__non_str__', str(s.get('id') or ''))
        if key not in grouped:
            grouped[key] = {
                'base': s,
                'originals': [],
                'seen': set(),
            }
            order.append(key)
        original_value = str(s.get('originalValue') or '').strip()
        norm_original = _compact_text(original_value)
        if original_value and norm_original and norm_original not in grouped[key]['seen']:
            grouped[key]['seen'].add(norm_original)
            grouped[key]['originals'].append(original_value)

    merged = []
    for key in order:
        entry = grouped[key]
        base = dict(entry['base'])
        originals = entry['originals']

        reason = str(base.get('reason') or '').strip()
        reason_tail = re.sub(r'^(该句|这些句子)[，,:：。\s]*', '', reason)
        reason_tail = reason_tail.strip() or '建议补充动作细节与结果指向。'

        if len(originals) > 1:
            base['originalValue'] = '\n'.join(originals)
            if reason_tail.startswith('建议'):
                base['reason'] = f"这些句子{reason_tail}"
            else:
                base['reason'] = f"这些句子存在同类问题，{reason_tail}"
        else:
            if originals:
                base['originalValue'] = originals[0]
            if reason_tail.startswith('建议'):
                base['reason'] = f"该句{reason_tail}"
            else:
                base['reason'] = f"该句{reason_tail}"

        base['reason'] = str(base.get('reason') or '').strip()[:160]
        merged.append(base)

    return merged


def _prioritize_final_stage_suggestions(suggestions, score):
    source = suggestions if isinstance(suggestions, list) else []
    if not source:
        return []

    def _norm_text(v):
        return re.sub(r'\s+', ' ', str(v or '')).strip().lower()

    def _signature(item):
        if not isinstance(item, dict):
            return ''
        return '||'.join([
            _norm_text(item.get('targetSection')),
            _norm_text(item.get('targetField')),
            _norm_text(item.get('title')),
            _norm_text(item.get('reason')),
            _norm_text(item.get('originalValue')),
        ])

    generic_note_re = re.compile(
        r'(表达更清晰|建议优化表述|建议进一步优化|建议补充细节|建议完善描述|措辞|语气|版式|排版|可读性)',
        re.IGNORECASE,
    )
    critical_gap_re = re.compile(
        r'(缺口|缺失|不足|未体现|不匹配|证据不足|无法验证|缺少|未覆盖|没有体现|薄弱|风险)',
        re.IGNORECASE,
    )

    deduped = []
    seen = set()
    for item in source:
        if not isinstance(item, dict):
            continue
        sig = _signature(item)
        if not sig or sig in seen:
            continue
        seen.add(sig)
        deduped.append(item)

    critical = []
    non_critical = []
    for item in deduped:
        blob = f"{item.get('title', '')} {item.get('reason', '')} {item.get('suggestedValue', '')}"
        if generic_note_re.search(blob):
            continue
        if critical_gap_re.search(blob):
            critical.append(item)
        else:
            non_critical.append(item)

    ordered = critical + non_critical

    try:
        n_score = int(float(score))
    except Exception:
        n_score = 0
    if n_score >= 88:
        cap = 3
    elif n_score >= 80:
        cap = 4
    elif n_score >= 70:
        cap = 5
    else:
        cap = 6

    return ordered[:cap]


def _build_final_stage_annotation_suggestions(suggestions, resume_data, score):
    # Keep high-impact suggestions first, then restore sentence-level coverage
    # so the comparison page can still render inline annotations.
    prioritized = _prioritize_final_stage_suggestions(suggestions, score)
    prioritized = _sanitize_final_stage_suggestions(prioritized, resume_data)
    covered = _ensure_sentence_level_coverage(prioritized, resume_data)
    covered = _sanitize_final_stage_suggestions(covered, resume_data)
    covered = _merge_duplicate_suggestions(covered)
    # No hard cap: keep full sentence-level annotations for detailed review.
    return covered or []


def _resolve_micro_interview_first_question(ai_result, job_description):
    question = str((ai_result or {}).get('microInterviewFirstQuestion') or '').strip()
    if question:
        return question

    weaknesses = [str(x).strip() for x in ((ai_result or {}).get('weaknesses') or []) if str(x).strip()]
    missing_keywords = [str(x).strip() for x in ((ai_result or {}).get('missingKeywords') or []) if str(x).strip()]
    jd_hint = '，并结合目标岗位要求' if str(job_description or '').strip() else ''

    if weaknesses:
        return f"你提到简历中“{weaknesses[0]}”较薄弱。请给我一个最能证明你能力的具体案例{jd_hint}，并补充你采取了什么行动、最终结果数据是多少？"
    if missing_keywords:
        return f"你的简历与岗位存在关键词缺口（如：{missing_keywords[0]}）。请补充一段真实经历{jd_hint}，说明你如何使用这项能力并带来可量化结果。"
    return "请先补充一条与你目标岗位最相关的真实经历：你具体做了什么、用了什么方法、最终结果如何（尽量给出数据）？"


def _build_analysis_prompt(
    *,
    resume_data,
    job_description,
    rag_context,
    format_resume_for_ai,
    analysis_stage='pre_interview',
    interview_summary='',
    interview_chat_history='',
    diagnosis_context='',
):
    stage = str(analysis_stage or '').strip().lower()
    if stage == 'pre_interview':
        if job_description:
            return f"""
你是一位严格的资深简历诊断顾问。当前处于“微访谈前预评估”阶段，只需给出粗粒度评价，不做详细改写。
要求：
1) 只输出总体判断、分维度评分、亮点与短板，不生成逐条优化建议。
2) `suggestions` 必须返回空数组 []。
3) 总结控制在 80~150 字，语气客观。
4) 可给出缺失关键词（missingKeywords），数量最多 5 个，不要给可直接替换的改写文本。
5) summary 中禁止出现“建议/可改为/补充为/优化为”等措辞，只做现状判断。
6) 返回合法 JSON，字段值中文；所有 key 必须完整返回，不得省略。
7) 必须生成 microInterviewFirstQuestion：基于当前短板生成“微访谈第一问”，用于用户点击进入微访谈后立即提问。

简历：
{format_resume_for_ai(resume_data)}

职位描述：
{job_description}

仅返回 JSON：
{{
  "score": 60,
  "scoreBreakdown": {{
    "experience": 58,
    "skills": 52,
    "format": 66
  }},
  "summary": "微访谈前初步评估总结",
  "microInterviewFirstQuestion": "请补充一条最能体现岗位匹配度的真实经历，重点说明你的行动方法与量化结果。",
  "targetCompany": "从职位描述识别出的目标公司名称，无法确定时返回空字符串",
  "targetCompanyConfidence": 0.0,
  "strengths": ["亮点1", "亮点2"],
  "weaknesses": ["短板1", "短板2", "短板3"],
  "suggestions": [],
  "missingKeywords": ["关键词1", "关键词2"]
}}

{rag_context}
"""
        return f"""
你是一位严格的资深简历诊断顾问。当前处于“微访谈前预评估”阶段，只需给出粗粒度评价，不做详细改写。
要求：
1) 只输出总体判断、分维度评分、亮点与短板，不生成逐条优化建议。
2) `suggestions` 必须返回空数组 []。
3) 总结控制在 80~150 字，语气客观。
4) missingKeywords 最多 5 个。
5) summary 中禁止出现“建议/可改为/补充为/优化为”等措辞，只做现状判断。
6) 返回合法 JSON，字段值中文；所有 key 必须完整返回，不得省略。
7) 必须生成 microInterviewFirstQuestion：基于当前短板生成“微访谈第一问”，用于用户点击进入微访谈后立即提问。

简历：
{format_resume_for_ai(resume_data)}

仅返回 JSON：
{{
  "score": 60,
  "scoreBreakdown": {{
    "experience": 58,
    "skills": 52,
    "format": 66
  }},
  "summary": "微访谈前初步评估总结",
  "microInterviewFirstQuestion": "请补充一个你最能证明岗位匹配度的案例，说明你做了什么、结果提升了哪些指标。",
  "targetCompany": "",
  "targetCompanyConfidence": 0.0,
  "strengths": ["亮点1", "亮点2"],
  "weaknesses": ["短板1", "短板2", "短板3"],
  "suggestions": [],
  "missingKeywords": []
}}

{rag_context}
"""

    is_final_stage = stage in {
        'final',
        'final_report',
        'final_optimization',
        'post_interview',
        'report',
        'optimization',
    }

    final_stage_requirements = """
13. 最终阶段必须明确“岗位关键任务的支撑缺口”，写入 weaknesses 与 suggestions。
14. reason 必须一句话直指缺口，禁止模板化空话与同义重复。
15. 无法确认数字时用中性结果口径，不得编造与占位符。
""" if is_final_stage else ""

    format_requirements = f"""
输出规范（精简版）：
1. 仅返回合法 JSON，所有顶层字段必须返回；`score`/`scoreBreakdown` 为整数。
2. 评分表示“候选人综合匹配度”，不是排版分。`experience/skills/format` 按任务匹配、能力匹配、综合表现打分。
3. suggestions 仅保留高影响缺口（建议 3-6 条），不得凑数量。
4. 每条 suggestion 必须包含 id/type/title/reason/targetSection/suggestedValue。
5. targetSection 仅允许：summary、workExps、projects、skills、education、certificates。
6. suggestedValue 必须是可直接写入简历的终稿文本；禁止“建议/例如/示例/待补充”。
7. skills 的 suggestedValue 必须是硬技能名词数组；大模型同类统一为 `LLM`，禁止动作词与泛词。
8. 严禁基于占位符误判“信息缺失”；严禁性别偏见建议；严禁修改教育事实字段。
9. 若能识别目标公司，填写 targetCompany 与 0~1 的 targetCompanyConfidence。
10. 批注建议遵循人工逻辑：先模块结论，再逐句问题；每条建议只对应一个问题。
{final_stage_requirements}
{rag_context}
"""

    final_context_block = ""
    if is_final_stage:
        final_context_block = f"""
最终报告补充上下文（仅用于事实校验与归纳，不得臆造）：
- 微访谈总结：
{str(interview_summary or '').strip() or '未提供'}
- 微访谈关键对话：
{str(interview_chat_history or '').strip() or '未提供'}
- 用户画像（历史诊断档案）：
{str(diagnosis_context or '').strip() or '未提供'}
"""

    if job_description:
        return f"""
请扮演**严格的资深简历诊断顾问**，以“通过初筛”为目标，**严格对照 职位描述 与简历逐条核对**，输出“高影响、低冗余”的优化建议（建议 3-6 条）。
请使用中文输出，字段值必须为中文。

评分标准（总分100，候选人综合匹配度评分）：
- 任务/经历匹配（40分，对应 scoreBreakdown.experience）：工作经历与职位描述关键任务的重合度、可验证案例支撑强度。
- 能力/技能匹配（35分，对应 scoreBreakdown.skills）：关键能力与技能（工具、方法、业务能力）覆盖率与深度。
- 综合表现质量（25分，对应 scoreBreakdown.format）：证据可信度、表达结构清晰度、微访谈反馈（若有）与发展潜力。

简历：
{format_resume_for_ai(resume_data)}

职位描述：
{job_description}
{final_context_block}

请仅返回 JSON（仅中文内容）：
{{
  "score": 85,
  "scoreBreakdown": {{
    "experience": 35,
    "skills": 25,
    "format": 25
  }},
  "summary": "候选人综合匹配度评估简述（控制在100字以内）。",
  "targetCompany": "从职位描述识别出的目标公司名称，无法确定时返回空字符串",
  "targetCompanyConfidence": 0.0,
  "strengths": ["优势1", "优势2"],
  "weaknesses": ["不足1", "不足2"],
  "suggestions": [
    {{
      "id": "suggestion-1",
      "type": "optimization",
      "title": "工作经历优化",
      "reason": "建议补充更多可量化的业绩指标。",
      "targetSection": "workExps",
      "originalValue": "原内容",
      "suggestedValue": "在核心项目中通过优化算法重构关键链路，系统响应速度明显提升。"
    }},
    {{
      "id": "suggestion-skills",
      "type": "missing",
      "title": "核心技能补全",
      "reason": "职位描述对AI工程能力有很高要求，建议补齐相关技能。",
      "targetSection": "skills",
      "suggestedValue": ["Prompt Engineering", "RAG", "Agent 设计", "Vector DB"]
    }}
  ],
  "missingKeywords": ["关键词1", "关键词2"]
}}

{format_requirements}
"""

    return f"""
请扮演**严格的资深简历诊断顾问**，以“通过初筛”为目标，输出“高影响、低冗余”的优化建议（建议 3-6 条）。
请使用中文输出，字段值必须为中文。

评分标准（总分100，候选人综合匹配度评分）：
- 任务/经历匹配（40分，对应 scoreBreakdown.experience）：经历与目标岗位任务的契合度、案例真实性与相关性。
- 能力/技能匹配（35分，对应 scoreBreakdown.skills）：关键能力、方法与技能栈的覆盖与深度。
- 综合表现质量（25分，对应 scoreBreakdown.format）：证据密度、表达结构、可迁移能力与潜力。

简历：
{format_resume_for_ai(resume_data)}
{final_context_block}

请仅返回 JSON（仅中文内容）：
{{
  "score": 75,
  "scoreBreakdown": {{
    "experience": 30,
    "skills": 20,
    "format": 25
  }},
  "summary": "候选人综合匹配度评估简述（控制在100字以内）。",
  "targetCompany": "从职位描述识别出的目标公司名称，无法确定时返回空字符串",
  "targetCompanyConfidence": 0.0,
  "strengths": ["优势1", "优势2"],
  "weaknesses": ["不足1", "不足2"],
  "suggestions": [
    {{
      "id": "suggestion-1",
      "type": "optimization",
      "title": "个人简介优化",
      "reason": "建议突出核心竞争力，让招聘方一眼看到你的价值。",
      "targetSection": "summary",
      "originalValue": "原内容",
      "suggestedValue": "具有5年Java开发经验，精通Spring Boot框架，曾主导千万级高并发系统设计..."
    }},
    {{
      "id": "suggestion-skills",
      "type": "missing",
      "title": "技能栈补全",
      "reason": "当前技能列表较单薄，建议补充与目标职位相关的专业技能。",
      "targetSection": "skills",
      "suggestedValue": ["Python", "数据可视化", "SQL", "项目管理"]
    }}
  ],
  "missingKeywords": []
}}

{format_requirements}
"""


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

    def _try_generate_final_resume_for_report(_score, _suggestions):
        if not is_final_report_stage:
            return None
        generator = deps.get('generate_optimized_resume')
        if not callable(generator):
            return None
        try:
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
                suggestions=_suggestions or [],
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


def ai_chat_core(data, deps):
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
    interview_mode = str(data.get('interviewMode') or 'comprehensive').strip().lower()
    interview_focus = str(data.get('interviewFocus') or '').strip()
    try:
        question_limit = int(data.get('questionLimit') or 0)
    except Exception:
        question_limit = 0
    if question_limit <= 0:
        question_limit = 3 if interview_mode == 'simple' else 12
    question_limit = max(3, min(12, question_limit))
    # In simple mode we still keep high-value questions, but only generate 2 custom questions
    # because warmup question is added by frontend as question #1.
    plan_generation_limit = 2 if interview_mode == 'simple' else question_limit
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
        return {'error': '消息内容不能为空'}, 400

    clean_message = message.replace('[INTERVIEW_MODE]', '').replace('[INTERVIEW_SUMMARY]', '').strip()

    if mode == 'interview_plan':
        self_intro_re = re.compile(r'(自我介绍|介绍一下你自己|简单介绍一下自己)')
        warmup_by_type = {
            'general': '请先做一个1分钟的自我介绍，重点突出与你目标岗位最相关的经历与优势。',
            'technical': '你最引以为傲的职业成就是什么？或者一个你最近解决过的棘手问题是什么？',
            'hr': '请用三个关键词定义你的个人工作风格，并分别说明一个真实体现该关键词的例子。',
        }
        warmup_question = warmup_by_type.get(interview_type, warmup_by_type['general'])
        warmup_pattern_by_type = {
            'general': re.compile(r'(自我介绍|介绍一下你自己|简单介绍一下自己)'),
            'technical': re.compile(r'(最引以为傲.*职业成就|最近解决.*棘手问题)'),
            'hr': re.compile(r'(三个关键词.*工作风格|体现该关键词)'),
        }
        warmup_pattern = warmup_pattern_by_type.get(interview_type, warmup_pattern_by_type['general'])

        def _normalize_question_text(value):
            text = str(value or '').strip().lower()
            return re.sub(r'[\s\.,;:!?，。！？；：、（）()\[\]{}<>《》“”"\'`~\-—_]+', '', text)

        def _looks_like_warmup_question(value):
            q = str(value or '').strip()
            if not q:
                return False
            if warmup_pattern.search(q):
                return True
            nq = _normalize_question_text(q)
            nw = _normalize_question_text(warmup_question)
            if not nq or not nw:
                return False
            if nq == nw:
                return True
            return (nq in nw) or (nw in nq)

        default_questions_by_type = {
            'general': [
                '请介绍一个你最有代表性的项目，并说明你的具体职责。',
                '这个项目的关键挑战是什么？你是如何解决的？',
                '请分享一次跨团队协作推进结果的案例。',
                '请讲一个你做过关键决策的场景，并说明你的判断依据。',
                '如果再做一次，你会如何优化？',
                '你为什么想加入这个岗位/公司？你的3个月目标是什么？',
                '请补充一个能体现你岗位匹配度的经历或成果。',
            ],
            'technical': [
                '请详细介绍一个你主导的核心项目，并说明你负责的技术模块。',
                '这个项目在技术实现上最难的点是什么？你是如何攻克的？',
                '你做过哪些性能、稳定性或成本优化？请给出量化结果。',
                '请讲一次线上故障排查经历，你的定位过程和修复策略是什么？',
                '如果业务规模翻倍，你会如何改造当前架构？',
                '你如何保障代码质量、可维护性和团队协作效率？',
                '回看这个项目，你认为最大的技术遗憾与改进方向是什么？',
            ],
            'hr': [
                '请分享一次你与同事或上级出现分歧并达成一致的经历。',
                '在高压和紧急任务下，你如何保证交付质量？',
                '请讲一个你主动推动改进并拿到结果的案例。',
                '你选择这份工作的核心动机是什么？',
                '你如何规划接下来两年的职业发展？',
                '如果加入我们，你前3个月会如何快速融入并创造价值？',
                '请补充一个最能体现你稳定性与责任感的真实经历。',
            ],
        }
        default_questions = default_questions_by_type.get(interview_type, default_questions_by_type['general'])
        min_count = 2 if interview_mode == 'simple' else (3 if question_limit <= 3 else 4)

        def _sanitize_plan_questions(items, *, min_count=min_count, max_count=plan_generation_limit):
            sanitized = []
            for item in (items or []):
                q = str(item or '').strip()
                if not q:
                    continue
                if self_intro_re.search(q):
                    continue
                if _looks_like_warmup_question(q):
                    continue
                if q in sanitized:
                    continue
                sanitized.append(q)
                if len(sanitized) >= max_count:
                    break
            if len(sanitized) < min_count:
                for fallback_q in default_questions:
                    if self_intro_re.search(fallback_q):
                        continue
                    if fallback_q in sanitized:
                        continue
                    sanitized.append(fallback_q)
                    if len(sanitized) >= min_count:
                        break
            return sanitized[:max_count]

        if not (deps['gemini_client'] and deps['check_gemini_quota']()):
            return {
                'success': True,
                'questions': _sanitize_plan_questions(default_questions, min_count=min_count, max_count=plan_generation_limit),
                'coverage': ['岗位匹配', '项目经历', '问题解决', '协作沟通', '复盘优化', '动机规划'],
                'planSource': 'fallback_quota_or_config',
                'modelAvailable': bool(deps['gemini_client']),
            }, 200
        try:
            role_hint = {
                'technical': '技术面（项目深挖）',
                'hr': 'HR面（文化匹配）',
                'general': '初试（综合基础面）',
            }.get(interview_type, '初试（综合基础面）')
            prompt = f"""
你是一位资深面试官，请为候选人生成一套“完整且不重复”的模拟面试题单。
要求：
- 面试类型：{role_hint}
- 面试模式：{'精简模式（总计3题：热身题1 + 深挖题2，难度不降低）' if interview_mode == 'simple' else '全面模式（完整题单）'}
- 本次仅需生成：{plan_generation_limit}道“核心深挖题”（热身题由系统固定添加，不需要你生成）
- 结合岗位职位描述与候选人简历定制，问题要具体。
- 一次性给出全部题目，必须严格等于要求题量，不得多也不得少。
- 问题必须是高价值筛选题，不得因为“精简模式”而降低难度或泛化提问。
- 题目顺序要从浅入深，覆盖面完整，避免语义重复。
- 严禁出现“自我介绍”相关题目（例如“请做自我介绍/介绍一下你自己”）。
- 严禁生成与本场热身题重合或近似的题目。本场热身题为：{warmup_question}
- 如果提供了“训练重点”，请优先围绕该重点出题：{interview_focus if interview_focus else '未提供'}
- 仅输出 JSON，不要任何解释文字。
- JSON 格式：
{{
  "questions": ["问题1", "问题2", "..."],
  "coverage": ["覆盖点1", "覆盖点2", "..."]
}}

职位描述：{job_description if job_description else '未提供'}
简历信息：{deps['format_resume_for_ai'](resume_data) if resume_data else '未提供'}
诊断档案：{diagnosis_context if diagnosis_context else '未提供'}
"""
            response, _used = deps['_gemini_generate_content_resilient'](deps['GEMINI_INTERVIEW_MODEL'], prompt, want_json=False)
            raw_text = (response.text or "").strip()
            parsed = deps['_parse_json_object_from_text'](raw_text)
            questions = []
            coverage = []
            if isinstance(parsed, dict):
                q = parsed.get('questions')
                c = parsed.get('coverage')
                if isinstance(q, list):
                    questions = [str(x).strip() for x in q if str(x).strip()]
                if isinstance(c, list):
                    coverage = [str(x).strip() for x in c if str(x).strip()]
            questions = _sanitize_plan_questions(questions or default_questions, min_count=min_count, max_count=plan_generation_limit)
            return {
                'success': True,
                'questions': questions,
                'coverage': coverage,
                'planSource': 'model',
                'modelAvailable': True,
            }, 200
        except Exception as e:
            deps['logger'].warning("Interview plan generation failed: %s", e)
            return {
                'success': True,
                'questions': _sanitize_plan_questions(default_questions, min_count=min_count, max_count=plan_generation_limit),
                'coverage': ['岗位匹配', '项目经历', '问题解决', '协作沟通', '复盘优化', '动机规划'],
                'planSource': 'fallback_error',
                'modelAvailable': True,
            }, 200

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
        is_self_intro_q = bool(re.search(r'(自我介绍|介绍一下你自己|简单介绍一下自己)', last_q or ''))
        if has_audio and not clean_message:
            transcript = ''
            try:
                transcript, _provider, _err = _transcribe_audio_with_gemini(audio, deps, lang='zh-CN')
            except Exception as stt_err:
                deps['logger'].warning("Interview STT check failed, continuing without transcript: %s", stt_err)
                transcript = ''
            if not str(transcript or '').strip():
                question = last_q or '请再说一遍你的回答。'
                return {'response': f"我没有识别到有效的语音内容。请重新回答：{question}"}, 200
            clean_message = str(transcript).strip()

        if _is_low_information_answer(clean_message):
            question = last_q or '请把你的回答说得更具体一些。'
            return {'response': f"你的回答信息量不足。请只补充当前问题中缺失的关键点（例如你的具体职责、行动细节、结果数据），无需整题重答。当前问题：{question}"}, 200

    if deps['gemini_client'] and deps['check_gemini_quota']():
        try:
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

            interview_summary_model = deps.get('GEMINI_INTERVIEW_SUMMARY_MODEL', deps.get('GEMINI_INTERVIEW_MODEL'))
            interview_chat_model = deps.get('GEMINI_INTERVIEW_MODEL')
            active_chat_model = interview_summary_model if mode == 'interview_summary' else interview_chat_model

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

            response, _used = deps['_gemini_generate_content_resilient'](active_chat_model, contents, want_json=False)
            raw_text = (response.text or "").strip()
            parsed = deps['_parse_json_object_from_text'](raw_text)
            if isinstance(parsed, dict):
                raw_text = parsed.get('response') or parsed.get('text') or parsed.get('message') or parsed.get('reply') or raw_text
            raw_text = (raw_text or '').replace('*', '').strip()

            text = raw_text if isinstance(raw_text, str) and raw_text.strip() else '感谢你的回答，我们继续下一题。'
            if mode == 'interview_summary':
                text = _normalize_training_day_labels(text)
            return {'response': text}, 200
        except Exception as ai_error:
            deps['logger'].error("AI 面试失败: %s", ai_error)
            return {'response': '面试官暂时开小差了，请稍后再试。'}, 200
    return {'response': '面试官暂时开小差了。'}, 200


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

    clean_message = message.replace('[INTERVIEW_MODE]', '').replace('[INTERVIEW_SUMMARY]', '').strip()

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
                    text = _normalize_training_day_labels(text)
                deps['logger'].info(
                    "interview_stream_latency mode=fallback trace_id=%s model=%s model_ms=%.1f total_ms=%.1f text_len=%s",
                    request_trace_id or '-',
                    active_chat_model,
                    model_elapsed_ms,
                    (time.perf_counter() - req_started) * 1000.0,
                    len(text or ''),
                )
                yield {'type': 'done', 'text': text or '感谢你的回答，我们继续下一题。'}
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
                final_text = _normalize_training_day_labels(final_text)
            deps['logger'].info(
                "interview_stream_latency mode=sse trace_id=%s model=%s first_chunk_ms=%s total_ms=%.1f chunks=%s text_len=%s",
                request_trace_id or '-',
                active_chat_model,
                f"{first_chunk_elapsed_ms:.1f}" if first_chunk_elapsed_ms is not None else '-',
                (time.perf_counter() - req_started) * 1000.0,
                chunk_count,
                len(final_text or ''),
            )
            yield {'type': 'done', 'text': final_text or '感谢你的回答，我们继续下一题。'}
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


def transcribe_core(data, deps):
    audio = data.get('audio') or {}
    lang = (data.get('lang') or 'zh-CN').strip() or 'zh-CN'
    if not isinstance(audio, dict) or not audio.get('data'):
        return {'success': False, 'text': '', 'error': '缺少音频数据'}, 400

    text, provider, error = _transcribe_audio_with_gemini(audio, deps, lang=lang)
    if text:
        return {'success': True, 'text': text, 'provider': provider}, 200
    return {'success': False, 'text': '', 'error': error or '转写失败'}, 200

