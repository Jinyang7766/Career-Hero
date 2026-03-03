import React from 'react';

type ProfileExtras = {
    mbti?: string;
    personality?: string;
    workStyle?: string;
    careerGoal?: string;
    jobDirection?: string;
    targetSalary?: string;
    careerHighlights?: string[];
    constraints?: string[];
};

type ProfileExtrasStepProps = {
    extras: ProfileExtras;
    onChange: (field: keyof ProfileExtras, value: any) => void;
};

const ProfileExtrasStep: React.FC<ProfileExtrasStepProps> = ({ extras, onChange }) => {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/10">
                <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[24px]">person_celebrate</span>
                    画像补充维度
                </h2>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
                这些信息将帮助 AI 更好地理解你的职业偏好，并为你定制更精准的简历内容。
            </p>

            <div className="grid grid-cols-1 gap-4">
                <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">MBTI</label>
                    <input
                        value={String(extras.mbti || '')}
                        onChange={(e) => onChange('mbti', e.target.value)}
                        className="mt-1 w-full h-11 rounded-lg border bg-slate-50 dark:bg-[#111a22] border-slate-300 dark:border-[#334155] text-slate-900 dark:text-white px-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary focus:border-transparent"
                        placeholder="例如：ENTJ / INFP"
                    />
                </div>

                <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">性格特征</label>
                    <textarea
                        value={String(extras.personality || '')}
                        onChange={(e) => onChange('personality', e.target.value)}
                        className="mt-1 w-full min-h-[72px] resize-none rounded-lg border bg-slate-50 dark:bg-[#111a22] border-slate-300 dark:border-[#334155] text-slate-900 dark:text-white px-3 py-2 text-sm leading-relaxed outline-none transition-all focus:ring-2 focus:ring-primary focus:border-transparent"
                        placeholder="例如：高压下决策快、沟通直接、执行节奏稳定"
                    />
                </div>

                <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">工作方式偏好</label>
                    <textarea
                        value={String(extras.workStyle || '')}
                        onChange={(e) => onChange('workStyle', e.target.value)}
                        className="mt-1 w-full min-h-[72px] resize-none rounded-lg border bg-slate-50 dark:bg-[#111a22] border-slate-300 dark:border-[#334155] text-slate-900 dark:text-white px-3 py-2 text-sm leading-relaxed outline-none transition-all focus:ring-2 focus:ring-primary focus:border-transparent"
                        placeholder="例如：偏好跨职能协作、每周复盘、先拆目标再执行"
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">求职方向</label>
                        <input
                            value={String(extras.jobDirection || '')}
                            onChange={(e) => onChange('jobDirection', e.target.value)}
                            className="mt-1 w-full h-11 rounded-lg border bg-slate-50 dark:bg-[#111a22] border-slate-300 dark:border-[#334155] text-slate-900 dark:text-white px-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary focus:border-transparent"
                            placeholder="例如：后端工程师"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">目标薪资</label>
                        <input
                            value={String(extras.targetSalary || '')}
                            onChange={(e) => onChange('targetSalary', e.target.value)}
                            className="mt-1 w-full h-11 rounded-lg border bg-slate-50 dark:bg-[#111a22] border-slate-300 dark:border-[#334155] text-slate-900 dark:text-white px-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary focus:border-transparent"
                            placeholder="例如：25K-35K"
                        />
                    </div>
                </div>

                <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">职业目标</label>
                    <textarea
                        value={String(extras.careerGoal || '')}
                        onChange={(e) => onChange('careerGoal', e.target.value)}
                        className="mt-1 w-full min-h-[72px] resize-none rounded-lg border bg-slate-50 dark:bg-[#111a22] border-slate-300 dark:border-[#334155] text-slate-900 dark:text-white px-3 py-2 text-sm leading-relaxed outline-none transition-all focus:ring-2 focus:ring-primary focus:border-transparent"
                        placeholder="例如：一年内完成从执行到带小团队的角色升级"
                    />
                </div>

                <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">亮点事实（每行一条）</label>
                    <textarea
                        value={(extras.careerHighlights || []).join('\n')}
                        onChange={(e) => onChange('careerHighlights', e.target.value.split('\n').map(l => l.trim()).filter(Boolean))}
                        className="mt-1 w-full min-h-[84px] resize-none rounded-lg border bg-slate-50 dark:bg-[#111a22] border-slate-300 dark:border-[#334155] text-slate-900 dark:text-white px-3 py-2 text-sm leading-relaxed outline-none transition-all focus:ring-2 focus:ring-primary focus:border-transparent"
                        placeholder="例如：主导某业务增长项目，转化率提升 15%"
                    />
                </div>

                <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">约束条件（每行一条）</label>
                    <textarea
                        value={(extras.constraints || []).join('\n')}
                        onChange={(e) => onChange('constraints', e.target.value.split('\n').map(l => l.trim()).filter(Boolean))}
                        className="mt-1 w-full min-h-[84px] resize-none rounded-lg border bg-slate-50 dark:bg-[#111a22] border-slate-300 dark:border-[#334155] text-slate-900 dark:text-white px-3 py-2 text-sm leading-relaxed outline-none transition-all focus:ring-2 focus:ring-primary focus:border-transparent"
                        placeholder="例如：未明确的数据不要补全，未知时间线不要编造"
                    />
                </div>
            </div>
        </div>
    );
};

export default ProfileExtrasStep;
