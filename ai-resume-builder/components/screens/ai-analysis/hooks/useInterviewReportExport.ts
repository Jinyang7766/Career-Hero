import React from 'react';
import { recordResumeExportHistory } from '../../../../src/export-history';

export const EXPORT_WATERMARK_TEXT = '本面试报告由Career Hero生成';

const downloadBlob = (blob: Blob, filename: string) => {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
  return Number(blob.size || 0);
};

const canvasToPngBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('canvas_to_blob_failed'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });

const waitWithTimeout = async (task: Promise<any>, timeoutMs: number) => {
  let timer: number | undefined;
  try {
    await Promise.race([
      task,
      new Promise((resolve) => {
        timer = window.setTimeout(resolve, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) window.clearTimeout(timer);
  }
};

const downloadCanvasWithChunking = async (canvas: HTMLCanvasElement, baseName: string) => {
  const exported: Array<{ filename: string; size: number }> = [];
  const MAX_SAFE_HEIGHT = 14000;
  if (canvas.height <= MAX_SAFE_HEIGHT) {
    const filename = `${baseName}.png`;
    const blob = await canvasToPngBlob(canvas);
    const size = downloadBlob(blob, filename);
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
    const blob = await canvasToPngBlob(piece);
    const size = downloadBlob(blob, filename);
    exported.push({ filename, size });
  }
  return exported;
};

const waitForExportReady = async (node: HTMLElement) => {
  if ((document as any).fonts?.ready) {
    try {
      await waitWithTimeout((document as any).fonts.ready, 1200);
    } catch {}
  }

  const images = Array.from(node.querySelectorAll('img'));
  await Promise.all(images.map(async (img) => {
    try {
      if ((img as any).decode) {
        await waitWithTimeout((img as any).decode(), 1200);
      }
    } catch {}
  }));

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
};

type Params = {
  reportRef: React.RefObject<HTMLDivElement | null>;
  resumeData: any;
};

export const useInterviewReportExport = ({ reportRef, resumeData }: Params) => {
  const [isExporting, setIsExporting] = React.useState(false);

  const handleSaveImage = React.useCallback(async () => {
    if (!reportRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const node = reportRef.current;
      await waitForExportReady(node);

      const captureWidth = Math.max(1, Math.round(node.scrollWidth || node.clientWidth));
      const captureHeight = Math.max(1, Math.round(node.scrollHeight || node.clientHeight));
      const basePixelRatio = Number(window.devicePixelRatio || 1) > 1.5 ? 1.5 : Number(window.devicePixelRatio || 1);
      const maxPixels = 9_000_000;
      const rawScale = Math.sqrt(maxPixels / Math.max(1, captureWidth * captureHeight));
      const captureScale = Math.max(1, Math.min(basePixelRatio || 1, rawScale));
      const viewportWidth = Math.max(1, Math.round(window.innerWidth || document.documentElement.clientWidth || captureWidth));
      const viewportHeight = Math.max(1, Math.round(window.innerHeight || document.documentElement.clientHeight || captureHeight));
      const isIgnorableCssRuleError = (value: unknown) => {
        const text = String(value || '');
        return (
          text.includes('cssRules') &&
          (text.includes('Failed to read') || text.includes('SecurityError'))
        );
      };

      const withFilteredCssRuleLogs = async <T,>(task: () => Promise<T>) => {
        const originalError = console.error;
        console.error = (...args: any[]) => {
          if (args.some((arg) => isIgnorableCssRuleError(arg))) return;
          originalError(...args);
        };
        try {
          return await task();
        } finally {
          console.error = originalError;
        }
      };

      let canvas: HTMLCanvasElement;
      try {
        const mod: any = await import('html-to-image');
        const toCanvas = mod?.toCanvas;
        canvas = await withFilteredCssRuleLogs(() =>
          toCanvas(node, {
            pixelRatio: captureScale,
            cacheBust: false,
            backgroundColor: '#ffffff',
            width: captureWidth,
            height: captureHeight,
            canvasWidth: Math.round(captureWidth * captureScale),
            canvasHeight: Math.round(captureHeight * captureScale),
            style: {
              width: `${captureWidth}px`,
              height: `${captureHeight}px`,
              transform: 'none',
            },
          })
        );
      } catch (primaryError) {
        console.warn('html-to-image export failed, fallback to html2canvas:', primaryError);
        const mod: any = await import('html2canvas');
        const html2canvas = mod?.default || mod;
        canvas = await html2canvas(node, {
          scale: captureScale,
          useCORS: true,
          backgroundColor: '#ffffff',
          foreignObjectRendering: false,
          scrollX: 0,
          scrollY: 0,
          width: captureWidth,
          height: captureHeight,
          windowWidth: viewportWidth,
          windowHeight: viewportHeight,
          onclone: (doc: Document) => {
            const style = doc.createElement('style');
            style.textContent = `
              .report-exporting .animate-in,
              .report-exporting .animate-pulse,
              .report-exporting [class*="slide-in-"],
              .report-exporting [class*="fade-in"] {
                animation: none !important;
                transition: none !important;
                transform: none !important;
                opacity: 1 !important;
              }
            `;
            doc.head.appendChild(style);
          },
        });
      }

      const exports = await downloadCanvasWithChunking(canvas, `面试报告-${Date.now()}`);
      for (const item of exports) {
        await recordResumeExportHistory(resumeData as any, {
          filename: item.filename,
          size: item.size,
          type: 'IMAGE',
        });
      }
    } catch (err) {
      console.error('Failed to export interview report image:', err);
      window.alert('保存图片失败，请稍后重试');
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, reportRef, resumeData]);

  return {
    isExporting,
    handleSaveImage,
  };
};
