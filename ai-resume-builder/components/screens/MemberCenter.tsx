import React, { useState, useMemo, useEffect } from 'react';
import { View, MembershipTier } from '../../types';
import { useAppContext } from '../../src/app-context';
import { ReferralModal } from '../ReferralModal';
import { useUserProfile } from '../../src/useUserProfile';
import { ADDON_POINT_PACKAGES, PLAN_MONTHLY_POINTS, REFERRAL_BONUS_POINTS } from '../../src/points-config';
import BackButton from '../shared/BackButton';

const MemberCenter: React.FC = () => {
    const { goBack, navigateToView, currentUser } = useAppContext();
    const [selectedTier, setSelectedTier] = useState<MembershipTier>(MembershipTier.PLUS);
    const [showReferralModal, setShowReferralModal] = useState(false);

    // User Profile Hook & Avatar Logic (Unified with Profile page)
    const { userProfile } = useUserProfile(currentUser?.id, currentUser);
    const DEFAULT_AVATAR = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='12' fill='%23f1f5f9'/%3E%3Cg transform='translate(4.8, 4.8) scale(0.6)' fill='%2394a3b8'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'%3E%3C/path%3E%3C/g%3E%3C/svg%3E`;
    const [avatar, setAvatar] = useState(DEFAULT_AVATAR);

    useEffect(() => {
        const uid = String(currentUser?.id || '').trim();
        const remoteAvatar = String((userProfile as any)?.avatar_url || '').trim();
        if (remoteAvatar) {
            setAvatar(remoteAvatar);
            if (uid) localStorage.setItem(`user_avatar:${uid}`, remoteAvatar);
            localStorage.setItem('user_avatar', remoteAvatar);
            return;
        }
        const savedAvatar = uid
            ? localStorage.getItem(`user_avatar:${uid}`)
            : localStorage.getItem('user_avatar');
        if (savedAvatar) setAvatar(savedAvatar);
    }, [currentUser?.id, userProfile?.avatar_url]);

    const displayName = useMemo(() =>
        userProfile?.name || currentUser?.user_metadata?.name || currentUser?.email?.split('@')[0] || '未登录用户'
        , [userProfile, currentUser]);

    const displayEmail = useMemo(() =>
        userProfile?.email || currentUser?.email || ''
        , [userProfile, currentUser]);

    // Referral code logic
    const referralCode = useMemo(() => {
        return userProfile?.referral_code || (currentUser?.id ? currentUser.id.substring(0, 6).toUpperCase() : 'AI8888');
    }, [currentUser, userProfile?.referral_code]);

    const normalizeMembershipTier = (raw: any): MembershipTier => {
        const tier = String(raw || '').trim().toUpperCase();
        if (tier === MembershipTier.STARTER) return MembershipTier.STARTER;
        if (tier === MembershipTier.PLUS) return MembershipTier.PLUS;
        if (tier === MembershipTier.PRO) return MembershipTier.PRO;
        if (tier === MembershipTier.ULTRA) return MembershipTier.ULTRA;
        return MembershipTier.FREE;
    };

    // Sync with database profile state
    const userSub = {
        tier: normalizeMembershipTier(
            (userProfile as any)?.membership_tier ||
            (currentUser as any)?.membership_tier ||
            (currentUser as any)?.user_metadata?.membership_tier
        ),
        autoRenew: false,
        pointsRemaining: Number((userProfile as any)?.points_balance ?? 0),
    };

    const tiers = [
        {
            id: MembershipTier.STARTER,
            name: 'Starter',
            price: '9.9',
            period: '/月',
            description: '入门首选，极速体验',
            features: [
                `每月赠送 ${PLAN_MONTHLY_POINTS.STARTER} 积分（永久有效）`,
                '支持 AI 诊断 / AI 面试按积分消耗',
            ],
            color: 'from-slate-500 to-slate-600',
            shadow: 'shadow-slate-500/30',
            txtColor: 'text-slate-50',
            btnColor: 'bg-slate-700',
            recommended: false,
        },
        {
            id: MembershipTier.PLUS,
            name: 'Plus',
            price: '29.9',
            period: '/月',
            description: '人气之选，高性价比',
            features: [
                `每月赠送 ${PLAN_MONTHLY_POINTS.PLUS} 积分（永久有效）`,
                '支持 AI 诊断 / AI 面试按积分消耗',
            ],
            color: 'from-blue-600 to-blue-700',
            shadow: 'shadow-blue-500/30',
            txtColor: 'text-blue-50',
            btnColor: 'bg-blue-800',
            recommended: true,
        },
        {
            id: MembershipTier.PRO,
            name: 'Pro',
            price: '49.9',
            period: '/月',
            description: '职业冲刺，专业必备',
            features: [
                `每月赠送 ${PLAN_MONTHLY_POINTS.PRO} 积分（永久有效）`,
                '支持 AI 诊断 / AI 面试按积分消耗',
            ],
            color: 'from-indigo-600 to-indigo-700',
            shadow: 'shadow-indigo-500/30',
            txtColor: 'text-indigo-50',
            btnColor: 'bg-indigo-800',
            recommended: false,
        },
        {
            id: MembershipTier.ULTRA,
            name: 'Ultra',
            price: '99.9',
            period: '/月',
            description: '至尊体验，全能旗舰',
            features: [
                `每月赠送 ${PLAN_MONTHLY_POINTS.ULTRA} 积分（永久有效）`,
                '支持 AI 诊断 / AI 面试按积分消耗',
            ],
            color: 'from-slate-800 to-slate-900',
            shadow: 'shadow-slate-900/30',
            txtColor: 'text-amber-50',
            btnColor: 'bg-amber-600', // Gold accent for Ultra
            recommended: false,
        },
    ];

    const addons = ADDON_POINT_PACKAGES.map((item) => ({
        name: `${item.points} 积分`,
        price: item.priceLabel,
        desc: '永久有效',
    }));

    const getTierStyle = (tier: MembershipTier) => {
        switch (tier) {
            case MembershipTier.STARTER:
                return {
                    bg: 'bg-white dark:bg-surface-dark',
                    border: 'border-slate-200 dark:border-slate-700',
                    iconBg: 'bg-slate-100 dark:bg-slate-800',
                    iconColor: 'text-slate-600 dark:text-slate-300',
                    orb: 'bg-slate-400/10'
                };
            case MembershipTier.PLUS:
                return {
                    bg: 'bg-white dark:bg-surface-dark',
                    border: 'border-blue-200 dark:border-blue-800',
                    iconBg: 'bg-blue-50 dark:bg-blue-900/30',
                    iconColor: 'text-blue-700 dark:text-blue-400',
                    orb: 'bg-blue-500/10'
                };
            case MembershipTier.PRO:
                return {
                    bg: 'bg-white dark:bg-surface-dark',
                    border: 'border-indigo-200 dark:border-indigo-800',
                    iconBg: 'bg-indigo-50 dark:bg-indigo-900/30',
                    iconColor: 'text-indigo-700 dark:text-indigo-400',
                    orb: 'bg-indigo-500/10'
                };
            case MembershipTier.ULTRA:
                return {
                    bg: 'bg-slate-900 dark:bg-black',
                    border: 'border-slate-800 dark:border-slate-800', // Specialized dark card for Ultra
                    iconBg: 'bg-slate-800 dark:bg-slate-900',
                    iconColor: 'text-amber-400',
                    orb: 'bg-amber-500/20'
                };
            default: // FREE
                return {
                    bg: 'bg-white dark:bg-surface-dark',
                    border: 'border-slate-200 dark:border-white/5',
                    iconBg: 'bg-slate-100 dark:bg-slate-700',
                    iconColor: 'text-slate-500 dark:text-slate-300',
                    orb: 'bg-slate-400/10'
                };
        }
    };

    const tierStyle = getTierStyle(userSub.tier);

    return (
        <div className="flex flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] animate-in fade-in duration-300">
            <ReferralModal
                isOpen={showReferralModal}
                onClose={() => setShowReferralModal(false)}
                referralCode={referralCode}
            />

            {/* Header */}
            <header className="sticky top-0 z-10 flex items-center justify-between px-4 h-14 bg-background-light/90 dark:bg-background-dark/90 backdrop-blur-md border-b border-transparent dark:border-white/5">
                <BackButton onClick={goBack} className="hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200" />
                <h1 className="text-lg font-bold text-slate-900 dark:text-white">权益中心</h1>
                <div className="w-10" /> {/* Spacer */}
            </header>

            <main className="flex-1 p-5 space-y-8">
                {/* User Info Card - Unified with Profile page style */}
                <div className="bg-white dark:bg-surface-dark rounded-2xl shadow-md border border-slate-200 dark:border-white/5 relative overflow-hidden">
                    <div className="p-4">
                        <div className="flex items-center gap-4 relative z-10">
                            {/* Avatar */}
                            <div className="shrink-0">
                                <div
                                    className="w-16 h-16 rounded-full bg-cover bg-center border-2 border-white dark:border-slate-700 shadow-sm"
                                    style={{ backgroundImage: `url("${avatar}")` }}
                                ></div>
                            </div>

                            {/* User Identity & Badge */}
                            <div className="flex flex-col flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 min-w-0">
                                    <h2 className="text-xl font-bold truncate text-slate-900 dark:text-white">
                                        {displayName}
                                    </h2>
                                    <span className={`shrink-0 px-2.5 py-0.5 rounded-full text-[10px] font-black ${tierStyle.iconBg} ${tierStyle.iconColor} border border-current opacity-90 uppercase tracking-tight`}>
                                        {userSub.tier === MembershipTier.FREE ? '免费版' : userSub.tier}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {userSub.tier !== MembershipTier.FREE ? (
                                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                                            积分永久有效
                                        </span>
                                    ) : (
                                        <span className="text-[11px] text-slate-400 dark:text-slate-500 truncate font-medium">
                                            {displayEmail}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Remaining Points Box */}
                            <div className="shrink-0 flex flex-col items-center justify-center min-w-[64px] h-16 px-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 shadow-inner">
                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight mb-1 whitespace-nowrap">剩余积分</span>
                                <span className="text-xl font-black text-primary dark:text-blue-400 leading-none">{userSub.pointsRemaining}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tiers Section */}
                <section>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 px-1">权益方案</h3>
                    <div className="space-y-4">
                        {tiers.map((tier) => (
                            <div
                                key={tier.id}
                                onClick={() => setSelectedTier(tier.id)}
                                className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${tier.color} p-6 text-white shadow-xl ${tier.shadow} cursor-pointer active:scale-[0.98] transition-all border border-white/10
                                    ${selectedTier === tier.id ? 'ring-4 ring-primary/30 scale-[1.02]' : 'hover:scale-[1.01]'}`}
                            >
                                {/* Decorative Blobs - Synced with Dashboard Style */}
                                <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl animate-pulse"></div>
                                <div className="absolute -left-16 -bottom-16 h-64 w-64 rounded-full bg-white/10 blur-3xl"></div>

                                {/* Recommend Badge */}
                                {tier.recommended && (
                                    <div className="absolute top-0 right-0 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-3 py-1 rounded-bl-xl shadow-sm z-10">
                                        超值推荐
                                    </div>
                                )}
                                {/* Starter Badge - Unified Style */}
                                {tier.id === MembershipTier.STARTER && (
                                    <div className="absolute top-0 right-0 bg-gradient-to-br from-amber-200 to-yellow-400 text-yellow-900 text-[10px] font-bold px-3 py-1 rounded-bl-xl shadow-sm z-10">
                                        新人福利
                                    </div>
                                )}

                                <div className="relative z-10">
                                    <div className="flex justify-between items-start mb-6">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <h4 className="text-2xl font-black italic tracking-wide">{tier.name}</h4>
                                                {selectedTier === tier.id && (
                                                    <span className="material-symbols-outlined text-white text-xl animate-in zoom-in">check_circle</span>
                                                )}
                                            </div>
                                            <p className={`text-xs font-medium opacity-80 ${tier.txtColor}`}>{tier.description}</p>
                                        </div>
                                        <div className="text-right">
                                            {tier.id === MembershipTier.STARTER ? (
                                                <div className="flex flex-col items-end pt-1">
                                                    <div className="flex items-end gap-1.5">
                                                        <span className="text-4xl font-black text-white leading-none tracking-tight">¥0</span>
                                                        <div className="flex flex-col items-start text-[10px] leading-tight opacity-80 pb-1">
                                                            <span className="line-through opacity-60">¥9.9</span>
                                                            <span>/首月</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-end">
                                                    <div className="flex items-baseline justify-end">
                                                        <span className="text-sm font-medium opacity-80 mr-0.5">¥</span>
                                                        <span className="text-3xl font-black leading-none">{tier.price}</span>
                                                        <span className="text-xs font-medium opacity-60 ml-1">{tier.period}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-3 mb-6 px-1">
                                        {tier.features.map((feat, idx) => (
                                            <div key={idx} className="flex items-center gap-2 text-sm font-medium opacity-95">
                                                <div className="size-5 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                                                    <span className="material-symbols-outlined text-[12px]">check</span>
                                                </div>
                                                <span>{feat}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <button className={`w-full py-3 rounded-xl font-bold text-sm bg-white text-${tier.color.split('-')[1]}-700 shadow-lg hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 group-hover:scale-[1.02] duration-300`}>
                                        <span className={tier.id === MembershipTier.STARTER ? 'text-slate-900' : tier.id === MembershipTier.ULTRA ? 'text-slate-900' : 'text-current'}>立即订阅</span>
                                        <span className={`material-symbols-outlined text-sm ${tier.id === MembershipTier.STARTER ? 'text-slate-900' : tier.id === MembershipTier.ULTRA ? 'text-slate-900' : 'text-current'}`}>arrow_forward</span>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Add-ons Section */}
                <section>
                    <div className="flex items-center justify-between mb-4 px-1">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">加油包</h3>
                        <span className="text-xs text-slate-500 dark:text-slate-400">单次购买 · 即时生效</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        {addons.map((addon, idx) => (
                            <div key={idx} className="bg-white dark:bg-slate-800 rounded-2xl p-3 border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col items-center text-center">
                                <h4 className="font-bold text-slate-900 dark:text-white text-sm">{addon.name}</h4>
                                <p className="text-primary font-black text-lg mt-1">{addon.price}</p>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">{addon.desc}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Referral Banner - Professional Style */}
                <div className="rounded-2xl bg-gradient-to-r from-slate-700 to-slate-900 p-5 text-white shadow-lg shadow-slate-500/20 relative overflow-hidden group">
                    <div className="absolute -right-6 -top-6 size-24 bg-white/5 rounded-full blur-xl group-hover:bg-white/10 transition-all" />
                    <div className="relative z-10 flex items-center justify-between">
                        <div>
                            <h3 className="font-bold text-lg text-white">邀请好友得奖励</h3>
                            <p className="text-xs text-slate-300 mt-1">
                                每邀1人，送 <span className="font-bold text-amber-400">{REFERRAL_BONUS_POINTS.inviter} 积分</span>
                            </p>
                        </div>
                        <button
                            onClick={() => setShowReferralModal(true)}
                            className="bg-white/10 border border-white/20 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm active:scale-95 transition-transform backdrop-blur-md"
                        >
                            去邀请
                        </button>
                    </div>
                </div>

                {/* Footer Notes */}
                <div className="text-center pb-8 space-y-2">
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">
                        订阅将自动续费，可随时在设置中取消。
                    </p>
                    <button
                        onClick={() => navigateToView(View.TERMS_OF_SERVICE)}
                        className="text-[10px] text-primary hover:underline"
                    >
                        服务协议
                    </button>
                    <span className="text-[10px] text-slate-300 mx-2">|</span>
                    <button
                        onClick={() => navigateToView(View.PRIVACY_POLICY)}
                        className="text-[10px] text-primary hover:underline"
                    >
                        隐私政策
                    </button>
                </div>
            </main>
        </div>
    );
};

export default MemberCenter;
