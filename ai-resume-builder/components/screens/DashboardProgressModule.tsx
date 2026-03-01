import React from 'react';
import { ResumeSummary } from '../../types';

interface DashboardProgressModuleProps {
    resume: ResumeSummary;
    onContinueDiagnosis: (resume: ResumeSummary) => void;
    onContinueInterview: (resume: ResumeSummary) => void;
}

const DashboardProgressModule: React.FC<DashboardProgressModuleProps> = ({ resume, onContinueDiagnosis, onContinueInterview }) => {
    const diagnosisProgress = Math.max(0, Math.min(100, Math.round(Number((resume as any)?.diagnosisProgress || 0))));
    const hasDiagnosisProgress = diagnosisProgress >= 15;
    const isDiagnosisComplete = diagnosisProgress >= 100;

    const byMode = (resume as any)?.interviewStageStatusByMode;
    const hasInterviewProgressByMode = !!(
        byMode &&
        (
            (Array.isArray(byMode.simple) && byMode.simple.some((s: any) => s === 'current' || s === 'done')) ||
            (Array.isArray(byMode.comprehensive) && byMode.comprehensive.some((s: any) => s === 'current' || s === 'done'))
        )
    );
    const hasInterviewProgressLegacy = Array.isArray((resume as any)?.interviewStageStatus)
        ? (resume as any).interviewStageStatus.some((s: any) => s === 'current' || s === 'done')
        : false;
    const hasInterviewProgress = hasInterviewProgressByMode || hasInterviewProgressLegacy;
    const hasAnyProgress = hasDiagnosisProgress || hasInterviewProgress;

    // Determine the primary action based on state
    let primaryAction = {
        label: '智能诊断',
        icon: 'assessment',
        description: 'AI 自动分析简历薄弱点',
        onClick: () => onContinueDiagnosis(resume)
    };

    if (hasInterviewProgress) {
        primaryAction = {
            label: '继续面试',
            icon: 'forum',
            description: '回到你上次未完成的模拟面试',
            onClick: () => onContinueInterview(resume)
        };
    } else if (hasDiagnosisProgress && !isDiagnosisComplete) {
        primaryAction = {
            label: '继续优化',
            icon: 'assessment',
            description: '继续完善你的简历内容',
            onClick: () => onContinueDiagnosis(resume)
        };
    } else if (isDiagnosisComplete) {
        primaryAction = {
            label: '模拟面试',
            icon: 'forum',
            description: '简历已优化，开始针对性模拟面试吧',
            onClick: () => onContinueInterview(resume)
        };
    }

    // Determine key metrics
    const score = (resume as any).analysisScore || (resume as any).score || (resume as any).diagnosisScore || 0;

    // Format modified time
    const formatTime = (dateStr: string) => {
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return '';
            return date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            return '';
        }
    };

    return (
        <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-blue-600 to-indigo-700 p-6 shadow-xl shadow-primary/30 text-white transition-all">
            {/* Decorative Background */}
            <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl animate-pulse pointer-events-none"></div>
            <div className="absolute -left-16 -bottom-16 h-64 w-64 rounded-full bg-white/5 blur-3xl pointer-events-none"></div>

            <div className="relative z-10 flex flex-col gap-4">
                {/* Header */}
                <div className="flex items-start justify-between mb-1">
                    <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-white/20 backdrop-blur-md text-white border border-white/20 uppercase tracking-[0.1em] shadow-sm">
                                最近进展
                            </span>
                        </div>
                        <h3 className="text-xl font-black text-white tracking-tight leading-tight whitespace-nowrap overflow-hidden text-ellipsis">{resume.title}</h3>
                    </div>

                </div>

                {/* Info & Action Container */}
                <div
                    onClick={primaryAction.onClick}
                    className="bg-black/10 rounded-2xl p-4 backdrop-blur-md border border-white/5 shadow-inner cursor-pointer hover:bg-white/10 active:scale-[0.98] transition-all group/action flex items-center justify-between"
                >
                    <div className="flex items-center gap-3">
                        <div className="size-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-white text-xl">{primaryAction.icon}</span>
                        </div>
                        <div>
                            <p className="text-base font-bold text-white tracking-tight">{primaryAction.label}</p>
                            <p className="text-[11px] text-white/70 mt-0.5">{primaryAction.description}</p>
                        </div>
                    </div>

                    <div className="size-8 rounded-full bg-white text-primary flex items-center justify-center shrink-0 shadow-sm group-hover/action:scale-110 transition-transform">
                        <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DashboardProgressModule;
