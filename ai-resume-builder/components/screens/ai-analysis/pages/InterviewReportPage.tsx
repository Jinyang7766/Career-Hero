import React from 'react';
import AiDisclaimer from '../AiDisclaimer';
import BackButton from '../../../shared/BackButton';
import { useAppStore } from '../../../../src/app-store';
import { recordResumeExportHistory } from '../../../../src/export-history';

type Props = {
  summary: string;
  score: number;
  advice: string[];
  onBack: () => void;
};

type SummaryBlock = {
  title: string;
  body: string;
};

const estimateDataUrlBytes = (dataUrl: string) => {
  const base64 = String(dataUrl || '').split(',')[1] || '';
  if (!base64) return 0;
  const padding = (base64.match(/=*$/)?.[0].length || 0);
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
};

const downloadDataUrl = (dataUrl: string, filename: string) => {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return estimateDataUrlBytes(dataUrl);
};

const downloadCanvasWithChunking = (canvas: HTMLCanvasElement, baseName: string) => {
  const exported: Array<{ filename: string; size: number }> = [];
  const MAX_SAFE_HEIGHT = 14000;
  if (canvas.height <= MAX_SAFE_HEIGHT) {
    const filename = `${baseName}.png`;
    const size = downloadDataUrl(canvas.toDataURL('image/png', 1.0), filename);
    exported.push({ filename, size });
    return exported;
  }

  const parts = Math.ceil(canvas.height / MAX_SAFE_HEIGHT);
  for (let i = 0; i < parts; i += 1) {
    const y = i * MAX_SAFE_HEIGHT;
    const h = Math.min(MAX_SAFE_HEIGHT, canvas.height - y);
    const piece = document.createElement('canvas');
    piece.width = canvas.width;
    piece.height = h;
    const ctx = piece.getContext('2d');
    if (!ctx) continue;
    ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, piece.width, piece.height);
    const filename = `${baseName}-part${i + 1}.png`;
    const size = downloadDataUrl(piece.toDataURL('image/png', 1.0), filename);
    exported.push({ filename, size });
  }
  return exported;
};

