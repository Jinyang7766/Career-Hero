import { ResumeData } from '../types';

/**
 * Extract company name from Job Description text
 */
export const getCompanyNameFromJd = (text: string): string => {
    if (!text) return '';

    // 预处理：移除常见的干扰字符
    const cleanText = text.trim();
    const lines = cleanText.split('\n').filter(l => l.trim().length > 0);

    // 黑名单关键词：包含这些词的一定不是公司名
    const invalidKeywords = [
        '职位', '岗位', '要求', '职责', '描述', '薪资', '地点', '福利',
        '任职', '优先', '加分', '简历', '投递', '招聘', '急聘', '高薪',
        '职责描述', '岗位职责', '任职要求', '工作地点', '职位描述', '岗位说明'
    ];

    const isValid = (name: string) => {
        const n = name.trim().replace(/^[【\[]?.{0,10}(急聘|高薪|诚聘)[】\]]?/g, '').trim();
        if (n.length < 2 || n.length > 50) return false;
        if (/^(一|二|三|四|五|六|七|八|九|十)[、.\s]/.test(n)) return false;
        if (/^\d+[、.\s]/.test(n)) return false;
        return !invalidKeywords.some(kw => n.includes(kw));
    };

    const normalizeCandidate = (raw: string) =>
        (raw || '')
            .replace(/[|｜].*$/, '')
            .replace(/^[【\[]?(急聘|高薪|诚聘)[】\]]?/g, '')
            .replace(/^\s*(公司|企业|Employer|Company)\s*[:：-]?\s*/i, '')
            .trim();

    // 1. 优先匹配明确的标签
    const patterns = [
        /(?:公司|企业|Employer|Company)[:：]\s*([^\n]+)/i,
        /招聘单位[:：]\s*([^\n]+)/,
    ];

    for (const pattern of patterns) {
        const match = cleanText.match(pattern);
        if (match && match[1]) {
            const candidate = normalizeCandidate(match[1]);
            if (isValid(candidate)) return candidate;
        }
    }

    // 2. 尝试从前几行中找“像公司”的实体名称，而不是盲目取第一行
    const companySuffix = /(?:公司|集团|工作室|研究院|事务所|科技|网络|技术|咨询|银行|证券|基金|保险|Inc\.?|Ltd\.?|LLC|Co\.?|Corporation|Group)$/i;
    for (const line of lines.slice(0, 6)) {
        const candidate = normalizeCandidate(line);
        if (!candidate) continue;
        if (companySuffix.test(candidate) && isValid(candidate)) {
            return candidate;
        }
    }

    return '';
};

/**
 * Build a structured resume title
 */
export const buildResumeTitle = (
    baseTitle: string | undefined,
    data: ResumeData,
    jd: string,
    includeCompany: boolean,
    currentSelectionTargetCompany?: string
): string => {
    const normalizePart = (value: string) =>
        String(value || '')
            .trim()
            .toLowerCase()
            .replace(/[\s\-_|·•,，。.!！?？:：()（）【】\[\]{}]/g, '');

    const dedupeParts = (items: string[]) => {
        const out: string[] = [];
        const seen = new Set<string>();
        for (const item of items) {
            const text = String(item || '').trim();
            if (!text) continue;
            const key = normalizePart(text);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            out.push(text);
        }
        return out;
    };

    const direction = String(data?.personalInfo?.title || '').trim();
    const personName = String(data?.personalInfo?.name || '').trim();
    const manualCompany = String(data?.targetCompany || currentSelectionTargetCompany || '').trim();
    const parts: string[] = [];

    if (direction) {
        parts.push(direction);
    } else if (baseTitle) {
        parts.push(baseTitle);
    } else {
        parts.push('简历');
    }

    if (includeCompany) {
        const companyName = String(manualCompany || getCompanyNameFromJd(jd) || '').trim();
        if (companyName && normalizePart(companyName) !== normalizePart(direction)) {
            parts.push(companyName);
        }
    }

    if (personName) {
        parts.push(personName);
    }

    return dedupeParts(parts).join(' - ');
};
