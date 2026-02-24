import { toSkillList } from '../../../../src/skill-utils';
import { normalizeScoreBreakdown, resolveDisplayScore } from '../analysis-mappers';
import { consolidateSkillSuggestions, inferTargetSection, normalizeTargetSection } from '../suggestion-helpers';
import {
  sanitizeReasonText,
  sanitizeSuggestedValue,
  isGenderRelatedSuggestion,
  isEducationRelatedSuggestion,
} from '../chat-formatters';
import type { AnalysisReport, Suggestion } from '../types';

type Params = {
  aiAnalysisResult: any;
  resumeData: any;
  targetCompany: string;
};

export const buildAnalysisResultSnapshot = ({
  aiAnalysisResult,
  resumeData,
  targetCompany,
}: Params): {
  appliedSuggestions: Suggestion[];
  report: AnalysisReport;
  totalScore: number;
  effectiveTargetCompany: string;
} => {
  const newSuggestions: Suggestion[] = [];
  const analysisStage = String((aiAnalysisResult as any)?.analysisStage || '').toLowerCase();
  const preInterviewOnly = analysisStage === 'pre_interview';
  const backendSuggestions = preInterviewOnly ? [] : (aiAnalysisResult.suggestions || []);
  const currentSkillsText = Array.isArray(resumeData?.skills) && resumeData.skills.length > 0
    ? resumeData.skills.filter(Boolean).join('、')
    : '';
  const hasProjectExperience = Array.isArray(resumeData?.projects) && resumeData.projects.some((item: any) => {
    const title = String(item?.title || '').trim();
    const subtitle = String(item?.subtitle || '').trim();
    const description = String(item?.description || '').trim();
    return !!(title || subtitle || description);
  });
  const isProjectSuggestion = (item: any) => {
    const blob = String([
      item?.targetSection,
      item?.targetField,
      item?.title,
      item?.reason,
      typeof item?.suggestedValue === 'string' ? item.suggestedValue : '',
    ].filter(Boolean).join(' ')).toLowerCase();
    return /(项目|project)/.test(blob) && /(补充|新增|添加|完善|增加|缺少|缺失|补全|丰富)/.test(blob);
  };

  backendSuggestions.forEach((suggestion: any, index: number) => {
    if (isGenderRelatedSuggestion(suggestion)) return;
    if (isEducationRelatedSuggestion(suggestion)) return;
    if (typeof suggestion === 'string') {
      newSuggestions.push({
        id: `ai-suggestion-${index}`,
        type: 'optimization',
        title: '优化建议',
        reason: sanitizeReasonText(suggestion),
        targetSection: 'skills',
        targetId: undefined,
        targetField: undefined,
        suggestedValue: undefined,
        originalValue: currentSkillsText || undefined,
        status: 'pending' as const,
      });
      return;
    }

    let inferredSection = normalizeTargetSection(suggestion.targetSection) || inferTargetSection(suggestion);
    if (!hasProjectExperience && isProjectSuggestion(suggestion)) {
      inferredSection = 'projects';
    }
    const originalValue =
      suggestion.originalValue ||
      (inferredSection === 'skills' ? (currentSkillsText || undefined) : undefined);
    newSuggestions.push({
      id: suggestion.id || `ai-suggestion-${index}`,
      type: suggestion.type || 'optimization',
      title: suggestion.title || '优化建议',
      reason: sanitizeReasonText(suggestion.reason || '根据AI诊断结果'),
      targetSection: inferredSection,
      targetId: suggestion.targetId,
      targetField: suggestion.targetField,
      suggestedValue: inferredSection === 'skills'
        ? toSkillList(suggestion.suggestedValue)
        : sanitizeSuggestedValue(suggestion.suggestedValue, inferredSection),
      originalValue,
      status: 'pending' as const,
    });
  });

  if (!preInterviewOnly && !hasProjectExperience) {
    const hasProjectAdvice = newSuggestions.some((s) => s.targetSection === 'projects');
    if (!hasProjectAdvice) {
      newSuggestions.push({
        id: `ai-suggestion-project-bootstrap-${Date.now()}`,
        type: 'missing',
        title: '补充项目经历',
        reason: '当前简历缺少项目经历。建议新增 1-2 个与目标岗位高度相关的项目，突出目标、行动与量化结果。',
        targetSection: 'projects',
        targetField: 'description',
        suggestedValue: '示例结构：项目背景与目标、个人职责、关键行动、量化结果（如效率提升/成本下降/转化提升）。',
        originalValue: '',
        status: 'pending',
      });
    }
  }

  const normalizedBreakdown = normalizeScoreBreakdown(
    aiAnalysisResult.scoreBreakdown || {
      experience: 75,
      skills: 80,
      format: 90,
    },
    aiAnalysisResult.score || 0
  );

  const report: AnalysisReport = {
    summary: aiAnalysisResult.summary || 'AI诊断完成，请查看详细报告。',
    microInterviewFirstQuestion: String((aiAnalysisResult as any).microInterviewFirstQuestion || '').trim(),
    strengths: aiAnalysisResult.strengths || ['结构清晰'],
    weaknesses: aiAnalysisResult.weaknesses || ['需要进一步优化'],
    missingKeywords: aiAnalysisResult.missingKeywords,
    scoreBreakdown: normalizedBreakdown,
  };

  const totalScore = resolveDisplayScore(aiAnalysisResult.score || 0, report.scoreBreakdown);
  const effectiveTargetCompany = String(targetCompany || resumeData.targetCompany || '').trim();
  const appliedSuggestions = consolidateSkillSuggestions(newSuggestions);

  return {
    appliedSuggestions,
    report,
    totalScore,
    effectiveTargetCompany,
  };
};
