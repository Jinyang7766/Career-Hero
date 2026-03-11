import React, { useEffect, useMemo, useState } from 'react';
import { DatabaseService } from '../../src/database-service';
import { useAppContext } from '../../src/app-context';
import { useUserProfile } from '../../src/useUserProfile';
import BackButton from '../shared/BackButton';

type LedgerRow = {
  id: string | number;
  delta: number;
  action: string;
  source_type?: string | null;
  source_id?: string | null;
  note?: string | null;
  metadata?: any;
  balance_after?: number | null;
  created_at: string;
};

const actionToInfo = (action: string) => {
  const act = String(action || '').toLowerCase();
  switch (act) {
    case 'analysis_consume':
      return { label: 'AI 诊断报告', icon: 'assessment', color: 'rose' };
    case 'analysis_refund':
      return { label: '诊断退还', icon: 'refresh', color: 'emerald' };
    case 'interview_consume':
      return { label: 'AI 面试', icon: 'forum', color: 'rose' };
    case 'interview_refund':
      return { label: '面试退还', icon: 'refresh', color: 'emerald' };
    case 'final_report_consume':
      return { label: '最终报告', icon: 'description', color: 'rose' };
    case 'final_report_refund':
      return { label: '最终报告退还', icon: 'refresh', color: 'emerald' };
    case 'referral_inviter_bonus':
      return { label: '邀请奖励', icon: 'redeem', color: 'emerald' };
    case 'referral_invited_bonus':
      return { label: '注册礼包', icon: 'card_giftcard', color: 'emerald' };
    case 'manual_adjust':
      return { label: '后台调整', icon: 'blue' };
    default:
      if (act.includes('bonus')) return { label: '系统奖励', icon: 'stars', color: 'emerald' };
      if (act.includes('refund')) return { label: '积分退还', icon: 'refresh', color: 'emerald' };
      if (act.includes('consume')) return { label: '积分消费', icon: 'shopping_cart', color: 'rose' };
      return { label: action || '积分变动', icon: 'receipt_long', color: 'slate' };
  }
};

const resolveLedgerDisplayTexts = (row: LedgerRow, fallbackLabel: string, fallbackSubtitle: string) => {
  const act = String(row?.action || '').toLowerCase();
  const diagnosisStepByAction: Record<string, string> = {
    analysis_consume: '诊断报告',
    final_report_consume: '最终报告',
    analysis_refund: '诊断报告（退还）',
    final_report_refund: '最终报告（退还）',
  };
  const diagnosisStep = diagnosisStepByAction[act];
  if (diagnosisStep) {
    return {
      title: 'AI诊断',
      subtitle: diagnosisStep,
    };
  }
  return { title: fallbackLabel, subtitle: fallbackSubtitle };
};

