import React, { useState } from 'react';
import { View, ScreenProps } from '../../types';
import QqPenguinIcon from '../icons/QqPenguinIcon';
import { useUserProfile } from '../../src/useUserProfile';
import { supabase } from '../../src/supabase-client';
import { buildApiUrl } from '../../src/api-config';
import { confirmDialog } from '../../src/ui/dialogs';
import { useAppContext } from '../../src/app-context';

const AccountSecurity: React.FC<ScreenProps> = () => {
  const { logout, goBack, currentUser } = useAppContext();
  const { userProfile } = useUserProfile();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const email = currentUser?.email || userProfile?.email || '';
  const phone = userProfile?.phone || '';

  const handleDeleteAccount = async (immediate: boolean) => {
    setIsDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token?.trim();
      if (!token) {
        alert('登录状态已失效，请重新登录后再试');
        return;
      }

      const url = immediate
        ? buildApiUrl('/api/user/delete-account-immediate')
        : buildApiUrl('/api/user/request-deletion');

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      let payload: any = null;
      try {
        payload = await resp.json();
      } catch {
        payload = null;
      }

      if (!resp.ok) {
        const msg = payload?.error || payload?.message || `请求失败 (${resp.status})`;
        throw new Error(msg);
      }

      alert(payload?.message || (immediate ? '账号已立即注销' : '已提交注销申请'));
      logout();
    } catch (err) {
      console.error('Delete account error:', err);
      alert(`注销操作失败：${err instanceof Error ? err.message : '请稍后重试'}`);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="bg-background-light dark:bg-background-dark h-screen flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
      <header className="sticky top-0 z-40 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-slate-200/50 dark:border-white/5 shrink-0">
        <div className="flex items-center px-4 h-14 relative">
          <button
            onClick={goBack}
            className="flex size-10 items-center justify-center rounded-full text-slate-900 dark:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors z-10"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>arrow_back</span>
          </button>
          <h2 className="absolute inset-0 flex items-center justify-center text-lg font-bold leading-tight tracking-[-0.015em] text-slate-900 dark:text-white pointer-events-none">账号与安全</h2>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-24">
        {/* Login Security */}
        <div className="mt-4 px-4">
          <h3 className="ml-4 mb-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">登录与安全</h3>
          <div className="bg-white dark:bg-surface-dark rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-white/5 divide-y divide-gray-100 dark:divide-white/5">
            <button className="w-full flex items-center justify-between py-3.5 px-4 active:bg-gray-50 dark:active:bg-white/5 transition-colors group">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/5 dark:bg-primary/10 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[20px]">lock_reset</span>
                </div>
                <span className="text-sm font-medium text-slate-900 dark:text-white">修改密码</span>
              </div>
              <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-[20px] group-hover:translate-x-0.5 transition-transform">chevron_right</span>
            </button>

            <button className="w-full flex items-center justify-between py-3.5 px-4 active:bg-gray-50 dark:active:bg-white/5 transition-colors group">
              <div className="flex items-center gap-3 shrink-0 mr-4">
                <div className="w-9 h-9 rounded-xl bg-primary/5 dark:bg-primary/10 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[20px]">smartphone</span>
                </div>
                <span className="text-sm font-medium text-slate-900 dark:text-white whitespace-nowrap">手机号</span>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[13px] text-slate-500 dark:text-slate-500 font-medium truncate">{phone || '未绑定'}</span>
                <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-[20px] shrink-0 group-hover:translate-x-0.5 transition-transform">chevron_right</span>
              </div>
            </button>

            <button className="w-full flex items-center justify-between py-3.5 px-4 active:bg-gray-50 dark:active:bg-white/5 transition-colors group">
              <div className="flex items-center gap-3 shrink-0 mr-4">
                <div className="w-9 h-9 rounded-xl bg-primary/5 dark:bg-primary/10 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[20px]">mail</span>
                </div>
                <span className="text-sm font-medium text-slate-900 dark:text-white whitespace-nowrap">电子邮箱</span>
              </div>
              <div className="flex items-center gap-2 min-w-0 text-right">
                <span className="text-[13px] text-slate-500 dark:text-slate-500 font-medium truncate">{email || '未绑定'}</span>
                <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-[20px] shrink-0 group-hover:translate-x-0.5 transition-transform">chevron_right</span>
              </div>
            </button>
          </div>
        </div>

        {/* Third-party Binding */}
        <div className="mt-6 px-4">
          <h3 className="ml-4 mb-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">第三方账号绑定</h3>
          <div className="bg-white dark:bg-surface-dark rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-white/5 divide-y divide-gray-100 dark:divide-white/5">
            <div className="w-full flex items-center justify-between py-3.5 px-4 active:bg-gray-50 dark:active:bg-white/5 transition-colors group">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#07c160]/5 dark:bg-[#07c160]/10 flex items-center justify-center text-[#07c160]">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9.5 4C5.91 4 3 6.47 3 9.5c0 1.75 1 3.34 2.65 4.43l-.6 1.97 2.28-1.2c.7.2 1.44.31 2.17.31.24 0 .48-.01.71-.03-.06-.25-.09-.52-.09-.79 0-2.63 2.48-4.75 5.55-4.75.42 0 .83.04 1.23.11C15.78 6.35 12.92 4 9.5 4zm-2 4.2a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm4 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
                    <path d="M16.55 10.5c-3.01 0-5.45 2.03-5.45 4.5s2.44 4.5 5.45 4.5c.59 0 1.17-.08 1.72-.22l2.08 1.1-.55-1.82c1.26-.82 2.03-2.06 2.03-3.56 0-2.47-2.44-4.5-5.28-4.5zm-1.95 2.7a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8zm3.6 0a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8z" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-slate-900 dark:text-white">微信</span>
              </div>
              <button className="text-[14px] font-medium text-primary hover:opacity-80">
                去绑定
              </button>
            </div>
            <div className="w-full flex items-center justify-between py-3.5 px-4 active:bg-gray-50 dark:active:bg-white/5 transition-colors group">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#12b7f5]/5 dark:bg-[#12b7f5]/10 flex items-center justify-center text-[#12b7f5]">
                  <QqPenguinIcon className="h-5 w-5" />
                </div>
                <span className="text-sm font-medium text-slate-900 dark:text-white">QQ</span>
              </div>
              <button className="text-[14px] font-medium text-primary hover:opacity-80">
                去绑定
              </button>
            </div>
          </div>
        </div>

        <div className="mt-8 px-4 space-y-3 mb-8">
          <div className="pt-2">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl border border-[#ff3b30]/30 text-[#ff3b30] hover:bg-[#ff3b30]/5 active:scale-[0.98] transition-all"
            >
              <span className="text-[16px] font-semibold">注销账号</span>
            </button>
            <p className="mt-3 text-[12px] text-slate-400 dark:text-slate-600 text-center px-4">
              注销后，您的所有个人数据（包括简历历史）将被永久删除且无法恢复。
            </p>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center animate-in fade-in duration-300">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => !isDeleting && setShowDeleteConfirm(false)}
            ></div>
            <div className="relative w-full max-w-md bg-white dark:bg-[#1c1c1e] rounded-t-[32px] p-8 pb-12 shadow-2xl animate-in slide-in-from-bottom duration-500">
              <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-6"></div>

              <div className="mb-8">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">确认注销账号吗？</h3>
                <p className="text-slate-500 dark:text-slate-400">
                  为了您的数据安全，我们为您提供两种注销方式。
                </p>
              </div>

              <div className="space-y-4">
                <button
                  disabled={isDeleting}
                  onClick={() => handleDeleteAccount(false)}
                  className="w-full group flex flex-col items-start p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 hover:border-primary/30 transition-all text-left"
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="font-bold text-slate-900 dark:text-white text-[16px]">冷静期注销（推荐）</span>
                    <span className="material-symbols-outlined text-primary text-[20px]">schedule</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    账号数据保留3天，期间可随时登录恢复，3天后自动永久清除。
                  </p>
                </button>

                <button
                  disabled={isDeleting}
                  onClick={async () => {
                    const ok = await confirmDialog('警告：立即注销将瞬间清空所有简历和账号记录，且绝对无法恢复！确认继续？');
                    if (ok) handleDeleteAccount(true);
                  }}
                  className="w-full group flex flex-col items-start p-4 rounded-2xl bg-white dark:bg-black/20 border border-slate-100 dark:border-white/5 hover:border-red-500/30 transition-all text-left"
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="font-bold text-red-500 text-[16px]">立即永久注销</span>
                    <span className="material-symbols-outlined text-red-500 text-[20px]">delete_forever</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    点击后立即永久清除所有云端数据，无法撤销。
                  </p>
                </button>

                <button
                  disabled={isDeleting}
                  onClick={() => setShowDeleteConfirm(false)}
                  className="w-full py-4 text-slate-500 dark:text-slate-400 font-medium text-[16px] active:scale-95 transition-all"
                >
                  取消
                </button>
              </div>

              {isDeleting && (
                <div className="absolute inset-0 bg-white/50 dark:bg-black/50 backdrop-blur-[2px] rounded-t-[32px] flex items-center justify-center z-50">
                  <div className="flex flex-col items-center gap-3">
                    <div className="size-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
                    <p className="text-sm font-medium text-primary">处理中...</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default AccountSecurity;
