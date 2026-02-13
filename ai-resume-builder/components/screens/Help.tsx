import React, { useRef, useState } from 'react';
import { ScreenProps } from '../../types';
import { buildApiUrl } from '../../src/api-config';

const Help: React.FC<ScreenProps> = ({ goBack }) => {
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
      <div className="sticky top-0 z-50 flex items-center bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md p-4 pb-2 justify-between border-b border-gray-200 dark:border-gray-800">
        <div
          onClick={goBack}
          className="text-gray-900 dark:text-white flex size-12 shrink-0 items-center justify-start cursor-pointer hover:opacity-70 transition-opacity"
        >
          <span className="material-symbols-outlined text-2xl">arrow_back_ios</span>
        </div>
        <h2 className="text-gray-900 dark:text-white text-lg font-bold leading-tight tracking-[-0.015em] flex-1 text-center pr-12">帮助与反馈</h2>
      </div>

      <div className="flex-1 overflow-y-auto pb-24">
        <div className="px-4 pb-6 pt-6">
          <h3 className="text-gray-900 dark:text-white text-lg font-bold leading-tight tracking-[-0.015em] pb-3">问题反馈</h3>
          <div className="flex flex-col gap-4 rounded-xl bg-white dark:bg-[#192633] border border-gray-200 dark:border-[#324d67] p-4">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">问题描述</label>
              <textarea
                className="form-textarea w-full min-h-[140px] resize-none rounded-lg border border-gray-200 dark:border-[#324d67] bg-gray-50 dark:bg-[#111a22] p-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-[#6b7d91] focus:border-primary focus:ring-primary dark:focus:border-primary dark:focus:ring-1 focus:outline-none transition-shadow"
                placeholder="请描述你遇到的问题或建议，我们会尽快处理..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              ></textarea>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">截图上传（最多 3 张）</label>
              <div className="flex gap-3 overflow-x-auto pb-1">
                <button
                  onClick={handlePickImages}
                  className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 dark:border-[#324d67] bg-gray-50 dark:bg-[#111a22] hover:border-primary dark:hover:border-primary hover:bg-primary/5 transition-colors group"
                >
                  <span className="material-symbols-outlined text-gray-400 dark:text-[#6b7d91] group-hover:text-primary mb-1">add_a_photo</span>
                  <span className="text-[10px] text-gray-400 dark:text-[#6b7d91] group-hover:text-primary">添加图片</span>
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
                  <div key={idx} className="relative h-20 w-20 shrink-0 rounded-lg border border-gray-200 dark:border-[#324d67] bg-gray-800 overflow-hidden group">
                    <img alt="uploaded" className="h-full w-full object-cover opacity-90" src={src} />
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
              className="mt-6 w-full rounded-xl bg-primary py-3.5 text-center text-sm font-bold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-600 active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSubmitting ? '提交中...' : '提交反馈'}
            </button>
            {submitError && (
              <p className="text-center text-xs text-red-500">{submitError}</p>
            )}
            {submitSuccess && (
              <p className="text-center text-xs text-green-600 dark:text-green-400">{submitSuccess}</p>
            )}
            <p className="mt-4 text-center text-xs text-gray-400 dark:text-gray-500">
              我们会认真阅读每一条反馈并持续优化体验
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Help;
