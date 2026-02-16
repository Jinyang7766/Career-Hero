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
    const invalidKeywords = ['职位', '岗位', '要求', '职责', '描述', '薪资', '地点', '福利', '一、', '二、', '三、', '1.', '2.', '3.', '任职', '优先', '加分', '简历', '投递', '招聘'];

    const isValid = (name: string) => {
        const n = name.trim();
        if (n.length < 2 || n.length > 50) return false;
        return !invalidKeywords.some(kw => n.includes(kw));
    };

    // 1. 优先匹配明确的标签
    const patterns = [
        /(?:公司|企业|Employer|Company)[:：]\s*([^\n]+)/i,
        /招聘单位[:：]\s*([^\n]+)/,
    ];

    for (const pattern of patterns) {
        const match = cleanText.match(pattern);
        if (match && match[1]) {
            const candidate = match[1].trim();
            if (isValid(candidate)) return candidate;
        }
    }

    // 2. 尝试从第一行判断（必须包含公司相关后缀）
    if (lines.length > 0) {
        const firstLine = lines[0].trim();
        // 必须包含公司实体后缀，且不包含黑名单
        if (/(?:公司|集团|工作室|科技|网络|技术|Consulting|Inc\.|Ltd\.|Co\.)/i.test(firstLine)) {
            if (isValid(firstLine)) return firstLine;
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
    const direction = data?.personalInfo?.title?.trim();
    const personName = data?.personalInfo?.name?.trim();
    const manualCompany = (data?.targetCompany || currentSelectionTargetCompany || '').trim();
    const parts: string[] = [];

    if (direction) {
        parts.push(direction);
    } else if (baseTitle) {
        parts.push(baseTitle);
    } else {
        parts.push('简历');
    }

    if (includeCompany) {
        const companyName = manualCompany || getCompanyNameFromJd(jd);
        if (companyName) {
            parts.push(companyName);
        }
    }

    if (personName) {
        parts.push(personName);
    }

    return parts.join(' - ');
};
