import React from 'react';
import { ScreenProps } from '../../types';
import PolicyLayout from '../shared/PolicyLayout';

const TermsOfService: React.FC<ScreenProps> = () => {
    return (
        <PolicyLayout title="服务协议">
                <div className="max-w-2xl mx-auto">
                    <div className="mb-10 text-center">
                        <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Career Hero 服务协议</h2>
                        <p className="text-xs text-slate-400 dark:text-slate-500">最近更新日期：2026年2月18日</p>
                    </div>

                    <div className="space-y-8 text-slate-700 dark:text-slate-300">
                        <section>
                            <p className="text-sm leading-relaxed mb-4">
                                欢迎您选择使用 Career Hero。本协议为您与 Career Hero 平台之间就服务使用所订立的契约。在注册并开始使用本软件前，请务必仔细阅读并理解以下条款。
                            </p>
                            <p className="text-sm leading-relaxed font-bold text-slate-900 dark:text-white">
                                当您勾选“同意协议”或实际开始使用本服务时，即视为您已阅读并完全同意本协议的所有内容。
                            </p>
                        </section>

                        <section>
                            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3">一、账号注册与安全管理</h3>
                            <p className="text-sm leading-relaxed">
                                1.1 您需要注册一个账号以获得本平台的完整服务。您应当确保所提供的个人信息（如姓名、邮箱等）真实、准确且处于最新状态。
                            </p>
                            <p className="text-sm leading-relaxed mt-2">
                                1.2 您的账号仅限本人使用。禁止以租借、转让、出售或任何形式的分享方式将账号交由他人。应对账号下的所有操作行为负全部法律责任。
                            </p>
                            <p className="text-sm leading-relaxed mt-2">
                                1.3 发现账号异常登录或存在不安全因素时，应立即联系客服或尝试通过系统功能进行排查与修改。
                            </p>
                        </section>

                        <section>
                            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3">二、服务使用规则</h3>
                            <p className="text-sm leading-relaxed">
                                2.1 平台提供 AI 简历诊断、优化建议及模拟面试等核心功能。系统生成的建议是由大型语言模型处理并生成的，尽管我们不断努力提升精度，但不代表绝对的专业法律、财务或职业担保。
                            </p>
                            <p className="text-sm leading-relaxed mt-2">
                                2.2 用户承诺在使用本服务过程中不提交包含任何违反国家法律法规、公序良俗或侵害第三方权益的信息。
                            </p>
                            <p className="text-sm leading-relaxed mt-2">
                                2.3 严禁通过自动化手段（如爬虫、插件或非官方 API）批量下载平台内容或干扰服务器正常运行。
                            </p>
                        </section>

                        <section>
                            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3">三、知识产权声明</h3>
                            <p className="text-sm leading-relaxed">
                                3.1 您对自己上传的所有简历原始数据保留完整的所有权。
                            </p>
                            <p className="text-sm leading-relaxed mt-2">
                                3.2 Career Hero 的整体 UI 设计、专有的 AI 提示词（Prompts）逻辑、诊断算法及生成的结构化报告排版属于本平台的知识产权，受著作权法保护。
                            </p>
                        </section>

                        <section>
                            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3">四、资费与退款政策</h3>
                            <p className="text-sm leading-relaxed">
                                4.1 平台部分高级功能采取订阅或单次计费模式。所有价格信息将通过显著方式在支付页面展示。
                            </p>
                            <p className="text-sm leading-relaxed mt-2">
                                4.2 平台内通过购买、订阅赠送、活动赠送等方式获得的积分均为永久有效，不设到期失效规则。
                            </p>
                            <p className="text-sm leading-relaxed mt-2">
                                4.3 基于数字产品的特殊性，除法律强制规定或因极端技术故障导致服务完全不可用的情况外，已购买的服务通常不支持中途退换。
                            </p>
                        </section>

                        <section>
                            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3">五、免责及限制声明</h3>
                            <p className="text-sm leading-relaxed">
                                Career Hero 旨在辅助求职过程，不承诺使用后的特定结果（如必然获得录取、必然涨薪等）。简历的最终呈现效果及面试表现终归取决于用户本人的实际情况及招聘市场的实时变动。
                            </p>
                        </section>

                        <section>
                            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3">六、法律管辖</h3>
                            <p className="text-sm leading-relaxed">
                                本协议的解释、效力及纠纷的解决，均适用中华人民共和国法律。若发生争议，双方应友好协商；协商不成的，均可提交协议签订地法院通过诉讼解决。
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


export default TermsOfService;
