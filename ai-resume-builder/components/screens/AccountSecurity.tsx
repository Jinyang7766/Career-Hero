import React, { useEffect, useState } from 'react';
import { View, ScreenProps } from '../../types';
import { useUserProfile } from '../../src/useUserProfile';
import { supabase } from '../../src/supabase-client';
import { buildApiUrl } from '../../src/api-config';
import { confirmDialog } from '../../src/ui/dialogs';
import { useAppContext } from '../../src/app-context';
import { DatabaseService } from '../../src/database-service';
import BackButton from '../shared/BackButton';

const AccountSecurity: React.FC<ScreenProps> = () => {
  const SHOW_THIRD_PARTY_BINDING = false;
  const logout = useAppContext((s) => s.logout);
  const goBack = useAppContext((s) => s.goBack);
  const currentUser = useAppContext((s) => s.currentUser);
  const navigateToView = useAppContext((s) => s.navigateToView);
  const { userProfile } = useUserProfile();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [isUpdatingPhone, setIsUpdatingPhone] = useState(false);
  const [phoneDisplay, setPhoneDisplay] = useState('');

  const email = currentUser?.email || userProfile?.email || '';
  const phone = phoneDisplay || userProfile?.phone || '';

  useEffect(() => {
    setPhoneDisplay(userProfile?.phone || '');
  }, [userProfile?.phone]);

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
      if (immediate) {
        logout({ skipConfirm: true });
      } else {
        if (currentUser) {
          currentUser.deletion_pending_until = payload?.deletion_pending_until || null;
        }
        navigateToView(View.DELETION_PENDING, { replace: true });
      }
    } catch (err) {
      console.error('Delete account error:', err);
      alert(`注销操作失败：${err instanceof Error ? err.message : '请稍后重试'}`);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const resetPasswordModalState = () => {
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setIsUpdatingPassword(false);
  };

  const handleUpdatePassword = async () => {
    const pwd = newPassword.trim();
    const confirm = confirmPassword.trim();

    if (!pwd || !confirm) {
      setPasswordError('请填写完整的新密码信息');
      return;
    }
    if (pwd.length < 8) {
      setPasswordError('新密码至少需要 8 位');
      return;
    }
    if (pwd !== confirm) {
      setPasswordError('两次输入的新密码不一致');
      return;
    }

    setPasswordError('');
    setIsUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) {
        throw new Error(error.message || '更新失败');
      }
      alert('密码修改成功，请使用新密码登录');
      setShowPasswordModal(false);
      resetPasswordModalState();
    } catch (err) {
      console.error('Update password error:', err);
      setPasswordError(`修改密码失败：${err instanceof Error ? err.message : '请稍后重试'}`);
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleOpenPhoneModal = () => {
    setPhoneInput(phone || '');
    setPhoneError('');
    setShowPhoneModal(true);
  };

  const handleUpdatePhone = async () => {
    const normalized = phoneInput.replace(/\s+/g, '').trim();
    if (!normalized) {
      setPhoneError('请输入手机号');
      return;
    }

    const phonePattern = /^(\+?86)?1[3-9]\d{9}$/;
    if (!phonePattern.test(normalized)) {
      setPhoneError('手机号格式不正确');
      return;
    }

    if (!currentUser?.id) {
      setPhoneError('登录状态已失效，请重新登录后再试');
      return;
    }

    setPhoneError('');
    setIsUpdatingPhone(true);
    try {
      const result = await DatabaseService.updateUser(currentUser.id, { phone: normalized });
      if (!result.success) {
        throw new Error((result as any)?.error?.message || '更新失败');
      }
      setPhoneDisplay(normalized);
      setShowPhoneModal(false);
      alert('手机号绑定成功');
    } catch (err) {
      console.error('Update phone error:', err);
      setPhoneError(`绑定失败：${err instanceof Error ? err.message : '请稍后重试'}`);
    } finally {
      setIsUpdatingPhone(false);
    }
  };

  return (
    <div className="bg-background-light dark:bg-background-dark h-screen flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
      <header className="fixed top-0 left-0 right-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5 mx-auto w-full max-w-md">
        <div className="flex items-center px-4 h-14 relative">
          <BackButton onClick={goBack} className="z-10" />
          <h2 className="absolute inset-0 flex items-center justify-center text-lg font-bold leading-tight tracking-[-0.015em] text-slate-900 dark:text-white pointer-events-none">账号与安全</h2>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-24 pt-14">
        {/* Login Security */}
        <div className="mt-4 px-4">
          <h3 className="ml-4 mb-2 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">登录与安全</h3>
          <div className="bg-white dark:bg-surface-dark rounded-2xl overflow-hidden shadow-md border border-slate-200 dark:border-white/5 divide-y divide-slate-100 dark:divide-white/5">
            <button
              onClick={() => {
                resetPasswordModalState();
                setShowPasswordModal(true);
              }}
              className="w-full flex items-center justify-between py-3.5 px-4 active:bg-slate-50 dark:active:bg-white/5 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[20px]">lock_reset</span>
                </div>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">修改密码</span>
              </div>
              <span className="material-symbols-outlined text-slate-400 dark:text-slate-600 text-[20px] group-hover:translate-x-0.5 transition-transform group-hover:text-primary">chevron_right</span>
            </button>

            <button
              onClick={handleOpenPhoneModal}
              className="w-full flex items-center justify-between py-3.5 px-4 active:bg-slate-50 dark:active:bg-white/5 transition-colors group"
            >
              <div className="flex items-center gap-3 shrink-0 mr-4">
                <div className="w-9 h-9 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[20px]">smartphone</span>
                </div>
                <span className="text-sm font-semibold text-slate-900 dark:text-white whitespace-nowrap">手机号</span>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[13px] text-slate-500 dark:text-slate-500 font-medium truncate">{phone || '未绑定'}</span>
                <span className="material-symbols-outlined text-slate-400 dark:text-slate-600 text-[20px] shrink-0 group-hover:translate-x-0.5 transition-transform group-hover:text-primary">chevron_right</span>
              </div>
            </button>

            <button className="w-full flex items-center justify-between py-3.5 px-4 active:bg-slate-50 dark:active:bg-white/5 transition-colors group">
              <div className="flex items-center gap-3 shrink-0 mr-4">
                <div className="w-9 h-9 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-[20px]">mail</span>
                </div>
                <span className="text-sm font-semibold text-slate-900 dark:text-white whitespace-nowrap">电子邮箱</span>
              </div>
              <div className="flex items-center gap-2 min-w-0 text-right">
                <span className="text-[13px] text-slate-500 dark:text-slate-500 font-medium truncate">{email || '未绑定'}</span>
                <span className="material-symbols-outlined text-slate-400 dark:text-slate-600 text-[20px] shrink-0 group-hover:translate-x-0.5 transition-transform group-hover:text-primary">chevron_right</span>
              </div>
            </button>
          </div>
        </div>

        {SHOW_THIRD_PARTY_BINDING && (
          <div className="mt-6 px-4">
            <h3 className="ml-4 mb-2 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">第三方账号绑定</h3>
            <div className="bg-white dark:bg-surface-dark rounded-2xl overflow-hidden shadow-md border border-slate-200 dark:border-white/5 divide-y divide-slate-100 dark:divide-white/5">
              <div className="w-full flex items-center justify-between py-3.5 px-4 active:bg-slate-50 dark:active:bg-white/5 transition-colors group">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#07c160]/10 dark:bg-[#07c160]/20 flex items-center justify-center text-[#07c160]">
                    <span className="material-symbols-outlined text-[20px]">chat</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">微信</span>
                </div>
                <button className="text-[14px] font-medium text-primary hover:opacity-80">
                  去绑定
                </button>
              </div>
              <div className="w-full flex items-center justify-between py-3.5 px-4 active:bg-slate-50 dark:active:bg-white/5 transition-colors group">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#12b7f5]/10 dark:bg-[#12b7f5]/20 flex items-center justify-center text-[#12b7f5]">
                    <span className="material-symbols-outlined text-[20px]">chat</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">QQ</span>
                </div>
                <button className="text-[14px] font-medium text-primary hover:opacity-80">
                  去绑定
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 px-4 space-y-3 mb-8">
          <div className="pt-2">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl border border-rose-200 dark:border-[#ff3b30]/30 text-[#ff3b30] hover:bg-rose-50 dark:hover:bg-[#ff3b30]/5 active:scale-[0.98] transition-all shadow-sm"
            >
              <span className="text-[16px] font-semibold">注销账号</span>
            </button>
            <p className="mt-3 text-[12px] text-slate-400 dark:text-slate-600 text-center px-4">
              注销后，您的所有个人数据（包括简历历史）将被永久删除且无法恢复。
            </p>
          </div>
        </div>

        {/* Update Password Modal */}
        {showPasswordModal && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center animate-in fade-in duration-300">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => {
                if (isUpdatingPassword) return;
                setShowPasswordModal(false);
                resetPasswordModalState();
              }}
            />
            <div className="relative w-full max-w-md bg-white dark:bg-[#1c1c1e] rounded-t-[32px] p-8 pb-12 shadow-2xl animate-in slide-in-from-bottom duration-500">
              <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-6"></div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">修改密码</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-6">请输入新的登录密码（至少 8 位）。</p>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-slate-500 dark:text-slate-400">新密码</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="请输入新密码"
                    className="mt-2 w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111a22] px-4 py-3 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-500 dark:text-slate-400">确认新密码</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="请再次输入新密码"
                    className="mt-2 w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111a22] px-4 py-3 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                {passwordError && (
                  <p className="text-sm text-red-500">{passwordError}</p>
                )}
              </div>

              <div className="mt-8 space-y-3">
                <button
                  disabled={isUpdatingPassword}
                  onClick={handleUpdatePassword}
                  className="w-full rounded-2xl bg-primary text-white py-3.5 font-bold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60"
                >
                  {isUpdatingPassword ? '提交中...' : '确认修改'}
                </button>
                <button
                  disabled={isUpdatingPassword}
                  onClick={() => {
                    setShowPasswordModal(false);
                    resetPasswordModalState();
                  }}
                  className="w-full rounded-2xl bg-black/10 dark:bg-white/10 text-slate-700 dark:text-slate-200 py-3.5 font-bold hover:opacity-90 active:scale-[0.98] transition-all"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Update Phone Modal */}
        {showPhoneModal && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center animate-in fade-in duration-300">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => {
                if (isUpdatingPhone) return;
                setShowPhoneModal(false);
                setPhoneError('');
              }}
            />
            <div className="relative w-full max-w-md bg-white dark:bg-[#1c1c1e] rounded-t-[32px] p-8 pb-12 shadow-2xl animate-in slide-in-from-bottom duration-500">
              <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-6"></div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{phone ? '修改手机号' : '绑定手机号'}</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-6">请输入常用手机号，用于账号安全与通知。</p>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-slate-500 dark:text-slate-400">手机号</label>
                  <input
                    type="tel"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="例如 13800138000"
                    className="mt-2 w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111a22] px-4 py-3 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                {phoneError && (
                  <p className="text-sm text-red-500">{phoneError}</p>
                )}
              </div>

              <div className="mt-8 space-y-3">
                <button
                  disabled={isUpdatingPhone}
                  onClick={handleUpdatePhone}
                  className="w-full rounded-2xl bg-primary text-white py-3.5 font-bold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60"
                >
                  {isUpdatingPhone ? '提交中...' : (phone ? '确认修改' : '确认绑定')}
                </button>
                <button
                  disabled={isUpdatingPhone}
                  onClick={() => {
                    setShowPhoneModal(false);
                    setPhoneError('');
                  }}
                  className="w-full rounded-2xl bg-black/10 dark:bg-white/10 text-slate-700 dark:text-slate-200 py-3.5 font-bold hover:opacity-90 active:scale-[0.98] transition-all"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

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
