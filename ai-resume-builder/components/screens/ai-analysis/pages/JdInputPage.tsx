import React from 'react';
import type { ResumeData, ResumeSummary } from '../../../../types';

export type ResumeReadState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
};

export type JdInputPageProps = {
  allResumes: ResumeSummary[] | undefined;
  selectedResumeId: any;
  isSameResumeId: (a: any, b: any) => boolean;
  resumeData: ResumeData;
  resumeReadState: ResumeReadState;

  targetCompany: string;
  setTargetCompany: (v: string) => void;
  jdText: string;
  setJdText: (v: string) => void;

  isUploading: boolean;
  onScreenshotUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;

  onBack: () => void;
  onPrev: () => void;
  onStart: (interviewType?: string) => void;

  showJdEmptyModal: boolean;
  setShowJdEmptyModal: (v: boolean) => void;
  startAnalysis: (interviewType?: string) => void;
  isInterviewMode?: boolean;
};

const JdInputPage: React.FC<JdInputPageProps> = ({
  allResumes,
  selectedResumeId,
  isSameResumeId,
  resumeData,
  resumeReadState,
  targetCompany,
  setTargetCompany,
  jdText,
  setJdText,
  isUploading,
  onScreenshotUpload,
  onBack,
  onPrev,
  onStart,
  showJdEmptyModal,
  setShowJdEmptyModal,
  startAnalysis,
  isInterviewMode,
}) => {
  const [interviewType, setInterviewType] = React.useState('general');

  const selectedResumeLabel = (() => {
    const selected = (allResumes || []).find((item) => isSameResumeId(item.id, selectedResumeId));
    if (selected?.title) return selected.title;
    if (resumeData?.resumeTitle) return resumeData.resumeTitle;
    const name = (resumeData?.personalInfo?.name || '').trim();
    if (name) return `${name}的简历`;
    return '无';
  })();

  const statusTone = (() => {
    if (resumeReadState.status === 'success') {
      return {
        bg: 'bg-emerald-50/50 dark:bg-emerald-500/5',
        border: 'border-emerald-100 dark:border-emerald-500/20',
        text: 'text-emerald-700 dark:text-emerald-400',
        icon: 'check_circle',
        badge: '已就绪'
      };
    }
    if (resumeReadState.status === 'loading') {
      return {
        bg: 'bg-blue-50/50 dark:bg-blue-500/5',
        border: 'border-blue-100 dark:border-blue-500/20',
        text: 'text-blue-700 dark:text-blue-400',
        icon: 'sync',
        badge: '读取中'
      };
    }
    if (resumeReadState.status === 'error') {
      return {
        bg: 'bg-rose-50/50 dark:bg-rose-500/5',
        border: 'border-rose-100 dark:border-rose-500/20',
        text: 'text-rose-700 dark:text-rose-400',
        icon: 'error',
        badge: '读取失败'
      };
    }
    return {
      bg: 'bg-slate-50/50 dark:bg-slate-500/5',
      border: 'border-slate-100 dark:border-slate-500/20',
      text: 'text-slate-600 dark:text-slate-400',
      icon: 'info',
      badge: '初始化'
    };
  })();

  const statusMessage =
    resumeReadState.status === 'idle'
      ? `尚未读取简历，请先返回上一步选择简历`
      : resumeReadState.message;

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark animate-in slide-in-from-right duration-300">
      <header className="sticky top-0 z-50 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-slate-200 dark:border-white/5">
        <div className="flex items-center justify-between h-14 px-4 relative">
          <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 text-slate-900 dark:text-white" type="button">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="text-lg font-bold tracking-tight">
            {isInterviewMode ? '设置面试岗位' : '添加职位描述'}
          </h1>
          <div className="w-8" />
        </div>
      </header>

      <main className="p-4 flex flex-col gap-6">
        <div className={`p-4 rounded-2xl border transition-all duration-300 ${statusTone.bg} ${statusTone.border} shadow-sm`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`size-10 rounded-full flex items-center justify-center ${statusTone.bg} ${statusTone.border}`}>
                <span className={`material-symbols-outlined ${statusTone.text}`}>description</span>
              </div>
              <div className="flex flex-col">
                <h4 className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">{isInterviewMode ? '面试简历' : '当前分析简历'}</h4>
                <p className="text-sm font-black text-slate-900 dark:text-white mt-0.5 line-clamp-1">{selectedResumeLabel}</p>
              </div>
            </div>
            <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 shrink-0 ${statusTone.bg} ${statusTone.border} ${statusTone.text}`}>
              <span className={`material-symbols-outlined text-[14px] ${resumeReadState.status === 'loading' ? 'animate-spin' : ''}`}>{statusTone.icon}</span>
              <span className="whitespace-nowrap">{statusTone.badge}</span>
            </div>
          </div>
          {resumeReadState.status !== 'success' && (
            <p className={`mt-3 text-xs leading-relaxed ${statusTone.text}`}>
              {statusMessage}
            </p>
          )}
        </div>

        <div className="bg-white dark:bg-surface-dark p-5 rounded-2xl shadow-md border border-slate-200 dark:border-white/5">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-primary">{isInterviewMode ? 'forum' : 'description'}</span>
            <h3 className="font-bold text-slate-900 dark:text-white">{isInterviewMode ? '面试场景设置' : '职位描述 (JD)'}</h3>
          </div>

          {isInterviewMode && (
            <div className="mb-4">
              <label className="text-xs font-bold text-slate-600 dark:text-text-secondary uppercase tracking-wider">面试类型</label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {[
                  { id: 'general', label: '初试-基础面', icon: 'person' },
                  { id: 'technical', label: '复试-项目深挖', icon: 'code' },
                  { id: 'hr', label: 'HR面-文化匹配', icon: 'groups' }
                ].map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setInterviewType(type.id)}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${interviewType === type.id
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-slate-50 dark:bg-white/5 border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10'
                      }`}
                    type="button"
                  >
                    <span className="material-symbols-outlined mb-1">{type.icon}</span>
                    <span className="text-xs font-bold">{type.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mb-3">
            <label className="text-xs font-bold text-slate-600 dark:text-text-secondary uppercase tracking-wider">{isInterviewMode ? '目标公司 / 岗位' : '目标公司（可选）'}</label>
            <input
              value={targetCompany}
              onChange={(e) => setTargetCompany(e.target.value)}
              placeholder="例如：字节跳动 / 腾讯"
              className="mt-2 w-full rounded-xl bg-white dark:bg-[#111a22] border border-slate-300 dark:border-[#324d67] p-3 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all text-sm shadow-sm"
              type="text"
            />
          </div>
          <div className="mb-3">
            <label className="text-xs font-bold text-slate-600 dark:text-text-secondary uppercase tracking-wider">JD内容</label>
            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder={isInterviewMode ? "请输入目标岗位的 JD 内容，AI 将基于此进行针对性的模拟面试提问..." : "请粘贴目标职位的 JD 内容，AI 将为您进行针对性的人岗匹配分析..."}
              className="mt-2 w-full h-40 rounded-xl bg-white dark:bg-[#111a22] border border-slate-300 dark:border-transparent p-4 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-primary outline-none resize-none text-sm leading-relaxed shadow-sm"
              maxLength={1000}
            />
          </div>

          <div className="mt-3">
            <button
              onClick={() => !isUploading && document.getElementById('jd-screenshot-upload')?.click()}
              disabled={isUploading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-[#111a22] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
              type="button"
            >
              {isUploading ? (
                <span className="size-4 border-2 border-slate-400 border-t-primary rounded-full animate-spin" />
              ) : (
                <span className="material-symbols-outlined text-[20px]">image</span>
              )}
              <span className="text-sm">{isUploading ? '正在解析...' : '上传JD截图'}</span>
            </button>
            <input
              type="file"
              id="jd-screenshot-upload"
              accept="image/*"
              onChange={onScreenshotUpload}
              className="hidden"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-2">
          <button
            onClick={onPrev}
            className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 text-sm font-bold hover:bg-slate-50 dark:hover:bg-white/5 active:scale-[0.98] transition-all"
            type="button"
          >
            上一步
          </button>
          <button
            onClick={() => onStart(interviewType)}
            className="flex-[2] py-3 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-600 active:scale-[0.98] transition-all"
            type="button"
          >
            {isInterviewMode ? '开始模拟面试' : '开始分析'}
          </button>
        </div>

        {showJdEmptyModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm px-6">
            <div className="w-full max-w-sm rounded-[32px] bg-red-500/90 backdrop-blur-xl border border-red-400/30 shadow-2xl p-8 text-white animate-in zoom-in-95 duration-200">
              <div className="flex flex-col items-center text-center gap-4">
                <div className="size-16 rounded-full bg-white/20 flex items-center justify-center mb-2">
                  <span className="material-symbols-outlined text-white text-[32px]">warning</span>
                </div>
                <p className="text-base text-white/95 leading-relaxed font-bold px-2">
                  {isInterviewMode ? '您未填写 JD，无法生成针对性的模拟面试题。是否坚持继续通用面试？' : '您未填写 JD，无法进行岗位定向匹配。是否坚持继续通用分析？'}
                </p>
              </div>
              <div className="mt-8 flex flex-col gap-3">
                <button
                  onClick={() => {
                    setShowJdEmptyModal(false);
                    startAnalysis(interviewType);
                  }}
                  className="w-full rounded-2xl bg-white text-red-600 py-3.5 font-bold hover:bg-white/90 active:scale-[0.98] transition-all shadow-lg"
                  type="button"
                >
                  {isInterviewMode ? '坚持进入面试' : '坚持继续分析'}
                </button>
                <button
                  onClick={() => setShowJdEmptyModal(false)}
                  className="w-full rounded-2xl bg-black/20 text-white/90 py-3.5 font-bold hover:bg-black/30 active:scale-[0.98] transition-all border border-white/10"
                  type="button"
                >
                  返回填写 JD
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default JdInputPage;

