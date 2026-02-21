import React, { useRef, useState, Fragment } from 'react';
import { View, ScreenProps, MembershipTier } from '../../types';
import { useUserProfile } from '../../src/useUserProfile';
import { useAppContext } from '../../src/app-context';
import { APP_VERSION_CN } from '../../src/app-version';
import { ReferralModal } from '../ReferralModal';
import { DatabaseService } from '../../src/database-service';



const MenuItem: React.FC<{ onClick: () => void, icon: string, label: string, color: string, badge?: string }> = ({ onClick, icon, label, color, badge }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center justify-between py-3.5 px-4 active:bg-slate-100 dark:active:bg-white/5 transition-colors group"
  >
    <div className="flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center text-primary`}>
        <span className="material-symbols-outlined text-[20px] font-medium">{icon}</span>
      </div>
      <span className="text-sm font-semibold text-slate-900 dark:text-white">{label}</span>
    </div>
    <div className="flex items-center gap-2">
      {badge && (
        <span className="text-[10px] font-bold bg-primary text-white px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm shadow-primary/30">
          {badge}
        </span>
      )}
      <span className="material-symbols-outlined text-slate-400 dark:text-slate-600 text-[20px] group-hover:translate-x-0.5 transition-transform group-hover:text-primary">chevron_right</span>
    </div>
  </button>
);

