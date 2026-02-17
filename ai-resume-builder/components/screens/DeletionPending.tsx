import React from 'react';
import { View, ScreenProps } from '../../types';
import { supabase } from '../../src/supabase-client';
import { buildApiUrl } from '../../src/api-config';
import { useAppContext } from '../../src/app-context';

const DeletionPending: React.FC<ScreenProps> = () => {
    const currentUser = useAppContext((s) => s.currentUser);
    const navigateToView = useAppContext((s) => s.navigateToView);
    const logout = useAppContext((s) => s.logout);
    const deletionUntil = currentUser?.deletion_pending_until;

    const handleRestore = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const response = await fetch(buildApiUrl('/api/user/cancel-deletion'), {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();
            if (response.ok) {
                alert('账号已成功恢复！');
                // Update currentUser locally or just refresh
                if (currentUser) {
                    currentUser.deletion_pending_until = null;
                }
                navigateToView(View.DASHBOARD, { root: true, replace: true });
            } else {
                alert(result.error || '恢复失败');
            }
        } catch (err) {
            console.error(err);
            alert('网络错误');
        }
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="bg-background-light dark:bg-background-dark h-screen flex flex-col items-center justify-center px-6 text-center animate-in fade-in duration-500 relative overflow-hidden">
            {/* Decorative Background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {/* Main Blobs - Soft & Large */}
                <div className="absolute top-[-5%] left-[-5%] w-[400px] h-[400px] rounded-full bg-primary/10 blur-[100px] animate-pulse" style={{ animationDuration: '8s' }}></div>
                <div className="absolute bottom-[-5%] right-[-5%] w-[350px] h-[350px] rounded-full bg-blue-500/10 blur-[100px] animate-pulse" style={{ animationDuration: '10s', animationDelay: '1s' }}></div>
                <div className="absolute top-[20%] right-[10%] w-[150px] h-[150px] rounded-full bg-purple-500/5 blur-[80px]"></div>

                {/* Subtle Grid Interaction */}
                <div className="absolute inset-0 opacity-[0.2] dark:opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(circle, #3b82f6 1px, transparent 1px)', backgroundSize: '32px 32px' }}></div>

                {/* Floating Accents */}
                <div className="absolute top-[15%] left-[20%] w-24 h-24 border border-primary/10 rounded-full"></div>
                <div className="absolute bottom-[25%] right-[15%] w-16 h-16 border border-blue-400/10 rounded-lg rotate-12"></div>
            </div>

            <div className="relative z-10 flex flex-col items-center w-full max-w-sm bg-white/80 dark:bg-black/20 p-8 rounded-3xl backdrop-blur-xl shadow-xl border border-white dark:border-white/5">
                <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center mb-6 shadow-md shadow-amber-500/10 border border-amber-200 dark:border-amber-700/30">
                    <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-4xl">warning</span>
                </div>

                <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">账号注销处理中</h1>

                <p className="text-slate-600 dark:text-slate-400 mb-8 leading-relaxed">
                    您的账号已申请注销，所有数据将在 <br />
                    <span className="font-bold text-slate-900 dark:text-white">{formatDate(deletionUntil)}</span> <br />
                    之后被永久清除。在此期间，您可以随时恢复账号。
                </p>

                <div className="w-full space-y-4">
                    <button
                        onClick={handleRestore}
                        className="w-full py-4 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/30 active:scale-[0.98] transition-all"
                    >
                        恢复账号
                    </button>

                    <button
                        onClick={() => logout()}
                        className="w-full py-4 bg-white dark:bg-white/5 text-slate-700 dark:text-slate-400 rounded-xl font-bold border border-slate-200 dark:border-white/10 active:scale-[0.98] transition-all shadow-sm hover:bg-slate-50 dark:hover:bg-white/10"
                    >
                        退出登录
                    </button>
                </div>

                <p className="mt-8 text-xs text-slate-400 dark:text-slate-500">
                    如果您不进行任何操作，账号将在到期后自动注销。
                </p>
            </div>
        </div>
    );
};

export default DeletionPending;
