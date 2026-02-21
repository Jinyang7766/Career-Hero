import re
import json
import copy

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

