import re

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

