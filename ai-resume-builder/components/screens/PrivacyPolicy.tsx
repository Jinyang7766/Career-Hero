import React from 'react';
import { ScreenProps } from '../../types';
import { useAppContext } from '../../src/app-context';

const PrivacyPolicy: React.FC<ScreenProps> = () => {
    const goBack = useAppContext((s) => s.goBack);

    return (
        <div className="flex h-screen flex-col bg-background-light dark:bg-background-dark animate-in slide-in-from-right duration-300">
            <header className="sticky top-0 z-40 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5 shrink-0">
                <div className="flex items-center px-4 h-14 relative">
                    <button
                        onClick={goBack}
                        className="flex size-10 items-center justify-center rounded-full text-slate-900 dark:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors z-10"
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>arrow_back</span>
                    </button>
                    <h2 className="absolute inset-0 flex items-center justify-center text-lg font-bold leading-tight tracking-[-0.015em] text-slate-900 dark:text-white pointer-events-none">隐私政策</h2>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-6 space-y-8 scroll-smooth no-scrollbar">
                <section>
                    <h3 className="text-xl font-black text-slate-900 dark:text-white mb-4">引言</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                        Career Hero（以下简称“我们”）非常重视您的隐私。本隐私政策旨在向您说明我们如何收集、使用、存储和保护您的个人信息。在使用我们的服务前，请您务必仔细阅读并理解本政策。
                    </p>
                </section>

                <section>
                    <h3 className="text-base font-black text-slate-900 dark:text-white mb-3">一、我们收集的信息</h3>
                    <div className="space-y-4">
                        <div>
                            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">1. 账号信息</h4>
                            <p className="text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed">
                                当您注册账号时，我们会收集您的姓名、电子邮箱地址。这些信息用于为您创建账号并提供基本服务。
                            </p>
                        </div>
                        <div>
                            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">2. 简历数据</h4>
                            <p className="text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed">
                                您在编辑或上传简历时提供的个人信息、教育经历、工作经验、项目经验和技能等。我们会存储这些数据以便您随时访问和修改。
                            </p>
                        </div>
                        <div>
                            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">3. AI 互动数据</h4>
                            <p className="text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed">
                                当您使用 AI 诊断或 AI 面试功能时，我们会分析您提供的简历内容和职位描述。这些互动记录将被用于改进 AI 模型的准确性（匿名化处理后）。
                            </p>
                        </div>
                    </div>
                </section>

                <section>
                    <h3 className="text-base font-black text-slate-900 dark:text-white mb-3">二、信息的使用方式</h3>
                    <p className="text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed">
                        我们收集的信息主要用于以下用途：
                    </p>
                    <ul className="list-disc list-inside text-[13px] text-slate-600 dark:text-slate-400 mt-2 space-y-1.5 ml-1">
                        <li>提供、维护和改进我们的服务（如 AI 诊断逻辑）；</li>
                        <li>向您发送与账号相关的安全提醒、技术通知或服务更新；</li>
                        <li>根据您的简历内容提供个性化的职业优化建议。</li>
                    </ul>
                </section>

                <section>
                    <h3 className="text-base font-black text-slate-900 dark:text-white mb-3">三、信息的存储与安全</h3>
                    <div className="bg-blue-50/50 dark:bg-white/5 border border-blue-100 dark:border-white/10 rounded-2xl p-4">
                        <p className="text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed">
                            您的数据存储在安全的云服务器中。我们采用了行业标准的加密技术（如 SSL/TLS）来保护数据传输过程中的安全，并有着严格的内部访问控制流程。
                        </p>
                    </div>
                </section>

                <section>
                    <h3 className="text-base font-black text-slate-900 dark:text-white mb-3">四、您的权利</h3>
                    <p className="text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed">
                        您拥有以下权利：
                    </p>
                    <ul className="list-disc list-inside text-[13px] text-slate-600 dark:text-slate-400 mt-2 space-y-1.5 ml-1 font-medium">
                        <li>随时访问、修改或删除您的个人账号及简历信息；</li>
                        <li>注销账号（申请后您的所有个人数据将在 15 天内被永久擦除）；</li>
                        <li>导出您的简历数据（通过 PDF 下载功能）。</li>
                    </ul>
                </section>

                <section>
                    <h3 className="text-base font-black text-slate-900 dark:text-white mb-3">五、第三方服务</h3>
                    <p className="text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed">
                        我们使用第三方 AI 接口处理您的简历分析请求。发送给第三方的数据均经过脱敏或仅包含分析所需的必要信息。我们不会将您的个人隐私数据出售给任何第三方。
                    </p>
                </section>

                <section className="pb-10 border-t border-slate-100 dark:border-white/10 pt-8 text-center">
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                        更新日期：2024年3月
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                        Career Hero 团队
                    </p>
                </section>
            </main>
        </div>
    );
};

export default PrivacyPolicy;
