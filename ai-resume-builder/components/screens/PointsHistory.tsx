import React, { useEffect, useMemo, useState } from 'react';
import { DatabaseService } from '../../src/database-service';
import { useAppContext } from '../../src/app-context';

type LedgerRow = {
  id: string | number;
  delta: number;
  action: string;
  source_type?: string | null;
  source_id?: string | null;
  note?: string | null;
  balance_after?: number | null;
  created_at: string;
};

const formatTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '时间未知';
  return d.toLocaleString('zh-CN', { hour12: false });
};

const actionToLabel = (action: string) => {
  switch (String(action || '').toLowerCase()) {
    case 'analysis_consume':
      return 'AI 诊断';
    case 'interview_consume':
      return 'AI 面试';
    case 'referral_inviter_bonus':
      return '邀请奖励(邀请人)';
    case 'referral_invited_bonus':
      return '邀请奖励(被邀请人)';
    default:
      return action || '积分变动';
  }
};

const PointsHistory: React.FC = () => {
  const goBack = useAppContext((s) => s.goBack);
  const currentUser = useAppContext((s) => s.currentUser);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<LedgerRow[]>([]);

  useEffect(() => {
    const run = async () => {
      try {
        const uid = String(currentUser?.id || '').trim();
        if (!uid) {
          setRows([]);
          return;
        }
        const result = await DatabaseService.listPointsLedger(uid, 300);
        if (result.success) {
          setRows((result.data || []) as LedgerRow[]);
        } else {
          setRows([]);
        }
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [currentUser?.id]);

  const consumedRows = useMemo(
    () => rows.filter((row) => Number(row.delta) < 0),
    [rows]
  );

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark pb-24 animate-in slide-in-from-right duration-300">
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5 shrink-0">
        <div className="flex items-center px-4 h-14 relative">
          <button
            onClick={goBack}
            className="flex size-10 items-center justify-center rounded-full text-slate-900 dark:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors z-10"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>arrow_back</span>
          </button>
          <h2 className="absolute inset-0 flex items-center justify-center text-lg font-bold leading-tight tracking-[-0.015em] text-slate-900 dark:text-white pointer-events-none">
            积分明细
          </h2>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="flex flex-col items-center justify-center pt-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/5 dark:bg-primary/10 flex items-center justify-center text-primary mb-4 animate-pulse">
              <span className="material-symbols-outlined text-4xl">receipt_long</span>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">正在加载积分明细...</p>
          </div>
        )}

        {!loading && consumedRows.length === 0 && (
          <div className="flex flex-col items-center justify-center pt-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400 dark:text-slate-500 mb-4">
              <span className="material-symbols-outlined text-4xl">receipt_long</span>
            </div>
            <p className="text-slate-900 dark:text-white font-black text-lg mb-1">暂无积分扣减记录</p>
            <p className="text-slate-500 dark:text-slate-400 text-sm">后续诊断/面试扣分会显示在这里</p>
          </div>
        )}

        {!loading && consumedRows.length > 0 && (
          <div className="bg-white dark:bg-surface-dark rounded-2xl overflow-hidden shadow-md border border-slate-200 dark:border-white/5 divide-y divide-slate-100 dark:divide-white/5">
            {consumedRows.map((row) => (
              <div key={String(row.id)} className="px-4 py-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {actionToLabel(row.action)}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    {row.note || '积分扣减'}
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                    {formatTime(row.created_at)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-base font-black text-rose-500">
                    {Number(row.delta)}
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    余额 {Number(row.balance_after ?? 0)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default PointsHistory;

