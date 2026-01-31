import React from 'react';
import { View, ScreenProps } from '../../types';

const Help: React.FC<ScreenProps> = ({ setCurrentView, goBack }) => {
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
              <textarea className="form-textarea w-full min-h-[140px] resize-none rounded-lg border border-gray-200 dark:border-[#324d67] bg-gray-50 dark:bg-[#111a22] p-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-[#6b7d91] focus:border-primary focus:ring-primary dark:focus:border-primary dark:focus:ring-1 focus:outline-none transition-shadow" placeholder="请详细描述您遇到的问题，以便我们更快帮您解决..."></textarea>
            </div>
            
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">添加图片 (最多3张)</label>
              <div className="flex gap-3 overflow-x-auto pb-1">
                <button className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 dark:border-[#324d67] bg-gray-50 dark:bg-[#111a22] hover:border-primary dark:hover:border-primary hover:bg-primary/5 transition-colors group">
                  <span className="material-symbols-outlined text-gray-400 dark:text-[#6b7d91] group-hover:text-primary mb-1">add_a_photo</span>
                  <span className="text-[10px] text-gray-400 dark:text-[#6b7d91] group-hover:text-primary">上传截图</span>
                </button>
                <div className="relative h-20 w-20 shrink-0 rounded-lg border border-gray-200 dark:border-[#324d67] bg-gray-800 overflow-hidden group">
                  <img alt="uploaded image" className="h-full w-full object-cover opacity-80" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAvb01bNGhdWkKe3CUJ34dBq72yNWZ48GTcANXLued2gT4rIZx7dmcOKCeI7FUTzxwn7_bsq461Y63FiGsTCKfvYvwP8iBH1jWIrPbK6DXWSSuikIXAECJEDoG4bGnG_GHFEGWj-XVAR0tehIr4mmLVT6flEIUl4tsC08bGE-aYqmGcNUPjVtNIer8e3KreQkS7ToD1W-uf9vTBGEkdUkCmGzdWBusKSOfwTd7j7chNmVdR3EDyvYoJsmt2lMZ53h1yhQ_GPST0a-Id"/>
                  <button className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm hover:bg-red-500 transition-colors">
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                </div>
              </div>
            </div>

            <button className="mt-6 w-full rounded-xl bg-primary py-3.5 text-center text-sm font-bold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-600 active:scale-[0.98] transition-all">
                提交反馈
            </button>
            <p className="mt-4 text-center text-xs text-gray-400 dark:text-gray-500">
                我们会仔细阅读每一条反馈，感谢您的支持
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Help;