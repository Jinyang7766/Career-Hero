import copy
import re
from typing import Any, Iterable, List, Optional

DEFAULT_SKILL_LIMIT = 10
MIN_SKILL_LIMIT = 8
MAX_SKILL_LIMIT = 12

_GENERIC_NOISE = {
    '技能', '专业技能', '核心技能', '能力', '经验', '项目', '流程', '策略', '方案',
    '协同', '沟通', '管理', '运营', '分析', '执行', '复盘', '业务', '结果', '增长',
}

_CERT_RE = re.compile(
    r'(pmp|cfa|frm|cpa|acca|cisp|cissp|软考|教师资格|法律职业资格|基金从业|证券从业|银行从业|建造师|会计师|cet[-\s]?[46]|tem[-\s]?[48]|ielts|toefl|ncre|证书|认证|资格证)',
    flags=re.IGNORECASE,
)

_TECH_HINT_RE = re.compile(
    r'(sql|python|java|javascript|typescript|go|rust|c\+\+|c#|excel|tableau|power\s*bi|bi|ga4|seo|sem|a\s*/\s*b\s*test|ab\s*test|llm|rag|agent|docker|k8s|kubernetes|linux|redis|mysql|postgres|clickhouse|hive|spark|erp|crm|wms|sap|etl|spss|sas|vba|figma|photoshop|illustrator|chatgpt|gemini|claude|deepseek|qwen)',
    flags=re.IGNORECASE,
)

_MODEL_FAMILY_RE = re.compile(
    r'(gpt|chatgpt|openai|claude|anthropic|kimi|moonshot|gemini|qwen|通义|deepseek|llama|glm|智谱|文心|ernie|大模型|对话模型)',
    flags=re.IGNORECASE,
)

_ALIAS_MAP = {
    'powerbi': 'Power BI',
    'power bi': 'Power BI',
    'abtest': 'A/B Test',
    'a/btest': 'A/B Test',
    'abtesting': 'A/B Test',
    'a/btesting': 'A/B Test',
    'python脚本': 'Python',
    'python自动化脚本': 'Python',
}


_SKILL_OBJECT_KEYS = [
    'skill', 'name', 'title', 'label', 'value', 'keyword', 'technology', 'tech',
    'skills', '技能', '名称', '关键词', '证书'
]


def _coerce_limit(limit: Optional[int]) -> int:
    if limit is None:
        return DEFAULT_SKILL_LIMIT
    try:
        value = int(limit)
    except (TypeError, ValueError):
        value = DEFAULT_SKILL_LIMIT
    return max(MIN_SKILL_LIMIT, min(MAX_SKILL_LIMIT, value))


def _flatten_skill_values(value: Any) -> List[str]:
    output: List[str] = []
    stack = [value]

    while stack:
        current = stack.pop()
        if current is None:
            continue
        if isinstance(current, list):
            stack.extend(current)
            continue
        if isinstance(current, dict):
            picked = False
            for key in _SKILL_OBJECT_KEYS:
                if key in current:
                    stack.append(current.get(key))
                    picked = True
            if not picked:
                for item in current.values():
                    if isinstance(item, (str, int, float, list, dict)):
                        stack.append(item)
            continue
        text = str(current or '').strip()
        if text:
            output.append(text)

    # stack-pop traversal is LIFO; reverse once to preserve original left-to-right order.
    return list(reversed(output))


def _split_skill_candidates(value: Any) -> List[str]:
    chunks: List[str] = []
    for raw in _flatten_skill_values(value):
        parts = re.split(r'[\n\r,，、;；|｜]+', raw)
        for part in parts:
            token = str(part or '').strip()
            if not token:
                continue
            # Keep A/B-like forms while splitting normal slash-lists.
            if '/' in token or '／' in token:
                slash_parts = [p.strip() for p in re.split(r'[\/／]+', token) if str(p or '').strip()]
                idx = 0
                while idx < len(slash_parts):
                    current = slash_parts[idx]
                    nxt = slash_parts[idx + 1] if idx + 1 < len(slash_parts) else ''
                    if current.lower() == 'a' and nxt.lower().startswith('b'):
                        chunks.append(f'A/{nxt}')
                        idx += 2
                        continue
                    chunks.append(current)
                    idx += 1
                continue
            chunks.append(token)
    return chunks


