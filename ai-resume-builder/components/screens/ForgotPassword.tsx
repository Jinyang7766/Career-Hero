import React, { useState } from 'react';
import { View, ScreenProps } from '../../types';
import { useAppContext } from '../../src/app-context';

const ForgotPassword: React.FC<ScreenProps> = () => {
  const navigateToView = useAppContext((s) => s.navigateToView);
  const goBack = useAppContext((s) => s.goBack);
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

      <div className="flex flex-1 flex-col px-4 pt-6 pb-8 lg:px-8 max-w-md mx-auto w-full relative overflow-hidden">
        {/* Decorative Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* Main Blobs - Soft & Large */}
          <div className="absolute top-[-5%] right-[-5%] w-[400px] h-[400px] rounded-full bg-primary/10 blur-[100px] animate-pulse" style={{ animationDuration: '8s' }}></div>
          <div className="absolute bottom-[-5%] left-[-5%] w-[350px] h-[350px] rounded-full bg-blue-500/10 blur-[100px] animate-pulse" style={{ animationDuration: '10s', animationDelay: '1s' }}></div>
          <div className="absolute top-[20%] left-[10%] w-[150px] h-[150px] rounded-full bg-purple-500/5 blur-[80px]"></div>

          {/* Subtle Grid Interaction */}
          <div className="absolute inset-0 opacity-[0.2] dark:opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(circle, #3b82f6 1px, transparent 1px)', backgroundSize: '32px 32px' }}></div>

          {/* Floating Accents */}
          <div className="absolute top-[15%] right-[20%] w-24 h-24 border border-primary/10 rounded-full"></div>
          <div className="absolute bottom-[25%] left-[15%] w-16 h-16 border border-blue-400/10 rounded-lg rotate-12"></div>
        </div>
        <div className="sm:mx-auto sm:w-full sm:max-w-md z-10">
          <div className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-2xl border border-white dark:border-white/10 rounded-2xl sm:rounded-3xl shadow-2xl shadow-blue-500/5 p-6 sm:p-10 animate-in zoom-in-95 duration-500">
            <div className="sm:mx-auto sm:w-full sm:max-w-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4 sm:mb-6 ring-4 ring-primary/5">
                <span className="material-symbols-outlined text-[24px]">lock_reset</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black leading-9 tracking-tight text-slate-900 dark:text-white">
                重置密码
              </h2>
              <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
                不用担心，输入您的注册邮箱，我们将向您发送重置说明。
              </p>
            </div>

            <div className="mt-6 sm:mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
              {!isSent ? (
                <form className="space-y-4 sm:space-y-6" onSubmit={handleSubmit}>
                  <div>
                    <label htmlFor="email" className="block text-xs sm:text-sm font-semibold leading-6 text-slate-900 dark:text-white ml-1">
                      电子邮箱
                    </label>
                    <div className="mt-1.5 sm:mt-2">
                      <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        className="block w-full rounded-xl border-0 bg-white/50 dark:bg-white/5 py-2.5 sm:py-3.5 px-4 text-slate-900 dark:text-white shadow-sm ring-1 ring-inset ring-slate-200 dark:ring-white/10 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6 outline-none transition-all hover:ring-slate-300 dark:hover:ring-white/20"
                        placeholder="请输入注册邮箱"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="group relative flex w-full justify-center rounded-xl bg-gradient-to-r from-primary to-blue-600 px-3 py-4 text-sm font-black leading-6 text-white shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed overflow-hidden"
                  >
                    <div className="absolute inset-0 w-0 bg-white/20 transition-all duration-300 group-hover:w-full"></div>
                    <span className="relative flex items-center gap-2">
                      {isLoading ? (
                        <>
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                          发送中...
                        </>
                      ) : (
                        '发送重置链接'
                      )}
                    </span>
                  </button>
                </form>
              ) : (
                <div className="bg-primary/10 backdrop-blur-md border border-primary/20 rounded-3xl p-8 flex flex-col items-center text-center animate-in zoom-in-95 duration-300">
                  <div className="h-16 w-16 rounded-full bg-primary/20 text-primary flex items-center justify-center mb-6 ring-4 ring-primary/5">
                    <span className="material-symbols-outlined text-[32px] fill-1">check_circle</span>
                  </div>
                  <h3 className="text-slate-900 dark:text-white font-black text-xl mb-2 tracking-tight">邮件已发送</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mb-8 leading-relaxed">
                    请检查您的收件箱，按照说明重置密码。
                  </p>
                  <button
                    onClick={() => navigateToView(View.LOGIN, { replace: true })}
                    className="w-full py-4 rounded-xl bg-primary text-white font-bold hover:bg-blue-600 transition-all active:scale-[0.98] shadow-lg shadow-primary/25"
                  >
                    返回登录
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
