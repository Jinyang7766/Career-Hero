import React from 'react';
import { ScreenProps } from '../../types';
import { useAppContext } from '../../src/app-context';

const TermsOfService: React.FC<ScreenProps> = () => {
    const goBack = useAppContext((s) => s.goBack);

    return (
        <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 animate-in slide-in-from-right duration-300">
            <header className="sticky top-0 z-10 flex items-center justify-between px-4 h-14 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
                <button
                    onClick={goBack}
                    className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                    <span className="material-symbols-outlined text-slate-700 dark:text-slate-200">arrow_back_ios_new</span>
                </button>
                <h1 className="text-lg font-bold text-slate-900 dark:text-white">服务条款</h1>
                <div className="w-10" />
            </header>

            <main className="flex-1 overflow-y-auto p-5 space-y-6">
                <section className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-700">
                    <h3 className="text-xl font-black text-slate-900 dark:text-white mb-4">服务协议</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                        欢迎使用 Career Hero！本协议是您与 Career Hero 平台之间就服务使用所订立的契约。请您在注册前认真阅读并理解以下条款。
                    </p>
                </section>

                <section className="space-y-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-700">
                        <div className="flex items-center gap-3 mb-3">
                            <span className="flex size-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-black text-sm">01</span>
                            <h4 className="text-base font-bold text-slate-900 dark:text-white">账号注册与安全</h4>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed pl-11">
                            您需要注册一个账号以使用完整功能。您需确保提供的注册信息真实有效。您应对账号的操作行为及密码安全负责。禁止将账号租借、转让或分享给他人使用。
                        </p>
                    </div>

                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-700">
                        <div className="flex items-center gap-3 mb-3">
                            <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 font-black text-sm">02</span>
                            <h4 className="text-base font-bold text-slate-900 dark:text-white">服务使用规则</h4>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed pl-11">
                            在使用我们的 AI 诊断和面试功能时，您同意不提交包含违法内容的信息。系统生成的优化建议基于 AI 模型，虽然我们致力于准确性，但不对结果的 100% 准确性、具体职场的绝对适用性做法律担保。
                        </p>
                    </div>

                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-700">
                        <div className="flex items-center gap-3 mb-3">
                            <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-black text-sm">03</span>
                            <h4 className="text-base font-bold text-slate-900 dark:text-white">知识产权</h4>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed pl-11">
                            您对在平台创建的简历内容拥有完整所有权。Career Hero 系统架构、UI 设计、AI 提示词逻辑及生成的诊断报告属于本平台的知识产权。未经授权，禁止克隆或商业化抓取本平台数据。
                        </p>
                    </div>

                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-700">
                        <div className="flex items-center gap-3 mb-3">
                            <span className="flex size-8 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 font-black text-sm">04</span>
                            <h4 className="text-base font-bold text-slate-900 dark:text-white">收费与退款</h4>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed pl-11">
                            平台会员功能为付费项。付费内容一经购买，因虚拟内容的特殊性，除非发生重大技术故障，否则通常不予退费。我们会根据运营需要调整价格，并通过显著方式通知。
                        </p>
                    </div>

                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-700">
                        <div className="flex items-center gap-3 mb-3">
                            <span className="flex size-8 items-center justify-center rounded-lg bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 font-black text-sm">05</span>
                            <h4 className="text-base font-bold text-slate-900 dark:text-white">服务变更或终止</h4>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed pl-11">
                            因不可抗力或系统维护，我们可能暂停部分服务。若您违反本协议（如恶意攻击服务器），我们有权立即封禁账号并追究法律责任。
                        </p>
                    </div>
                </section>

                <section className="bg-slate-100 dark:bg-white/5 rounded-2xl p-5 border border-slate-200 dark:border-white/5">
                    <h4 className="text-sm font-black text-slate-900 dark:text-white mb-2">免责声明</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-500 leading-relaxed italic">
                        Career Hero 提供的简历优化及面试建议仅供参考。由于职场招聘环境的复杂性，最终求职结果受多种因素影响，平台不保证您通过使用本服务必定获得面试机会或录取通知。
                    </p>
                </section>

                <section className="pb-10 pt-4 text-center">
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                        版本日期：2026.02.18
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 font-bold">
                        Career Hero 运营团队
                    </p>
                </section>
            </main>
        </div>
    );
};

export default TermsOfService;