def _normalize_skill_text(value: str) -> str:
    text = str(value or '').strip()
    text = re.sub(r'^[\-\*\d\.\)\(、\s]+', '', text)
    text = re.sub(r'[\s。；;，,：:]+$', '', text)
    text = re.sub(r'[\u200b\u200c\u200d\ufeff]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def _compact_key(value: str) -> str:
    return re.sub(r'[\s\W_]+', '', str(value or '').lower())


def _canonicalize_skill(value: str) -> str:
    text = _normalize_skill_text(value)
    if not text:
        return ''

    compact = _compact_key(text)
    if compact in _ALIAS_MAP:
        return _ALIAS_MAP[compact]

    if _MODEL_FAMILY_RE.search(text):
        return 'LLM'

    if re.search(r'^power\s*bi$', text, flags=re.IGNORECASE):
        return 'Power BI'
    if re.search(r'^(ab\s*test|a\s*/\s*b\s*test|a/b\s*test)$', text, flags=re.IGNORECASE):
        return 'A/B Test'
    if re.search(r'\bpython\b', text, flags=re.IGNORECASE):
        return 'Python'
    if re.search(r'\bsql\b', text, flags=re.IGNORECASE):
        return 'SQL'

    text = re.sub(r'(自动化脚本|脚本开发|脚本编写)$', '', text, flags=re.IGNORECASE).strip()
    text = re.sub(r'(与?精调|与?微调|微调|精调|调优|优化)$', '', text, flags=re.IGNORECASE).strip()
    text = re.sub(r'(搭建|构建|设计|实现|开发|执行|推进|落地)$', '', text, flags=re.IGNORECASE).strip()
    text = re.sub(r'^(熟练|熟悉|掌握|精通|了解|擅长|能够|会)\s*', '', text, flags=re.IGNORECASE).strip()
    text = re.sub(r'^(使用|运用|应用)\s*', '', text, flags=re.IGNORECASE).strip()

    return _normalize_skill_text(text)


def _is_valid_skill(value: str) -> bool:
    text = _normalize_skill_text(value)
    if not text:
        return False
    if len(text) < 2 or len(text) > 36:
        return False
    if re.search(r'[。！？!?]', text):
        return False
    if text.lower() in _GENERIC_NOISE:
        return False

    reject_patterns = [
        r'^(负责|参与|协助|推进|落地|搭建|构建|设计|优化|执行|管理|运营|分析|开发|实现|维护)',
        r'(能力|意识|经验|思维|协作|沟通|学习|责任心|抗压|执行力)$',
        r'(全链路|策略|方案|流程|复盘|项目经历|工作经历|业务理解)$',
        r'(建议|例如|比如|示例|待补充|可优化|可改进)$',
    ]
    if any(re.search(p, text, flags=re.IGNORECASE) for p in reject_patterns):
        return False

    if _CERT_RE.search(text):
        return True
    if _TECH_HINT_RE.search(text):
        return True

    if re.search(r'[\u4e00-\u9fff]', text):
        if re.search(r'(管理|运营|执行|推进|落地|搭建|构建|优化)$', text):
            return False
        return bool(re.search(r'(分析|建模|预测|定价|测试|归因|分层|投放|算法|风控|SCRM|ERP|CRM|RAG|LLM|Agent|证书)', text, flags=re.IGNORECASE))

    return bool(re.match(r'^[A-Za-z][A-Za-z0-9.+#\-/\s]{1,30}$', text))


def _is_near_duplicate(left: str, right: str) -> bool:
    if not left or not right:
        return False
    left_key = _compact_key(left)
    right_key = _compact_key(right)
    if not left_key or not right_key:
        return False
    if left_key == right_key:
        return True

    # Containment heuristic (avoid SQL/MySQL false positives by length threshold).
    min_len = min(len(left_key), len(right_key))
    if min_len >= 4 and (left_key in right_key or right_key in left_key):
        return True

    left_tokens = set(re.findall(r'[a-z0-9+#]+', left.lower()))
    right_tokens = set(re.findall(r'[a-z0-9+#]+', right.lower()))
    if left_tokens and right_tokens:
        if left_tokens <= right_tokens or right_tokens <= left_tokens:
            return True

    return False


def _normalized_candidates(value: Any) -> List[str]:
    output: List[str] = []
    seen = set()

    for raw in _split_skill_candidates(value):
        skill = _canonicalize_skill(raw)
        if not skill:
            continue
        if not _is_valid_skill(skill):
            continue
        key = _compact_key(skill)
        if not key or key in seen:
            continue
        seen.add(key)
        output.append(skill)

    return output


def clean_skill_list(raw_skills: Any, *, limit: Optional[int] = None) -> List[str]:
    capped_limit = _coerce_limit(limit)
    normalized = _normalized_candidates(raw_skills)

    deduped: List[str] = []
    for skill in normalized:
        if any(_is_near_duplicate(skill, existing) for existing in deduped):
            continue
        deduped.append(skill)
        if len(deduped) >= capped_limit:
            break

    return deduped


def merge_resume_skills(
    *,
    source_skills: Any = None,
    generated_skills: Any = None,
    suggested_skills: Any = None,
    limit: Optional[int] = None,
) -> List[str]:
    capped_limit = _coerce_limit(limit)

    buckets = [
        ('source', source_skills, 300),
        ('generated', generated_skills, 200),
        ('suggested', suggested_skills, 100),
    ]

    stats = {}
    order = 0
    for _, values, base_score in buckets:
        for idx, skill in enumerate(_normalized_candidates(values)):
            key = _compact_key(skill)
            if not key:
                continue
            row = stats.get(key)
            score = base_score - idx
            if _TECH_HINT_RE.search(skill):
                score += 20
            if _CERT_RE.search(skill):
                score += 10
            score += max(0, 8 - min(len(skill), 8))

            if row is None:
                stats[key] = {
                    'display': skill,
                    'score': score,
                    'first': order,
                }
                order += 1
            else:
                row['score'] += max(30, score // 4)
                # Prefer shorter canonical display when duplicates merge.
                if len(skill) < len(row['display']):
                    row['display'] = skill

    ranked = sorted(
        stats.values(),
        key=lambda item: (-int(item['score']), int(item['first'])),
    )

    merged: List[str] = []
    for item in ranked:
        skill = str(item.get('display') or '').strip()
        if not skill:
            continue
        if any(_is_near_duplicate(skill, existing) for existing in merged):
            continue
        merged.append(skill)
        if len(merged) >= capped_limit:
            break

    return merged


def sanitize_resume_skills(resume_data: Any, *, limit: Optional[int] = None) -> Any:
    if not isinstance(resume_data, dict):
        return resume_data
    next_resume = copy.deepcopy(resume_data)
    next_resume['skills'] = clean_skill_list(next_resume.get('skills') or [], limit=limit)
    return next_resume
