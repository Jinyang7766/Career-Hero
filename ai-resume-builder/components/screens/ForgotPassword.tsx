import React, { useState } from 'react';
import { View, ScreenProps } from '../../types';

const ForgotPassword: React.FC<ScreenProps> = ({ setCurrentView, goBack }) => {
  const [isSent, setIsSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // Simulate API call
    setTimeout(() => {
      setIsLoading(false);
      setIsSent(true);
    }, 1500);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background-light dark:bg-background-dark animate-in fade-in duration-500">
      <div className="flex items-center p-4">
        <button
          onClick={goBack}
          className="flex size-10 items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-white/10 transition-colors text-slate-900 dark:text-white"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
      </div>

      <div className="flex flex-1 flex-col px-6 pt-10 pb-12 lg:px-8 max-w-sm mx-auto w-full">
        <div className="sm:mx-auto sm:w-full sm:max-w-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-6">
            <span className="material-symbols-outlined text-[24px]">lock_reset</span>
          </div>
          <h2 className="text-2xl font-bold leading-9 tracking-tight text-slate-900 dark:text-white">
            重置密码
          </h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            不用担心，输入您的注册邮箱，我们将向您发送重置说明。
          </p>
        </div>

        <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
          {!isSent ? (
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="email" className="block text-sm font-medium leading-6 text-slate-900 dark:text-white">
                  电子邮箱
                </label>
                <div className="mt-2">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="block w-full rounded-xl border-0 bg-white dark:bg-white/5 py-3 px-4 text-slate-900 dark:text-white shadow-sm ring-1 ring-inset ring-slate-200 dark:ring-white/10 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6 outline-none transition-all"
                    placeholder="name@example.com"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="flex w-full justify-center rounded-xl bg-primary px-3 py-3.5 text-sm font-bold leading-6 text-white shadow-sm hover:bg-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-all active:scale-[0.98] disabled:opacity-70"
              >
                {isLoading ? '发送中...' : '发送重置链接'}
              </button>
            </form>
          ) : (
            <div className="bg-red-500/80 backdrop-blur-md border border-red-400/30 rounded-2xl p-6 flex flex-col items-center text-center animate-in zoom-in-95 duration-300 shadow-xl shadow-red-500/10">
              <div className="h-12 w-12 rounded-full bg-white/20 text-white flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-[28px]">check</span>
              </div>
              <h3 className="text-white font-black text-lg mb-1 tracking-tight">邮件已发送</h3>
              <p className="text-sm text-white/90 font-medium mb-6 leading-relaxed">
                请检查您的收件箱，按照说明重置密码。
              </p>
              <button
                onClick={() => setCurrentView(View.LOGIN)}
                className="w-full py-3 rounded-xl bg-white text-red-600 font-bold hover:bg-white/90 transition-all active:scale-[0.98] shadow-lg"
              >
                返回登录
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;