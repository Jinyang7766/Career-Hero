import React from 'react';
import { View, ScreenProps } from '../../types';

const MemberCenter: React.FC<ScreenProps> = ({ setCurrentView, goBack }) => {
    return (
        <div className="flex h-screen flex-col bg-background-light dark:bg-background-dark animate-in slide-in-from-right duration-300">
            <header className="sticky top-0 z-40 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-slate-200/50 dark:border-white/5 shrink-0">
                <div className="flex items-center justify-between h-14 px-4">
                    <button
                        onClick={goBack}
                        className="flex size-10 items-center justify-center rounded-full text-slate-900 dark:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>arrow_back</span>
                    </button>
                    <h2 className="text-lg font-bold flex-1 text-center pr-10 text-slate-900 dark:text-white">会员中心</h2>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* Current Plan Card */}
                <div className="rounded-2xl bg-gradient-to-br from-primary to-blue-600 p-6 text-white shadow-xl shadow-primary/20">
                    <p className="text-sm font-medium opacity-80 uppercase tracking-wider">当前方案</p>
                    <h3 className="mt-1 text-2xl font-black">免费版用户</h3>
                    <p className="mt-4 text-xs text-blue-100 leading-relaxed font-medium">
                        升级至 Pro 即可解锁无限量 AI 诊断、专属面试官、以及所有高级简历模板。
                    </p>
                </div>

                {/* Benefits List */}
                <div className="space-y-4">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white px-1">Pro 版专属权益</h4>
                    <div className="bg-white dark:bg-surface-dark rounded-2xl border border-slate-100 dark:border-white/5 p-4 space-y-4 shadow-sm">
                        <BenefitItem icon="psychology" title="无限次 AI 诊断" desc="深度优化每一份简历细节" />
                        <BenefitItem icon="chat_bubble" title="专属 AI 面试官" desc="无限量沉浸式模拟面试" />
                        <BenefitItem icon="palette" title="所有高级模板" desc="职场精英专属定制布局" />
                        <BenefitItem icon="download" title="导出不限次数" desc="高清 PDF/Word 随时下载" />
                    </div>
                </div>

                {/* Action Button */}
                <button className="w-full h-14 rounded-2xl bg-primary text-white font-black text-lg shadow-xl shadow-primary/30 active:scale-[0.98] transition-all mt-4">
                    立即升级 Pro
                </button>
            </main>
        </div>
    );
};

const BenefitItem = ({ icon, title, desc }: { icon: string; title: string; desc: string }) => (
    <div className="flex items-start gap-4">
        <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: '22px' }}>{icon}</span>
        </div>
        <div className="flex flex-col">
            <p className="text-sm font-bold text-slate-900 dark:text-white">{title}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{desc}</p>
        </div>
    </div>
);

export default MemberCenter;
