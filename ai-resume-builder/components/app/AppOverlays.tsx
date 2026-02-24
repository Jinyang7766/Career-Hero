import React from 'react';

type ToastState = {
  type: 'success' | 'error' | 'info';
  msg: string;
} | null;

type ConfirmState = {
  message: string;
  resolve: (confirmed: boolean) => void;
} | null;

type AppOverlaysProps = {
  toast: ToastState;
  confirmState: ConfirmState;
  setConfirmState: (state: ConfirmState) => void;
};

const toastStyles = {
  success: {
    bg: 'bg-emerald-500/90 dark:bg-emerald-600/90',
    border: 'border-emerald-400/30',
    shadow: 'shadow-emerald-500/20',
    icon: 'check_circle',
  },
  error: {
    bg: 'bg-rose-500/90 dark:bg-rose-600/90',
    border: 'border-rose-400/30',
    shadow: 'shadow-rose-500/20',
    icon: 'error',
  },
  info: {
    bg: 'bg-slate-800/90 dark:bg-slate-700/90',
    border: 'border-slate-600/30',
    shadow: 'shadow-slate-900/20',
    icon: 'info',
  },
} as const;

const ToastOverlay: React.FC<{ toast: ToastState }> = ({ toast }) => {
  if (!toast) return null;
  const style = toastStyles[toast.type] || toastStyles.info;
  return (
    <div className="fixed inset-x-0 top-6 z-[9999] flex justify-center px-4 pointer-events-none">
      <div className={`pointer-events-auto flex items-center gap-3 rounded-2xl shadow-2xl backdrop-blur-xl border ${style.bg} ${style.border} ${style.shadow} px-5 py-3 animate-in slide-in-from-top-4 fade-in duration-300 max-w-[90%]`}>
        <span className="material-symbols-outlined text-white text-[20px] shrink-0">{style.icon}</span>
        <div className="text-[14px] font-bold text-white leading-tight">{toast.msg}</div>
      </div>
    </div>
  );
};

const ConfirmModal: React.FC<{
  confirmState: ConfirmState;
  setConfirmState: (state: ConfirmState) => void;
}> = ({ confirmState, setConfirmState }) => {
  if (!confirmState) return null;
  const isDelete = /(确定要(删除|解绑|退出|注销|移除|清理|重置|清除|重新诊断|清空)|^(删除|解绑|注销|退出|移除|清空|重置|清除|重新诊断)\?|重新诊断|清空)/.test(confirmState.message);

  const onCancel = () => {
    confirmState.resolve(false);
    setConfirmState(null);
  };

  const onOk = () => {
    confirmState.resolve(true);
    setConfirmState(null);
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 sm:p-4">
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-sm bg-white dark:bg-[#1c2936] rounded-[28px] shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden border border-slate-100 dark:border-white/5 animate-in zoom-in-95 fade-in duration-300">
        <div className="p-8 pb-6">
          <div className="flex flex-col items-center text-center">
            <div className={`size-16 rounded-3xl ${isDelete ? 'bg-rose-50 dark:bg-rose-500/10' : 'bg-primary/5 dark:bg-primary/10'} flex items-center justify-center mb-6 rotate-3 transform transition-transform hover:rotate-0 duration-300`}>
              <span className={`material-symbols-outlined ${isDelete ? 'text-rose-500' : 'text-primary'} text-[36px]`}>
                {isDelete ? 'delete_forever' : 'help'}
              </span>
            </div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-3 tracking-tight">
              {isDelete ? '确认操作？' : '提示'}
            </h3>
            <p className="text-[15px] font-medium text-slate-500 dark:text-slate-400 leading-relaxed px-2">
              {confirmState.message}
            </p>
          </div>
        </div>
        <div className="p-6 pt-0 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 h-12 rounded-2xl text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-all active:scale-95"
          >
            取消
          </button>
          <button
            onClick={onOk}
            className={`flex-1 h-12 rounded-2xl text-sm font-bold text-white shadow-lg active:scale-95 transition-all
              ${isDelete
                ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/25'
                : 'bg-primary hover:bg-blue-600 shadow-primary/25'}`}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
};

const AppOverlays: React.FC<AppOverlaysProps> = ({
  toast,
  confirmState,
  setConfirmState,
}) => (
  <>
    <ToastOverlay toast={toast} />
    <ConfirmModal confirmState={confirmState} setConfirmState={setConfirmState} />
  </>
);

export default AppOverlays;
