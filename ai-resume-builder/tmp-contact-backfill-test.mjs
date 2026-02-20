const normalizeContact = (value) => String(value || '').trim();
const isLikelyEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeContact(value));
const isLikelyPhone = (value) => {
  const raw = normalizeContact(value);
  if (!raw) return false;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return false;
  if (!/^[+()\-.\s\d]+$/.test(raw)) return false;
  return true;
};
const isMaskedContactValue = (value) => {
  const text = normalizeContact(value);
  if (!text) return true;
  const lowered = text.toLowerCase();
  if (lowered.includes('[email_') || lowered.includes('[phone_') || lowered.includes('masked') || lowered.includes('脱敏') || lowered.includes('隐私')) return true;
  if (/^\*+$/.test(text)) return true;
  if (/^x+$/i.test(text)) return true;
  if(/^(\*|x|X|-|_|\s){6,}$/.test(text)) return true;
  return false;
};
const repairGeneratedContacts = (generated, primarySource, fallbackSource) => {
  if (!generated || typeof generated !== 'object') return generated;
  const next = { ...generated };
  next.personalInfo = { ...(next.personalInfo || {}) };
  const srcPersonal = (primarySource && typeof primarySource === 'object' ? (primarySource.personalInfo || {}) : {});
  const fallbackPersonal = (fallbackSource && typeof fallbackSource === 'object' ? (fallbackSource.personalInfo || {}) : {});
  const sourceEmail = normalizeContact(srcPersonal?.email) || normalizeContact(fallbackPersonal?.email);
  const sourcePhone = normalizeContact(srcPersonal?.phone) || normalizeContact(fallbackPersonal?.phone);
  const validSourceEmail = isLikelyEmail(sourceEmail) ? sourceEmail : '';
  const validSourcePhone = isLikelyPhone(sourcePhone) ? sourcePhone : '';
  const generatedEmail = normalizeContact(next.personalInfo?.email);
  const generatedPhone = normalizeContact(next.personalInfo?.phone);
  if (validSourceEmail && (isMaskedContactValue(generatedEmail) || !isLikelyEmail(generatedEmail))) {
    next.personalInfo.email = validSourceEmail;
  }
  if (validSourcePhone && (isMaskedContactValue(generatedPhone) || !isLikelyPhone(generatedPhone))) {
    next.personalInfo.phone = validSourcePhone;
  }
  return next;
};

const sourceResume = { personalInfo: { name: '测试用户', email: 'tester@example.com', phone: '13800138000' } };
const fallbackResume = { personalInfo: { email: 'fallback@example.com', phone: '13900139000' } };

const cases = [
  { name: 'empty fields', input: { personalInfo: { name: '测试用户', email: '', phone: '' } }, expectEmail: 'tester@example.com', expectPhone: '13800138000' },
  { name: 'masked tokens', input: { personalInfo: { email: '[EMAIL_ADDRESS]', phone: '[PHONE_NUMBER]' } }, expectEmail: 'tester@example.com', expectPhone: '13800138000' },
  { name: 'valid generated keep', input: { personalInfo: { email: 'new@example.com', phone: '+86 13700001111' } }, expectEmail: 'new@example.com', expectPhone: '+86 13700001111' },
];

let ok = true;
for (const c of cases) {
  const out = repairGeneratedContacts(c.input, sourceResume, fallbackResume);
  const emailOk = out?.personalInfo?.email === c.expectEmail;
  const phoneOk = out?.personalInfo?.phone === c.expectPhone;
  console.log(`[${c.name}] email=${out?.personalInfo?.email} phone=${out?.personalInfo?.phone} => ${emailOk && phoneOk ? 'PASS' : 'FAIL'}`);
  if (!emailOk || !phoneOk) ok = false;
}
if (!ok) process.exit(1);
