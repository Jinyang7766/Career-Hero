import React from 'react';
import { ResumeSummary } from '../../types';

interface DiagnosisProgressBarProps {
    resume: ResumeSummary;
    isInterviewMode?: boolean;
    variant?: 'default' | 'on-dark';
    onDiagnosisStageClick?: (step: 'report' | 'chat' | 'final_report') => void;
}

const DIAGNOSIS_STAGES = ['初步诊断', '微访谈', '最终报告'] as const;
const DIAGNOSIS_STAGE_STEPS: Array<'report' | 'chat' | 'final_report'> = ['report', 'chat', 'final_report'];
const INTERVIEW_STAGES = ['初试', '复试', 'HR面'] as const;
type StageStatus = 'todo' | 'current' | 'done';

export const DiagnosisProgressBar: React.FC<DiagnosisProgressBarProps> = ({
    resume,
    isInterviewMode = false,
    variant = 'default',
    onDiagnosisStageClick,
}) => {
    const progress = Math.max(0, Math.min(100, Math.round(Number(resume.diagnosisProgress))));
    const latestStep = String((resume as any)?.latestAnalysisStep || '').trim().toLowerCase();
    const isFinalReportCompleted =
        progress >= 100 ||
        latestStep === 'final_report' ||
        latestStep === 'comparison';
    const isOnDark = variant === 'on-dark';

    // Both modes use a 3-stage visual approach
    const stageLabels = isInterviewMode ? INTERVIEW_STAGES : DIAGNOSIS_STAGES;

    const renderStatusRow = (
        statuses: StageStatus[],
        labels: readonly string[],
        modeLabel?: string
    ) => (
        <div className="w-full">
            <div className="flex items-center gap-2 mb-2 px-0.5">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${isOnDark ? 'text-white/70' : 'text-slate-500 dark:text-slate-400'}`}>
                    {isInterviewMode ? '面试进程' : '诊断进度'}
                </span>
                {!!modeLabel && (
                    <span className={`text-[10px] font-bold tracking-tight rounded-[4px] px-1.5 py-0.5 ${isOnDark ? 'bg-white/15 text-white/90' : 'bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-300'}`}>
                        {modeLabel}
                    </span>
                )}
            </div>

            <div className="flex items-start gap-1.5 mt-1.5">
                {labels.map((label, idx) => {
                    const status = statuses[idx] || 'todo';
                    const isDone = status === 'done';
                    const isCurrent = status === 'current';
                    const canJumpDiagnosisStage =
                        !isInterviewMode &&
                        isDone &&
                        typeof onDiagnosisStageClick === 'function';
                    const content = (
                        <>
                            <div
                                className={`w-full h-1.5 rounded-full transition-all duration-700 ${isDone
                                    ? isOnDark ? 'bg-white' : 'bg-emerald-500'
                                    : isCurrent
                                        ? isOnDark ? 'bg-white/60 animate-pulse' : 'bg-primary animate-pulse'
                                        : isOnDark ? 'bg-white/10' : 'bg-slate-100 dark:bg-white/5'
                                    }`}
                            />

                            <div className="w-full min-h-[14px] mt-1 flex items-center justify-center gap-1 px-0.5">
                                {isDone ? (
                                    <span
                                        className={`material-symbols-outlined shrink-0 font-black ${isOnDark ? 'text-white' : 'text-emerald-500'}`}
                                        style={{ fontSize: '11px' }}
                                    >
                                        check_circle
                                    </span>
                                ) : isCurrent ? (
                                    <div className={`size-1.5 shrink-0 rounded-full animate-pulse ${isOnDark ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'bg-primary'}`} />
                                ) : (
                                    <div className={`size-1 shrink-0 rounded-full ${isOnDark ? 'bg-white/20' : 'bg-slate-300 dark:bg-slate-700'}`} />
                                )}
                                <span className={`block text-center text-[10px] font-bold tracking-tight leading-none whitespace-nowrap transition-colors ${isCurrent
                                    ? isOnDark ? 'text-white' : 'text-slate-900 dark:text-white'
                                    : isDone
                                        ? isOnDark ? 'text-white/80' : 'text-slate-600 dark:text-slate-400'
                                        : isOnDark ? 'text-white/30' : 'text-slate-400 dark:text-slate-500'
                                    } ${canJumpDiagnosisStage ? 'hover:underline underline-offset-2' : ''}`}>
                                    {label}
                                </span>
                            </div>
                        </>
                    );
                    if (!canJumpDiagnosisStage) {
                        return <div key={idx} className="flex-1 flex flex-col items-center pt-0.5">{content}</div>;
                    }
                    return (
                        <button
                            key={idx}
                            type="button"
                            className="flex-1 flex flex-col items-center pt-0.5 bg-transparent border-0 p-0 text-left cursor-pointer"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDiagnosisStageClick?.(DIAGNOSIS_STAGE_STEPS[idx]);
                            }}
                        >
                            {content}
                        </button>
                    );
                })}
            </div>
        </div>
    );

    // Determine status for each stage
    const stageStatuses: Array<'todo' | 'current' | 'done'> = stageLabels.map((_, idx) => {
        if (isInterviewMode) {
            // For Interview Mode: Independent lighting
            return resume.interviewStageStatus?.[idx] || 'todo';
        }
        if (isFinalReportCompleted) return 'done';

        // Diagnosis mode: derive by both step + progress so "micro interview in progress"
        // (state=interview_in_progress/paused) can light stage 2 even when latestStep is not "chat".
        const inFinalReportGenerating =
            latestStep === 'interview_report' ||
            latestStep === 'comparison' ||
            progress >= 95;
        if (inFinalReportGenerating) {
            if (idx === 0) return 'done';
            if (idx === 1) return 'done';
            return 'current';
        }

        const inMicroInterview =
            latestStep === 'micro_intro' ||
            latestStep === 'chat' ||
            progress >= 72;
        if (inMicroInterview) {
            if (idx === 0) return 'done';
            if (idx === 1) return 'current';
            return 'todo';
        }

        const initialReportReady =
            latestStep === 'report' ||
            latestStep === 'analyzing' ||
            latestStep === 'jd_input' ||
            progress >= 15;
        if (initialReportReady) {
            if (idx === 0) return 'done';
            return 'todo';
        }
        return 'todo';
    });

    if (!resume.analyzed && !isInterviewMode) return null;

    if (isInterviewMode) {
        const byMode = (resume as any)?.interviewStageStatusByMode as
            | { simple?: StageStatus[]; comprehensive?: StageStatus[] }
            | undefined;
        const simple = Array.isArray(byMode?.simple) ? byMode!.simple! : [];
        const comprehensive = Array.isArray(byMode?.comprehensive) ? byMode!.comprehensive! : [];
        const hasSimple = simple.some((s) => s === 'current' || s === 'done');
        const hasComprehensive = comprehensive.some((s) => s === 'current' || s === 'done');

        if (hasSimple && hasComprehensive) {
            return (
                <div className="w-full space-y-3">
                    {renderStatusRow(simple, INTERVIEW_STAGES, '简单')}
                    {renderStatusRow(comprehensive, INTERVIEW_STAGES, '全面')}
                </div>
            );
        }
        if (hasSimple) return renderStatusRow(simple, INTERVIEW_STAGES, '简单');
        if (hasComprehensive) return renderStatusRow(comprehensive, INTERVIEW_STAGES, '全面');
    }

    return renderStatusRow(stageStatuses, stageLabels);
};
