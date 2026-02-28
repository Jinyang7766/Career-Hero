import React from 'react';
import { ResumeSummary } from '../../types';
import { DiagnosisProgressBar } from '../shared/DiagnosisProgressBar';

interface DashboardProgressModuleProps {
    resume: ResumeSummary;
    onContinueDiagnosis: (resume: ResumeSummary) => void;
    onContinueInterview: (resume: ResumeSummary) => void;
}

const DashboardProgressModule: React.FC<DashboardProgressModuleProps> = ({ resume, onContinueDiagnosis, onContinueInterview }) => {
    const diagnosisProgress = Math.max(0, Math.min(100, Math.round(Number((resume as any)?.diagnosisProgress || 0))));
    const hasDiagnosisProgress = diagnosisProgress >= 15;
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
    const diagnosisActionLabel = !hasAnyProgress
        ? '去优化'
        : (diagnosisProgress >= 100 ? '查看结果' : '继续优化');
    const interviewActionLabel = hasAnyProgress ? '继续面试' : '去面试';
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

                {/* Progress Bar Container */}
                <div className="bg-black/10 rounded-2xl p-4 backdrop-blur-md border border-white/5 shadow-inner">
                    {hasAnyProgress ? (
                        <>
                            <DiagnosisProgressBar
                                resume={resume}
                                variant="on-dark"
                            />
                            <div className="mt-3 pt-3 border-t border-white/10">
                                <DiagnosisProgressBar resume={resume} isInterviewMode variant="on-dark" />
                            </div>
                        </>
                    ) : (
                        <div className="py-2">
                            <p className="text-sm font-semibold text-white/90">你还没有最近进展</p>
                            <p className="text-xs text-white/70 mt-1">先去优化简历或直接开始模拟面试吧！</p>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-1">
                    <button
                        onClick={() => onContinueDiagnosis(resume)}
                        className="flex-1 flex items-center justify-center bg-white text-primary hover:bg-white/90 active:scale-[0.97] h-12 rounded-xl text-sm font-black shadow-[0_8px_20px_rgba(0,0,0,0.2)] transition-all"
                    >
                        <span>{diagnosisActionLabel}</span>
                    </button>

                    <button
                        onClick={() => onContinueInterview(resume)}
                        className="flex-1 flex items-center justify-center h-12 rounded-xl bg-white/10 hover:bg-white/20 active:scale-[0.97] backdrop-blur-xl border border-white/20 text-white text-sm font-black transition-all"
                    >
                        {interviewActionLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DashboardProgressModule;
