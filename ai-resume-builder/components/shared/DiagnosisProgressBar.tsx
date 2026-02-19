import React from 'react';
import { ResumeSummary } from '../../types';

interface DiagnosisProgressBarProps {
    resume: ResumeSummary;
    isInterviewMode?: boolean;
    variant?: 'default' | 'on-dark';
}

const DIAGNOSIS_STAGES = ['初步诊断', '微访谈', '最终报告'] as const;
const INTERVIEW_STAGES = ['初试', '复试', 'HR面'] as const;

export const DiagnosisProgressBar: React.FC<DiagnosisProgressBarProps> = ({
    resume,
    isInterviewMode = false,
    variant = 'default'
}) => {
    const progress = Math.max(0, Math.min(100, Math.round(Number(resume.diagnosisProgress))));
    const isOnDark = variant === 'on-dark';

    // Both modes use a 3-stage visual approach
    const stageLabels = isInterviewMode ? INTERVIEW_STAGES : DIAGNOSIS_STAGES;

    // Determine status for each stage
    const stageStatuses: Array<'todo' | 'current' | 'done'> = stageLabels.map((_, idx) => {
        if (isInterviewMode) {
            // For Interview Mode: Independent lighting
            return resume.interviewStageStatus?.[idx] || 'todo';
        } else {
            // For Diagnosis Mode: Sequential lighting
            let currentStageIndex = -1;
            if (progress >= 95) currentStageIndex = 2;
            else if (progress >= 80) currentStageIndex = 1;
            else if (progress >= 15) currentStageIndex = 0;

            if (idx < currentStageIndex) return 'done';
            if (idx === currentStageIndex) return 'current';
            return 'todo';
        }
    });

    if (!resume.analyzed && !isInterviewMode) return null;

    return (
        <div className="w-full">
            <div className="flex items-center justify-between mb-2 px-0.5">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${isOnDark ? 'text-white/70' : 'text-slate-500 dark:text-slate-400'}`}>
                    {isInterviewMode ? '面试进程' : '诊断进度'}
                </span>
            </div>

            <div className="flex items-center gap-1.5 h-1.5 px-0.5">
                {stageLabels.map((_, idx) => {
                    const status = stageStatuses[idx];
                    const isDone = status === 'done';
                    const isCurrent = status === 'current';

                    return (
                        <div
                            key={idx}
                            className={`flex-1 h-full rounded-full transition-all duration-700 ${isDone
                                ? isOnDark ? 'bg-white' : 'bg-emerald-500'
                                : isCurrent
                                    ? isOnDark ? 'bg-white/60 animate-pulse' : 'bg-primary animate-pulse'
                                    : isOnDark ? 'bg-white/10' : 'bg-slate-100 dark:bg-white/5'
                                }`}
                        />
                    );
                })}
            </div>

            <div className="flex items-center mt-3">
                {stageLabels.map((label, idx) => {
                    const status = stageStatuses[idx];
                    const isDone = status === 'done';
                    const isCurrent = status === 'current';

                    return (
                        <div key={idx} className="flex-1 flex flex-col items-center">
                            <div className="flex items-center gap-1.5 min-h-[14px]">
                                {isDone ? (
                                    <span className={`material-symbols-outlined font-black ${isOnDark ? 'text-white' : 'text-emerald-500'}`} style={{ fontSize: '11px' }}>check_circle</span>
                                ) : isCurrent ? (
                                    <div className={`size-1.5 rounded-full animate-pulse ${isOnDark ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'bg-primary'}`} />
                                ) : (
                                    <div className={`size-1 rounded-full ${isOnDark ? 'bg-white/20' : 'bg-slate-300 dark:bg-slate-700'}`} />
                                )}
                                <span className={`text-[10px] font-bold tracking-tight whitespace-nowrap transition-colors ${isCurrent
                                    ? isOnDark ? 'text-white' : 'text-slate-900 dark:text-white'
                                    : isDone
                                        ? isOnDark ? 'text-white/80' : 'text-slate-600 dark:text-slate-400'
                                        : isOnDark ? 'text-white/30' : 'text-slate-400 dark:text-slate-500'
                                    }`}>
                                    {label}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
