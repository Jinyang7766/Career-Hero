import React from 'react';
import { ScreenProps } from '../../types';
import PolicyLayout from '../shared/PolicyLayout';

const PrivacyPolicy: React.FC<ScreenProps> = () => {
    return (
        <PolicyLayout title="隐私政策">
                <div className="max-w-2xl mx-auto">
                    <div className="mb-10 text-center">
                        <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Career Hero 隐私政策</h2>
                        <p className="text-xs text-slate-400 dark:text-slate-500">更新日期：2026年2月19日</p>
                    </div>

                    <div className="space-y-8 text-slate-700 dark:text-slate-300">
                        <section>
                            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3">引言</h3>
                            <p className="text-sm leading-relaxed">
                                Career Hero（以下简称“我们”）深知个人信息对您的重要性，并会尽力采取安全保护措施。本隐私政策旨在向您说明我们如何收集、使用、存储您的个人信息，以及您享有的相关权利。在使用我们的服务前，请先阅读并理解本政策。
                            </p>
                        </section>

                        <section>
                            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3">一、我们如何收集您的信息</h3>
                            <div className="space-y-4">
                                <div>
                                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">1.1 账号注册信息</h4>
                                    <p className="text-sm leading-relaxed opacity-90">
                                        当您创建账号时，我们需要收集您的电子邮箱、姓名及密码。这些是提供基础账户服务、恢复密码及保障账户安全所必需的。
                                    </p>
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">1.2 简历及职业履历信息</h4>
                                    <p className="text-sm leading-relaxed opacity-90">
                                        您在使用简历编辑器时主动填写的个人联系方式、教育背景、工作经历、项目案例及技能水平。这些信息仅用于为您生成和优化简历。
                                    </p>
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">1.3 诊断与互动数据</h4>
                                    <p className="text-sm leading-relaxed opacity-90">
                                        当您请求 AI 进行简历诊断或模拟面试时，系统会处理您提交的文本内容。此类数据经过脱敏处理后，可能被用于优化我们的算法模型。
                                    </p>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3">二、我们如何使用您的信息</h3>
                            <p className="text-sm leading-relaxed">
                                我们承诺不会将您的个人信息出售给任何无关第三方。信息的主要用途包括：
                            </p>
                            <ul className="list-disc list-inside text-sm mt-2 space-y-1.5 opacity-90">
                                <li>为您提供个性化的简历优化建议及面试模拟服务；</li>
                                <li>进行身份验证，保障您的云端同步数据安全；</li>
                                <li>通过邮件发送必要的技术通知或服务公告；</li>
                                <li>在得到您明确授权的情况下，进行产品的市场调研与满意度调查。</li>
                            </ul>
                        </section>

                        <section>
                            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3">三、数据存储与安全保障</h3>
                            <p className="text-sm leading-relaxed">
                                3.1 您的数据存储在采用行业领先防护技术的加密云服务器中。
                            </p>
                            <p className="text-sm leading-relaxed mt-2">
                                3.2 我们使用 SSL/TLS 加密技术保护数据传输层安全，并对敏感信息进行后台数据库加密存储。
                            </p>
                            <p className="text-sm leading-relaxed mt-2">
                                3.3 我们建立了严格的数据访问控制制度，只有获得授权的人员才能为特定的维护目的访问相关数据。
                            </p>
                        </section>

                        <section>
                            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3">四、您的权利与数据控制</h3>
                            <p className="text-sm leading-relaxed">
                                您可以通过产品界面随时执行以下操作：
                            </p>
                            <ul className="list-disc list-inside text-sm mt-2 space-y-1.5 opacity-90">
                                <li>查询、更正或更新您的个人资料及简历版本；</li>
                                <li>导出您的简历数据为 PDF/Word 格式；</li>
                                <li>自主注销账户。注销后，您的所有个人身份信息及关联数据将在系统备份周期结束后（通常不超过 48 小时）被永久且不可恢复地删除。</li>
                            </ul>
                        </section>

                        <section>
                            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3">五、第三方共享声明</h3>
                            <p className="text-sm leading-relaxed">
                                为了提供高质量的 AI 分析服务，我们需要向合规的第三方 AI 服务商（如 Google Gemini、DeepSeek 等）传递必要的简历文本内容。我们通过 API 层面的数据脱敏及保密协议，确保第三方服务商不会擅自留存或泄露您的原始数据。
                            </p>
                        </section>

                        <section>
                            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3">六、政策变更</h3>
                            <p className="text-sm leading-relaxed">
                                随着业务迭代，我们可能会不时修订本政策。任何重大变更，我们都会通过应用内弹窗、首页公告或邮件形式向您发送提醒附件。
                            </p>
                        </section>
                    </div>

                    <div className="mt-16 pb-12 border-t border-slate-100 dark:border-white/5 pt-8 text-center text-xs text-slate-400">
                        <p>© 2026 Career Hero AI Studio. All rights reserved.</p>
                    </div>
                </div>
        </PolicyLayout>
    );
};


export default PrivacyPolicy;
