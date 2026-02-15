import React, { useRef, useState } from 'react';
import { ScreenProps } from '../../types';
import { buildApiUrl } from '../../src/api-config';
import { useAppContext } from '../../src/app-context';

const Help: React.FC<ScreenProps> = () => {
  const { goBack } = useAppContext();
  const [images, setImages] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePickImages = () => {
    fileInputRef.current?.click();
  };

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length == 0) return;
    const remaining = Math.max(0, 3 - images.length);
    const toAdd = files.slice(0, remaining);
    toAdd.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as string;
        if (result) {
          setImages(prev => [...prev, result].slice(0, 3));
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeImage = (idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!description.trim()) {
      setSubmitError('请填写问题描述');
      setSubmitSuccess('');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');
    setSubmitSuccess('');

    try {
      let token = localStorage.getItem('token');
      if (!token) {
        const sessionStr = localStorage.getItem('supabase_session');
        if (sessionStr) {
          try {
            const session = JSON.parse(sessionStr);
            token = session.access_token || session.token;
          } catch (e) {
            // ignore parse error
          }
        }
      }

      const response = await fetch(buildApiUrl('/api/feedback'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          description: description.trim(),
          images
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || '提交反馈失败，请稍后重试');
      }

      setDescription('');
      setImages([]);
      setSubmitSuccess('反馈提交成功，感谢你的建议');
    } catch (error: any) {
      setSubmitError(error?.message || '提交反馈失败，请稍后重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex h-full min-h-screen w-full flex-col bg-background-light dark:bg-background-dark max-w-[480px] mx-auto animate-in slide-in-from-right duration-300">
      <header className="sticky top-0 z-40 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-slate-200/50 dark:border-white/5 shrink-0">
        <div className="flex items-center px-4 h-14 relative">
          <button
            onClick={goBack}
            className="flex size-10 items-center justify-center rounded-full text-slate-900 dark:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors z-10"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>arrow_back</span>
          </button>
          <h2 className="absolute inset-0 flex items-center justify-center text-lg font-bold leading-tight tracking-[-0.015em] text-slate-900 dark:text-white pointer-events-none">帮助与反馈</h2>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto pb-24">
        <div className="mt-4 px-4">
          <h3 className="ml-4 mb-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">问题反馈</h3>

          <div className="flex flex-col gap-4 rounded-2xl bg-white dark:bg-surface-dark border border-gray-100 dark:border-white/5 p-5 shadow-sm">
            <div className="flex flex-col gap-2">
              <label className="ml-1 text-[12px] font-medium text-slate-500 dark:text-slate-400">问题描述</label>
              <textarea
                className="w-full min-h-[140px] resize-none rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20 p-4 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all"
                placeholder="请描述你遇到的问题或建议，我们会尽快处理..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              ></textarea>
            </div>

            <div className="flex flex-col gap-2">
              <label className="ml-1 text-[12px] font-medium text-slate-500 dark:text-slate-400">截图上传（最多 3 张）</label>
              <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
                <button
                  onClick={handlePickImages}
                  className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20 hover:border-primary dark:hover:border-primary hover:bg-primary/5 transition-all group"
                >
                  <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 group-hover:text-primary mb-1">add_a_photo</span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 group-hover:text-primary font-medium">添加图片</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFiles}
                  className="hidden"
                />
                {images.map((src, idx) => (
                  <div key={idx} className="relative h-20 w-20 shrink-0 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-800 overflow-hidden group">
                    <img alt="uploaded" className="h-full w-full object-cover" src={src} />
                    <button
                      onClick={() => removeImage(idx)}
                      className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm hover:bg-red-500 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="mt-4 w-full rounded-xl bg-primary py-3.5 text-center text-sm font-bold text-white shadow-lg shadow-primary/25 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSubmitting ? '提交中...' : '提交反馈'}
            </button>

            {submitError && (
              <p className="text-center text-xs text-red-500 font-medium">{submitError}</p>
            )}
            {submitSuccess && (
              <p className="text-center text-xs text-green-600 dark:text-green-400 font-medium">{submitSuccess}</p>
            )}

            <p className="mt-2 text-center text-xs text-slate-400 dark:text-slate-500">
              我们会认真阅读每一条反馈并持续优化体验
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Help;