const PointsHistory: React.FC = () => {
  const goBack = useAppContext((s) => s.goBack);
  const currentUser = useAppContext((s) => s.currentUser);
  const { userProfile } = useUserProfile(currentUser?.id, currentUser);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'gain' | 'loss'>('all');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

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

  const filteredRows = useMemo(() => {
    if (activeTab === 'all') return rows;
    if (activeTab === 'gain') return rows.filter(r => Number(r.delta) > 0);
    if (activeTab === 'loss') return rows.filter(r => Number(r.delta) < 0);
    return rows;
  }, [rows, activeTab]);

  const displayPoints = useMemo(() => {
    const latestBalance = rows.find((row) => row.balance_after != null && Number.isFinite(Number(row.balance_after)));
    if (latestBalance && latestBalance.balance_after != null) {
      return Number(latestBalance.balance_after);
    }
    const profilePoints = Number((userProfile as any)?.points_balance);
    if (Number.isFinite(profilePoints)) return profilePoints;
    const legacyPoints = Number((currentUser as any)?.points);
    return Number.isFinite(legacyPoints) ? legacyPoints : 0;
  }, [rows, userProfile, currentUser]);

  const formatDateLabel = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '较早之前';
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const sameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();

    if (sameDay(d, today)) return '今天';
    if (sameDay(d, yesterday)) return '昨天';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const grouped = useMemo(() => {
    return filteredRows.reduce<Record<string, LedgerRow[]>>((acc, item) => {
      const label = formatDateLabel(item.created_at);
      acc[label] = acc[label] || [];
      acc[label].push(item);
      return acc;
    }, {});
  }, [filteredRows]);

  const toggleSection = (label: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [label]: !prev[label]
    }));
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950 pb-24 animate-in slide-in-from-right duration-300">
      <header className="fixed top-0 left-0 right-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5 mx-auto w-full max-w-md">
        <div className="flex items-center px-4 h-14 relative">
          <BackButton onClick={goBack} className="z-10" />
          <h2 className="absolute inset-0 flex items-center justify-center text-lg font-bold leading-tight tracking-[-0.015em] text-slate-900 dark:text-white pointer-events-none">
            积分明细
          </h2>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pt-20">
        {/* 积分余额卡片 */}
        <div className="px-4">
          <div className="bg-gradient-to-br from-primary via-blue-600 to-indigo-700 rounded-3xl p-6 mb-8 shadow-xl shadow-primary/30 text-white relative overflow-hidden group">
            <div className="relative z-10 flex justify-between items-start gap-4">
              <div className="min-w-0">
                <p className="text-white/70 text-sm font-medium mb-1">当前可用积分</p>
                <div className="flex items-baseline gap-x-2 gap-y-1 flex-wrap">
                  <h1 className="text-4xl sm:text-5xl font-black tracking-tight drop-shadow-sm truncate">
                    {displayPoints}
                  </h1>
                  <span className="text-white/60 text-xs sm:text-sm font-bold uppercase tracking-wider shrink-0">
                    Credits
                  </span>
                </div>
              </div>
              <div className="shrink-0 size-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
                <span className="material-symbols-outlined text-white text-3xl">account_balance_wallet</span>
              </div>
            </div>

            <div className="mt-4 flex gap-4">
              <div className="px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-[10px] font-bold">
                永久有效
              </div>
              <div className="px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-[10px] font-bold">
                实时结算
              </div>
            </div>

            {/* 装饰性背景 */}
            <div className="absolute top-0 right-0 -mr-12 -mt-12 size-48 rounded-full bg-white/10 blur-[64px] group-hover:scale-110 transition-transform duration-700"></div>
            <div className="absolute bottom-0 left-0 -ml-12 -mb-12 size-48 rounded-full bg-blue-400/20 blur-[64px] group-hover:scale-110 transition-transform duration-700 delay-100"></div>
          </div>
        </div>

        {/* 标签切换 */}
        <div className="px-4">
          <div className="flex p-1 bg-slate-200/50 dark:bg-white/5 rounded-2xl mb-6 backdrop-blur-sm border border-slate-100 dark:border-white/5">
            {([
              { id: 'all', label: '全部' },
              { id: 'gain', label: '收入' },
              { id: 'loss', label: '支出' }
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all duration-300 ${activeTab === tab.id
                  ? 'bg-white dark:bg-slate-800 text-primary dark:text-blue-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-10 h-10 rounded-full border-[3px] border-slate-200 border-t-primary animate-spin mb-4"></div>
            <p className="text-slate-500 dark:text-slate-400 text-sm font-semibold tracking-tight">正在加载数据...</p>
          </div>
        )}

        {!loading && filteredRows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in zoom-in duration-500">
            <div className="w-16 h-16 rounded-2xl bg-white dark:bg-white/5 shadow-sm flex items-center justify-center text-slate-300 dark:text-slate-600 mb-6 border border-slate-100 dark:border-white/5">
              <span className="material-symbols-outlined text-4xl">receipt_long</span>
            </div>
            <p className="text-slate-900 dark:text-white font-bold text-lg mb-1">暂无明细记录</p>
            <p className="text-slate-500 dark:text-slate-400 text-sm max-w-[200px] leading-relaxed px-4">
              这里还没有记录呢，快去试试 AI 优化或邀请好友吧
            </p>
          </div>
        )}

        {!loading && filteredRows.length > 0 && Object.entries(grouped).map(([label, group]) => {
          const isCollapsed = !!collapsedSections[label];
          return (
            <div key={label} className="flex flex-col mb-6">
              <button
                onClick={() => toggleSection(label)}
                className="w-full flex items-center justify-between px-4 py-2 group"
              >
                <h3 className="ml-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">{label}</h3>
                <span className="material-symbols-outlined text-[18px] text-slate-300 dark:text-slate-600 transition-transform duration-300 mr-4" style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'none' }}>
                  expand_more
                </span>
              </button>

              {!isCollapsed && (
                <div className="px-4 mt-1">
                  <div className="bg-white dark:bg-surface-dark rounded-2xl overflow-hidden shadow-md border border-slate-200 dark:border-white/5 divide-y divide-slate-100 dark:divide-white/5">
                    {group.map((row) => {
                      const info = actionToInfo(row.action);
                      const isGain = Number(row.delta) > 0;
                      const fallbackSubtitle = row.note || (isGain ? '积分发放' : '积分扣减');
                      const display = resolveLedgerDisplayTexts(row, info.label, fallbackSubtitle);
                      return (
                        <div
                          key={String(row.id)}
                          className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-slate-50 dark:hover:bg-white/5 group/item"
                        >
                          <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-colors
                            ${isGain ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600' : 'bg-rose-50 dark:bg-rose-500/10 text-rose-600'}
                          `}>
                            <span className="material-symbols-outlined text-[20px]">{info.icon}</span>
                          </div>

                          <div className="flex flex-col flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-bold text-slate-900 dark:text-white truncate leading-tight">
                                {display.title}
                              </p>
                              <p className={`text-base font-black tracking-tight ${isGain ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {isGain ? `+${row.delta}` : row.delta}
                              </p>
                            </div>
                            <div className="flex items-center justify-between mt-1.5">
                              <p className="text-[12px] text-slate-500 dark:text-slate-500 font-medium truncate opacity-80 leading-normal">
                                {display.subtitle}
                              </p>
                              <div className="flex items-center gap-2 shrink-0">
                                {row.balance_after != null && Number.isFinite(Number(row.balance_after)) && (
                                  <div className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-white/10 text-[9px] font-bold text-slate-400 dark:text-slate-500">
                                    余额 {row.balance_after}
                                  </div>
                                )}
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium italic">
                                  {new Date(row.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </main>
    </div>
  );
};

export default PointsHistory;
