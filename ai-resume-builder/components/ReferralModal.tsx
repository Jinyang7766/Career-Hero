import React, { useState } from 'react';
import { REFERRAL_BONUS_POINTS } from '../src/points-config';

interface ReferralModalProps {
    isOpen: boolean;
    onClose: () => void;
    referralCode: string;
}

export const ReferralModal: React.FC<ReferralModalProps> = ({ isOpen, onClose, referralCode }) => {
    const [copied, setCopied] = useState(false);

    if (!isOpen) return null;

    const handleCopy = () => {
        navigator.clipboard.writeText(`使用我的邀请码 ${referralCode} 加入 Career Hero，双方各得 ${REFERRAL_BONUS_POINTS.inviter} 积分！https://career-hero.app/signup?ref=${referralCode}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            {/* Modal Container */}
            <div className="relative w-full max-w-[320px] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">

                {/* Standard Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">邀请好友</h3>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                        <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300">close</span>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* Visual Reward Section */}
                    <div className="text-center">
                        <div className="inline-flex items-center justify-center size-16 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-500 mb-3 ring-1 ring-amber-100 dark:ring-amber-500/20 shadow-sm">
                            <span className="material-symbols-outlined text-3xl">volunteer_activism</span>
                        </div>
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            每成功邀请1位好友注册
                        </p>
                        <div className="mt-1.5 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-700">
                            <span className="text-sm font-bold text-slate-900 dark:text-white">双方各得 {REFERRAL_BONUS_POINTS.inviter} 积分</span>
                        </div>
                    </div>

                    {/* Referral Code */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-1">您的专属邀请码</label>
                        <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700 dashed border-dashed">
                            <div className="flex-1 text-center font-mono text-2xl font-black tracking-widest text-slate-800 dark:text-slate-200">
                                {referralCode}
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={handleCopy}
                            className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border transition-all ${copied
                                ? 'border-green-500 bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400'
                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}
                        >
                            <span className="material-symbols-outlined text-xl">{copied ? 'check' : 'content_copy'}</span>
                            <span className="text-xs font-bold">{copied ? '已复制' : '复制口令'}</span>
                        </button>
                        <button
                            onClick={() => {
                                if (navigator.share) {
                                    navigator.share({
                                        title: 'Career Hero 邀请',
                                        text: `使用我的邀请码 ${referralCode} 加入 Career Hero，双方各得 ${REFERRAL_BONUS_POINTS.inviter} 积分！`,
                                        url: `https://career-hero.app/signup?ref=${referralCode}`
                                    }).catch(() => { });
                                } else {
                                    handleCopy();
                                }
                            }}
                            className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl bg-primary text-white shadow-lg shadow-primary/30 active:scale-95 transition-transform hover:bg-blue-600"
                        >
                            <span className="material-symbols-outlined text-xl">share</span>
                            <span className="text-xs font-bold">立即分享</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