const cleanMarkdownText = (input: string) => {
  let text = String(input || '');
  text = text.replace(/\r\n/g, '\n');
  text = text.replace(/```[\s\S]*?```/g, '');
  text = text.replace(/^[ \t]*#{1,6}[ \t]*/gm, '');
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/`([^`]+)`/g, '$1');
  text = text.replace(/\[(.*?)\]\((.*?)\)/g, '$1');
  text = text.replace(/^[ \t]*[-*][ \t]+/gm, '');
  text = text.replace(/[ \t]{2,}/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
};

const normalizeBlockBody = (text: string) =>
  String(text || '')
    .replace(/^[：:\-\s]+/, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

const parseSummaryBlocks = (rawSummary: string): SummaryBlock[] => {
  const cleaned = cleanMarkdownText(rawSummary);
  if (!cleaned) return [];

  const lines = cleaned
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const headingRe = /^(?:第?[一二三四五六七八九十\d]+[、.)：:]?\s*)?(综合评价|总体评价|表现亮点|主要问题|优化建议|改进建议|后续计划|总结|评估结论)\s*[：:]?\s*(.*)$/;
  const blocks: SummaryBlock[] = [];
  let currentTitle = '';
  let currentBody: string[] = [];

  const flush = () => {
    const body = normalizeBlockBody(currentBody.join(' ').trim());
    if (!body) return;
    blocks.push({
      title: currentTitle || `综合反馈${blocks.length + 1}`,
      body,
    });
  };

  for (const line of lines) {
    const normalizedLine = line.replace(/^#{1,6}\s*/, '').trim();
    const hit = normalizedLine.match(headingRe);
    if (hit) {
      if (currentBody.length > 0) flush();
      currentTitle = String(hit[1] || '').trim();
      currentBody = [];
      const trailing = String(hit[2] || '').trim();
      if (trailing) currentBody.push(trailing);
      continue;
    }
    currentBody.push(normalizedLine);
  }
  if (currentBody.length > 0) flush();

  if (blocks.length >= 2) return blocks;

  const paragraphs = cleaned
    .split(/\n{2,}/)
    .map((p) => normalizeBlockBody(p))
    .filter(Boolean);
  if (paragraphs.length >= 2) {
    return paragraphs.map((p, i) => ({
      title: ['综合评价', '表现亮点', '改进建议', '后续建议'][i] || `综合反馈${i + 1}`,
      body: p,
    }));
  }

  const sentences = cleaned
    .split(/(?<=[。！？!?；;])/)
    .map((s) => normalizeBlockBody(s))
    .filter(Boolean);
  if (sentences.length <= 1) {
    return [{ title: '综合评价', body: cleaned }];
  }

  const perGroup = Math.max(1, Math.ceil(sentences.length / 3));
  const grouped: SummaryBlock[] = [];
  for (let i = 0; i < sentences.length; i += perGroup) {
    grouped.push({
      title: ['综合评价', '表现亮点', '改进建议'][grouped.length] || `综合反馈${grouped.length + 1}`,
      body: sentences.slice(i, i + perGroup).join(''),
    });
  }
  return grouped;
};

const InterviewReportPage: React.FC<Props> = ({ summary, score, advice, onBack }) => {
  const resumeData = useAppStore((state) => state.resumeData);
  const reportRef = React.useRef<HTMLDivElement | null>(null);
  const [isExporting, setIsExporting] = React.useState(false);
  const summaryBlocks = React.useMemo(
    () => parseSummaryBlocks(String(summary || '').trim()),
    [summary]
  );

  const handleSaveImage = async () => {
    if (!reportRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const mod: any = await import('html2pdf.js');
      const html2pdf = mod?.default || mod;
      const node = reportRef.current;
      const worker = html2pdf()
        .set({
          margin: 0,
          filename: `面试报告-${Date.now()}.pdf`,
          image: { type: 'png', quality: 1 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            scrollY: 0,
            windowWidth: node.scrollWidth,
            windowHeight: node.scrollHeight,
            backgroundColor: '#ffffff',
          },
          jsPDF: { unit: 'px', format: [node.scrollWidth, node.scrollHeight], orientation: 'portrait' },
        })
        .from(node)
        .toCanvas();

      const canvas = await worker.get('canvas');
      const exports = downloadCanvasWithChunking(canvas, `面试报告-${Date.now()}`);
      for (const item of exports) {
        await recordResumeExportHistory(resumeData as any, {
          filename: item.filename,
          size: item.size,
          type: 'IMAGE',
        });
      }
    } catch (err) {
      console.error('Failed to export interview report image:', err);
      // alert replaced by toast fallback via window.alert if needed
      window.alert('保存图片失败，请稍后重试');
    } finally {
      setIsExporting(false);
    }
  };

  const scoreNum = Math.round(score || 0);

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark animate-in fade-in duration-500">
      <header className="sticky top-0 z-40 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-white/5">
        <div className="flex items-center justify-between h-14 px-4 relative">
          <BackButton onClick={onBack} className="-ml-2 size-9" iconClassName="text-[22px]" />
          <h1 className="text-base font-black tracking-tight text-slate-900 dark:text-white">面试深度反馈</h1>
          <div className="w-10"></div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] space-y-6">
        <div ref={reportRef} className="space-y-6">
          {/* Score Card */}
          <div className="relative overflow-hidden bg-white dark:bg-[#1c2936] rounded-[28px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 dark:border-white/5 group">
            <div className="absolute top-0 right-0 -mr-8 -mt-8 size-48 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors duration-700" />

            <div className="relative z-10 flex flex-col items-center text-center">
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4">综合评估得分</span>
              <div className="flex items-baseline gap-1">
                <span className="text-[72px] font-black tracking-tighter text-primary dark:text-blue-400 leading-none drop-shadow-sm">
                  {scoreNum}
                </span>
                <span className="text-xl font-bold text-slate-300 dark:text-slate-600 tracking-tight">/ 100</span>
              </div>
              <div className="mt-6 flex items-center gap-2 px-3 py-1 bg-primary/5 dark:bg-primary/10 rounded-full border border-primary/10">
                <div className={`size-1.5 rounded-full ${scoreNum >= 80 ? 'bg-emerald-500' : scoreNum >= 60 ? 'bg-amber-500' : 'bg-rose-500'} animate-pulse`} />
                <span className="text-[11px] font-black text-primary dark:text-blue-400 uppercase tracking-wider">
                  {scoreNum >= 90 ? '卓越表现' : scoreNum >= 80 ? '优秀表现' : scoreNum >= 70 ? '良好表现' : scoreNum >= 60 ? '及格表现' : '仍需努力'}
                </span>
              </div>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="space-y-3">
            <div className="flex items-center gap-2.5 px-1">
              <div className="size-8 rounded-xl bg-primary/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px] text-primary">analytics</span>
              </div>
              <h3 className="font-black text-slate-900 dark:text-white text-base tracking-tight">
                综合评价总结
              </h3>
            </div>
            {(summaryBlocks.length > 0 ? summaryBlocks : [{
              title: '综合评价',
              body: '面试已结束，本次深度总结分析当前不可用，请稍后再试。',
            }]).map((block, idx) => (
              <div key={`${block.title}-${idx}`} className="bg-gradient-to-br from-blue-600 to-primary rounded-[24px] p-1 shadow-lg shadow-primary/15">
                <div className="bg-white/95 dark:bg-[#1c2936]/95 backdrop-blur-sm rounded-[23px] px-5 py-4">
                  <h4 className="text-[15px] font-black text-slate-900 dark:text-white mb-2">
                    {block.title}
                  </h4>
                  <p className="text-[14px] text-slate-600 dark:text-slate-300 leading-relaxed font-medium whitespace-pre-wrap">
                    {block.body}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Advice Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-black text-slate-900 dark:text-white tracking-widest uppercase">核心改进建议</h3>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">针对性提升指南</span>
            </div>

            <div className="grid gap-3">
              {(advice && advice.length > 0 ? advice.slice(0, 8) : [
                '建议围绕岗位要求补充案例细节、决策过程与量化结果。',
                '加强对个人职业价值观的表达，体现长期稳定性。',
                '对过往失败经历进行更深度的复盘总结。'
              ]).map((item, idx) => (
                <div
                  key={`${idx}-${item}`}
                  className="flex items-start gap-3.5 bg-white dark:bg-[#1c2936] p-4 rounded-2xl border border-slate-100 dark:border-white/5 shadow-sm hover:shadow-md transition-shadow duration-300"
                >
                  <div className="shrink-0 mt-0.5 size-6 rounded-lg bg-slate-50 dark:bg-white/5 flex items-center justify-center text-[11px] font-black text-slate-400 border border-slate-100 dark:border-white/10 italic">
                    {idx + 1}
                  </div>
                  <p className="text-[13px] font-bold text-slate-700 dark:text-slate-200 leading-[1.6]">
                    {item}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Global Action */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => { void handleSaveImage(); }}
            disabled={isExporting}
            className={`group w-full py-3 rounded-xl bg-primary text-white text-sm font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-600 active:scale-[0.98] transition-all flex items-center justify-center gap-2 ${isExporting ? 'opacity-70 cursor-not-allowed shadow-none' : ''}`}
          >
            <div className="flex items-center justify-center gap-2">
              {isExporting ? (
                <>
                  <span className="size-4 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
                  <span>报告生成中...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[20px] transition-transform group-hover:translate-y-[-2px]">download</span>
                  <span>保存面试报告图片</span>
                </>
              )}
            </div>
          </button>
          <p className="mt-3 text-[10px] text-center text-slate-400 dark:text-slate-500 font-bold opacity-60">报告将保存至您的本地相册</p>
        </div>

        <AiDisclaimer className="pt-4 opacity-60" />
      </main>
    </div>
  );
};

export default InterviewReportPage;