const Profile: React.FC<ScreenProps> = () => {
  const navigateToView = useAppContext((s) => s.navigateToView);
  const currentUser = useAppContext((s) => s.currentUser);
  const isLoggedIn = !!currentUser?.id;
  const resolvedTheme = useAppContext((s) => s.resolvedTheme);
  const isDarkMode = resolvedTheme === 'dark';
  const DEFAULT_AVATAR = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='12' fill='%23f1f5f9'/%3E%3Cg transform='translate(4.8, 4.8) scale(0.6)' fill='%2394a3b8'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'%3E%3C/path%3E%3C/g%3E%3C/svg%3E`;
  const [avatar, setAvatar] = React.useState(DEFAULT_AVATAR);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropBoxSize = 280;
  const outputSize = 512;
  const [isCropOpen, setIsCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState('');
  const [cropNatural, setCropNatural] = useState({ w: 0, h: 0 });
  const [cropScale, setCropScale] = useState(1);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ active: boolean; x: number; y: number }>({ active: false, x: 0, y: 0 });
  const pinchRef = useRef<{
    active: boolean;
    startDistance: number;
    startScale: number;
    startOffsetX: number;
    startOffsetY: number;
    startMidX: number;
    startMidY: number;
  }>({
    active: false,
    startDistance: 0,
    startScale: 1,
    startOffsetX: 0,
    startOffsetY: 0,
    startMidX: 0,
    startMidY: 0,
  });

  const getAvatarStorageKey = (uid?: string) => `user_avatar:${String(uid || 'guest')}`;
  const clampOffset = React.useCallback((offsetX: number, offsetY: number, scale: number) => {
    const w = cropNatural.w * scale;
    const h = cropNatural.h * scale;
    const maxX = Math.max(0, (w - cropBoxSize) / 2);
    const maxY = Math.max(0, (h - cropBoxSize) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, offsetX)),
      y: Math.max(-maxY, Math.min(maxY, offsetY)),
    };
  }, [cropNatural.h, cropNatural.w]);
  // Get user profile with real name
  const { userProfile, loading, error } = useUserProfile(currentUser?.id, currentUser);

  // Load avatar from user profile / localStorage
  React.useEffect(() => {
    const uid = String(currentUser?.id || '').trim();
    if (!uid) {
      setAvatar(DEFAULT_AVATAR);
      return;
    }
    const remoteAvatar = String((userProfile as any)?.avatar_url || '').trim();
    if (remoteAvatar) {
      setAvatar(remoteAvatar);
      if (uid) localStorage.setItem(getAvatarStorageKey(uid), remoteAvatar);
      localStorage.setItem('user_avatar', remoteAvatar);
      return;
    }
    const savedAvatar = localStorage.getItem(getAvatarStorageKey(uid));
    if (savedAvatar) setAvatar(savedAvatar);
    else setAvatar(DEFAULT_AVATAR);
  }, [DEFAULT_AVATAR, currentUser?.id, userProfile?.avatar_url]);
  const displayName =
    userProfile?.name ||
    currentUser?.user_metadata?.name ||
    currentUser?.email?.split('@')[0] ||
    '';
  const displayEmail =
    userProfile?.email ||
    currentUser?.email ||
    '';

  // Format creation date
  const joinedDate = React.useMemo(() => {
    const dateStr = userProfile?.created_at || currentUser?.created_at;
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  }, [userProfile, currentUser]);

  const handleAvatarClick = () => {
    if (!isLoggedIn) {
      navigateToView(View.LOGIN, { replace: true });
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          setCropSrc(String(e.target.result));
          setCropNatural({ w: 0, h: 0 });
          setCropScale(1);
          setCropOffset({ x: 0, y: 0 });
          setIsCropOpen(true);
        }
      };
      reader.readAsDataURL(file);
    }
    event.target.value = '';
  };

  React.useEffect(() => {
    if (!cropSrc) return;
    const img = new Image();
    img.onload = () => {
      const w = Number(img.naturalWidth || 0);
      const h = Number(img.naturalHeight || 0);
      if (!w || !h) return;
      const minScale = Math.max(cropBoxSize / w, cropBoxSize / h);
      setCropNatural({ w, h });
      setCropScale(minScale);
      setCropOffset({ x: 0, y: 0 });
    };
    img.src = cropSrc;
  }, [cropSrc]);

  const saveAvatar = React.useCallback(async () => {
    if (!cropSrc || !currentUser?.id || !cropNatural.w || !cropNatural.h) return;
    const img = new Image();
    const completed = new Promise<string>((resolve, reject) => {
      img.onload = async () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = outputSize;
          canvas.height = outputSize;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('canvas context unavailable'));

          const scale = cropScale;
          const displayW = cropNatural.w * scale;
          const displayH = cropNatural.h * scale;
          const center = cropBoxSize / 2;
          const topLeftX = center + cropOffset.x - (displayW / 2);
          const topLeftY = center + cropOffset.y - (displayH / 2);
          const sx = (0 - topLeftX) / scale;
          const sy = (0 - topLeftY) / scale;
          const sw = cropBoxSize / scale;
          const sh = cropBoxSize / scale;
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outputSize, outputSize);
          resolve(canvas.toDataURL('image/jpeg', 0.9));
        } catch (err) {
          reject(err as any);
        }
      };
      img.onerror = () => reject(new Error('image load failed'));
    });
    img.src = cropSrc;

    try {
      const croppedDataUrl = await completed;
      setAvatar(croppedDataUrl);
      const uid = String(currentUser.id || '').trim();
      if (uid) localStorage.setItem(getAvatarStorageKey(uid), croppedDataUrl);
      localStorage.setItem('user_avatar', croppedDataUrl);

      const updateResult = await DatabaseService.updateUser(String(currentUser.id), {
        avatar_url: croppedDataUrl,
      });
      if (!updateResult.success) {
        console.warn('Failed to persist avatar to users.avatar_url:', updateResult.error);
      }
    } finally {
      setIsCropOpen(false);
      setCropSrc('');
    }
  }, [cropNatural.h, cropNatural.w, cropOffset.x, cropOffset.y, cropScale, cropSrc, currentUser?.id]);

  const [showReferralModal, setShowReferralModal] = useState(false);
  const minCropScale = cropNatural.w && cropNatural.h
    ? Math.max(cropBoxSize / cropNatural.w, cropBoxSize / cropNatural.h)
    : 1;
  const maxCropScale = Math.max(minCropScale, minCropScale * 4);
  const clampCropScale = React.useCallback((scale: number) => (
    Math.max(minCropScale, Math.min(maxCropScale, scale))
  ), [maxCropScale, minCropScale]);

  const beginDrag = (clientX: number, clientY: number) => {
    dragRef.current = { active: true, x: clientX, y: clientY };
  };
  const moveDrag = (clientX: number, clientY: number) => {
    if (!dragRef.current.active) return;
    const dx = clientX - dragRef.current.x;
    const dy = clientY - dragRef.current.y;
    dragRef.current = { active: true, x: clientX, y: clientY };
    setCropOffset((prev) => clampOffset(prev.x + dx, prev.y + dy, cropScale));
  };
  const endDrag = () => {
    dragRef.current.active = false;
  };
  const getTouchDistance = (a: React.Touch, b: React.Touch) => {
    const dx = b.clientX - a.clientX;
    const dy = b.clientY - a.clientY;
    return Math.hypot(dx, dy);
  };
  const getTouchMidpoint = (a: React.Touch, b: React.Touch) => ({
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  });

  // Mock referral code - in real app, derive from user ID or backend
  const referralCode = React.useMemo(() => {
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

  const userSub = {
    tier: normalizeMembershipTier(
      (userProfile as any)?.membership_tier ||
      (currentUser as any)?.membership_tier ||
      (currentUser as any)?.user_metadata?.membership_tier
    ),
    pointsRemaining: Number((userProfile as any)?.points_balance ?? 0),
  };

  const handleProtectedAction = async (action: () => void, message: string = '该功能需要登录后使用，是否立即去登录？') => {
    if (isLoggedIn) {
      action();
      return;
    }

    try {
      const confirmAsync = (window as any).__careerHeroConfirm;
      let confirmed = false;
      if (typeof confirmAsync === 'function') {
        confirmed = await confirmAsync(message);
      } else {
        confirmed = window.confirm(message);
      }

      if (confirmed) {
        navigateToView(View.LOGIN);
      }
    } catch {
      // Fallback
      navigateToView(View.LOGIN);
    }
  };

  return (
    <div className="flex flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] animate-in fade-in duration-300">
      <ReferralModal
        isOpen={showReferralModal}
        onClose={() => setShowReferralModal(false)}
        referralCode={referralCode}
      />
      {isCropOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in zoom-in duration-300">
          <div className="w-full max-w-[360px] rounded-[2.5rem] bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-white/20 dark:border-white/5 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] p-8 flex flex-col items-center">
            <div className="w-full mb-6 text-center">
              <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">完善您的头像</h3>
              <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-2 font-medium">双指缩放或拖动，精准捕捉最完美的自己</p>
            </div>

            <div className="relative group">
              {/* Main Crop Container */}
              <div
                className="relative rounded-full overflow-hidden border-4 border-white dark:border-slate-800 shadow-2xl bg-slate-100 dark:bg-slate-800 touch-none cursor-move group-active:scale-[0.98] transition-transform duration-300"
                style={{ width: cropBoxSize, height: cropBoxSize }}
                onMouseDown={(e) => beginDrag(e.clientX, e.clientY)}
                onMouseMove={(e) => moveDrag(e.clientX, e.clientY)}
                onMouseUp={endDrag}
                onMouseLeave={endDrag}
                onTouchStart={(e) => {
                  if (e.touches.length >= 2) {
                    const t1 = e.touches[0];
                    const t2 = e.touches[1];
                    if (!t1 || !t2) return;
                    const midpoint = getTouchMidpoint(t1, t2);
                    pinchRef.current = {
                      active: true,
                      startDistance: getTouchDistance(t1, t2),
                      startScale: cropScale,
                      startOffsetX: cropOffset.x,
                      startOffsetY: cropOffset.y,
                      startMidX: midpoint.x,
                      startMidY: midpoint.y,
                    };
                    endDrag();
                    return;
                  }
                  const t = e.touches[0];
                  if (!t) return;
                  pinchRef.current.active = false;
                  beginDrag(t.clientX, t.clientY);
                }}
                onTouchMove={(e) => {
                  if (pinchRef.current.active && e.touches.length >= 2) {
                    const t1 = e.touches[0];
                    const t2 = e.touches[1];
                    if (!t1 || !t2) return;
                    const distance = getTouchDistance(t1, t2);
                    const ratio = pinchRef.current.startDistance > 0
                      ? distance / pinchRef.current.startDistance
                      : 1;
                    const nextScale = clampCropScale(pinchRef.current.startScale * ratio);
                    const midpoint = getTouchMidpoint(t1, t2);
                    const dx = midpoint.x - pinchRef.current.startMidX;
                    const dy = midpoint.y - pinchRef.current.startMidY;
                    setCropScale(nextScale);
                    setCropOffset(
                      clampOffset(
                        pinchRef.current.startOffsetX + dx,
                        pinchRef.current.startOffsetY + dy,
                        nextScale
                      )
                    );
                    return;
                  }
                  const t = e.touches[0];
                  if (!t) return;
                  moveDrag(t.clientX, t.clientY);
                }}
                onTouchEnd={(e) => {
                  if (pinchRef.current.active && e.touches.length === 1) {
                    const t = e.touches[0];
                    if (!t) return;
                    pinchRef.current.active = false;
                    beginDrag(t.clientX, t.clientY);
                    return;
                  }
                  if (e.touches.length === 0) {
                    pinchRef.current.active = false;
                    endDrag();
                  }
                }}
                onTouchCancel={() => {
                  pinchRef.current.active = false;
                  endDrag();
                }}
              >
                {cropSrc && (
                  <img
                    src={cropSrc}
                    alt="avatar-crop"
                    className="absolute left-1/2 top-1/2 max-w-none select-none pointer-events-none transition-opacity duration-300"
                    style={{
                      transform: `translate(calc(-50% + ${cropOffset.x}px), calc(-50% + ${cropOffset.y}px)) scale(${cropScale})`,
                      transformOrigin: 'center center',
                    }}
                    onLoad={(e) => {
                      (e.target as HTMLImageElement).style.opacity = '1';
                    }}
                    draggable={false}
                  />
                )}

                {/* Visual Guidelines Layer */}
                <div className="absolute inset-0 pointer-events-none border-[1px] border-white/20 rounded-full"></div>
              </div>
            </div>

            <div className="w-full mt-10 space-y-8">
              {/* Action Buttons */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setIsCropOpen(false);
                    setCropSrc('');
                    endDrag();
                  }}
                  className="flex-1 py-4 rounded-2xl text-[14px] font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-all active:scale-95"
                >
                  放弃修改
                </button>
                <button
                  onClick={() => { void saveAvatar(); }}
                  className="flex-[1.5] py-4 rounded-2xl text-[14px] font-bold bg-primary text-white shadow-xl shadow-primary/20 hover:shadow-primary/30 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  确认保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5">
        <div className="flex items-center justify-center h-14 px-4 relative">
          <h1 className="absolute inset-0 flex items-center justify-center text-lg font-bold tracking-tight text-slate-900 dark:text-white pointer-events-none">个人中心</h1>
        </div>
      </header>

      <main className="flex flex-col gap-4 p-4">
        {/* Profile Info Card */}
        <div
          className={`bg-white dark:bg-surface-dark rounded-2xl shadow-md border border-slate-200 dark:border-white/5 relative group overflow-hidden ${isLoggedIn ? '' : 'cursor-pointer active:scale-[0.995] transition-transform'}`}
          onClick={!isLoggedIn ? () => navigateToView(View.LOGIN, { replace: true }) : undefined}
        >
          <div className="p-4">
            <div className="flex items-center gap-4 relative z-10">
              <div className="relative shrink-0 cursor-pointer" onClick={handleAvatarClick}>
                <div
                  className="w-16 h-16 rounded-full bg-cover bg-center border-2 border-white dark:border-slate-700 shadow-sm transition-opacity hover:opacity-80"
                  style={{ backgroundImage: `url("${avatar}")` }}
                ></div>
                <div className="absolute bottom-0 right-0 bg-primary text-white p-0.5 rounded-full border border-white dark:border-surface-dark flex items-center justify-center pointer-events-none">
                  <span className="material-symbols-outlined text-[10px]">edit</span>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handleFileChange}
                />
              </div>
              <div className="flex flex-col flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 min-w-0">
                  <h2 className="text-xl font-bold truncate text-slate-900 dark:text-white">
                    {isLoggedIn ? (displayName || ' ') : '未登录'}
                  </h2>
                  <span className={`shrink-0 px-2.5 py-0.5 rounded-full text-[10px] font-black border border-current opacity-90 uppercase tracking-tight ${isLoggedIn ? (
                    userSub.tier === MembershipTier.STARTER ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300' :
                      userSub.tier === MembershipTier.PLUS ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                        userSub.tier === MembershipTier.PRO ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400' :
                          userSub.tier === MembershipTier.ULTRA ? 'bg-slate-800 dark:bg-slate-900 text-amber-400' :
                            'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  ) : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    }`}>
                    {isLoggedIn ? (userSub.tier === MembershipTier.FREE ? '免费版' : userSub.tier) : '访客'}
                  </span>
                </div>
                {isLoggedIn ? displayEmail && (
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] truncate font-medium">
                    {displayEmail}
                  </p>
                ) : (
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] truncate font-medium">
                    点击登录以继续使用完整功能
                  </p>
                )}
              </div>

              {/* Remaining Points Box */}
              <div className="shrink-0 flex flex-col items-center justify-center min-w-[64px] h-16 px-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 shadow-inner">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight mb-1 whitespace-nowrap">剩余积分</span>
                <span className="text-xl font-black text-primary dark:text-blue-400 leading-none">{isLoggedIn ? userSub.pointsRemaining : '--'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Upgrade Card - Premium Redesign */}
        {isLoggedIn && (() => {
          const getTierStyle = (tier: MembershipTier) => {
            switch (tier) {
              case MembershipTier.STARTER:
                return {
                  bg: 'bg-gradient-to-br from-slate-500 to-slate-600',
                  icon: 'rocket_launch',
                  iconColor: 'text-white',
                  title: '入门版权益已生效',
                  subtitle: '享有基础AI简历诊断与模拟面试权益',
                  titleColor: 'text-white',
                  subColor: 'text-slate-100',
                  btnStyle: 'bg-white/20 border border-white/30 text-white backdrop-blur-md',
                  shadow: 'shadow-lg shadow-slate-500/20'
                };
              case MembershipTier.PLUS:
                return {
                  bg: 'bg-gradient-to-br from-blue-600 to-blue-700',
                  icon: 'verified',
                  iconColor: 'text-white',
                  title: 'Plus 权益已生效',
                  subtitle: '尊享更高积分额度与优先分析能力',
                  titleColor: 'text-white',
                  subColor: 'text-blue-100',
                  btnStyle: 'bg-white/20 border border-white/30 text-white backdrop-blur-md',
                  shadow: 'shadow-lg shadow-blue-500/20'
                };
              case MembershipTier.PRO:
                return {
                  bg: 'bg-gradient-to-br from-indigo-600 to-indigo-700',
                  icon: 'workspace_premium',
                  iconColor: 'text-white',
                  title: 'Pro 权益已生效',
                  subtitle: '解锁PDF导出与海量AI模拟面试',
                  titleColor: 'text-white',
                  subColor: 'text-indigo-100',
                  btnStyle: 'bg-white/20 border border-white/30 text-white backdrop-blur-md',
                  shadow: 'shadow-lg shadow-indigo-500/20'
                };
              case MembershipTier.ULTRA:
                return {
                  bg: 'bg-gradient-to-br from-slate-800 to-slate-900',
                  icon: 'diamond',
                  iconColor: 'text-amber-400',
                  title: 'Ultra 尊享版权益已生效',
                  subtitle: '全能旗舰体验，无限职业可能',
                  titleColor: 'text-white',
                  subColor: 'text-white/60',
                  btnStyle: 'bg-amber-500 text-slate-900 font-bold',
                  shadow: 'shadow-xl shadow-black/30'
                };
              default: // FREE
                return {
                  bg: isDarkMode
                    ? 'bg-surface-dark border border-white/5'
                    : 'bg-white border border-slate-200',
                  icon: 'auto_awesome',
                  iconColor: 'text-primary',
                  title: '升级解锁 AI 创作力',
                  subtitle: '获取更多积分，开启智能面试与诊断',
                  titleColor: 'text-slate-900 dark:text-white',
                  subColor: 'text-slate-500 dark:text-slate-400',
                  btnStyle: 'bg-primary text-white shadow-lg shadow-primary/20',
                  shadow: 'shadow-md'
                };
            }
          };

          const style = getTierStyle(userSub.tier);

          return (
            <div
              className={`relative overflow-hidden rounded-[1.5rem] p-6 transition-all duration-500 group cursor-pointer active:scale-[0.98] ${style.bg} ${style.shadow}`}
              onClick={() => navigateToView(View.MEMBER_CENTER)}
            >
              {/* Decorative Elements - Synced with Member Center */}
              <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/10 blur-3xl animate-pulse"></div>
              <div className="absolute -left-12 -bottom-12 h-48 w-48 rounded-full bg-white/10 blur-3xl"></div>

              {/* Texture Layer */}
              <div className="absolute inset-0 opacity-[0.03] bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] mix-blend-overlay"></div>

              <div className="relative z-10 flex items-center justify-between gap-4">
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className={`size-8 rounded-full flex items-center justify-center backdrop-blur-sm border ${userSub.tier === MembershipTier.FREE
                        ? 'bg-primary/10 border-primary/10'
                        : 'bg-white/10 border-white/10'
                      }`}>
                      <span className={`material-symbols-outlined text-[18px] ${style.iconColor}`}>{style.icon}</span>
                    </div>
                    <h3 className={`${style.titleColor} text-[16px] font-black tracking-tight`}>
                      {style.title}
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className={`shrink-0 px-4 py-2 rounded-xl text-[11px] font-black transition-all group-hover:px-5 ${style.btnStyle}`}>
                    {userSub.tier === MembershipTier.FREE ? '立即升级' : '查看权益'}
                  </div>
                  <span className="material-symbols-outlined text-white/40 text-[18px] group-hover:translate-x-1 transition-transform">chevron_right</span>
                </div>
              </div>
            </div>
          );
        })()}


        {/* Menu Items - Unified Colors */}
        <div className="bg-white dark:bg-surface-dark rounded-2xl overflow-hidden shadow-md border border-slate-200 dark:border-white/5 divide-y divide-slate-100 dark:divide-white/5">
          <MenuItem
            onClick={() => handleProtectedAction(() => navigateToView(View.ALL_RESUMES))}
            icon="description"
            label="我的简历"
            color="primary"
          />
          <MenuItem
            onClick={() => handleProtectedAction(() => navigateToView(View.HISTORY))}
            icon="history"
            label="导出历史"
            color="primary"
          />
          <MenuItem
            onClick={() => handleProtectedAction(() => navigateToView(View.POINTS_HISTORY))}
            icon="receipt_long"
            label="积分明细"
            color="primary"
          />

          <MenuItem
            onClick={() => handleProtectedAction(() => navigateToView(View.ACCOUNT_SECURITY))}
            icon="verified_user"
            label="账号与安全"
            color="primary"
          />
          <MenuItem
            onClick={() => handleProtectedAction(() => navigateToView(View.SETTINGS))}
            icon="settings"
            label="设置"
            color="primary"
          />
          <MenuItem
            onClick={() => handleProtectedAction(() => setShowReferralModal(true), '该功能需要登录后使用，登录即可通过分发邀请码换取积分。是否立即去登录？')}
            icon="share"
            label="邀请好友"
            color="primary"
            badge="得积分"
          />
          <MenuItem
            onClick={() => handleProtectedAction(() => navigateToView(View.HELP))}
            icon="help_center"
            label="帮助与反馈"
            color="primary"
          />
        </div>

        <div className="flex flex-col items-center gap-2 mt-4 pb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigateToView(View.TERMS_OF_SERVICE)}
              className="text-xs text-slate-400 dark:text-slate-500 hover:text-primary transition-colors font-medium"
            >
              服务条款
            </button>
            <div className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></div>
            <button
              onClick={() => navigateToView(View.PRIVACY_POLICY)}
              className="text-xs text-slate-400 dark:text-slate-500 hover:text-primary transition-colors font-medium"
            >
              隐私政策
            </button>
          </div>
          <p className="text-xs text-slate-300 dark:text-slate-700">{APP_VERSION_CN}</p>
        </div>
      </main>
    </div>
  );
};

export default Profile;
