import React, { useState } from 'react';
import { View, ScreenProps } from '../../types';
import { supabase } from '../../src/supabase-client';
import { useAppContext } from '../../src/app-context';
import BackButton from '../shared/BackButton';
import { toast } from '../../src/ui/dialogs';

const Login: React.FC<ScreenProps> = () => {
  const login = useAppContext((s) => s.login);
  const navigateToView = useAppContext((s) => s.navigateToView);
  const goBack = useAppContext((s) => s.goBack);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      console.log('Attempting login with:', { email });

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      console.log('Supabase response:', { data, error });

      if (error) {
        console.error('Login error details:', {
          message: error.message,
          status: error.status,
          code: error.code
        });

        // 显示具体错误原因
        let errorMessage = '登录失败';
        if (error.message.includes('Invalid login credentials')) {
          errorMessage = '邮箱或密码错误，请检查后重试';
        } else if (error.message.includes('Email not confirmed')) {
          errorMessage = '邮箱未验证，请检查邮箱并点击验证链接';
        } else if (error.message.includes('Too many requests')) {
          errorMessage = '请求过于频繁，请稍后再试';
        } else {
          errorMessage = `登录失败: ${error.message}`;
        }

        toast(errorMessage, 'error');
        return;
      }

      if (data.user) {
        // Store user session
        localStorage.setItem('supabase_session', JSON.stringify(data.session));
        localStorage.setItem('user', JSON.stringify(data.user));

        console.log('Login successful:', data.user);

        // Login successful
        login(data.user);
      }
    } catch (err) {
      console.error('Unexpected login error:', err);
      toast('网络错误，请检查连接后重试', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background-light dark:bg-background-dark animate-in fade-in duration-500">
      <div className="flex items-center p-4">
        <BackButton onClick={goBack} className="hover:bg-slate-200 dark:hover:bg-white/10" />
      </div>

      <div className="flex flex-1 flex-col justify-center px-4 pt-2 pb-8 lg:px-8 relative overflow-hidden">
        {/* Decorative Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* Main Blobs - Soft & Large */}
          <div className="absolute top-[-5%] right-[-5%] w-[400px] h-[400px] rounded-full bg-primary/10 blur-[100px] animate-pulse" style={{ animationDuration: '8s' }}></div>
          <div className="absolute bottom-[-5%] left-[-5%] w-[350px] h-[350px] rounded-full bg-blue-500/10 blur-[100px] animate-pulse" style={{ animationDuration: '10s', animationDelay: '1s' }}></div>
          <div className="absolute top-[20%] left-[10%] w-[150px] h-[150px] rounded-full bg-purple-500/5 blur-[80px]"></div>

          {/* Subtle Grid Interaction - Modern & Professional */}
          <div className="absolute inset-0 opacity-[0.2] dark:opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(circle, #3b82f6 1px, transparent 1px)', backgroundSize: '32px 32px' }}></div>
        </div>

        <div className="sm:mx-auto sm:w-full sm:max-w-md z-10">
          <div className="relative bg-white/60 dark:bg-slate-900/40 backdrop-blur-2xl border border-white dark:border-white/10 rounded-2xl sm:rounded-3xl shadow-2xl shadow-blue-500/5 p-6 sm:p-10 animate-in zoom-in-95 duration-500">
            <div className="sm:mx-auto sm:w-full sm:max-w-sm">
              <div className="mx-auto flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary to-blue-600 shadow-lg shadow-primary/30 ring-4 ring-primary/10">
                <span className="material-symbols-outlined text-white text-[28px] sm:text-[32px]">description</span>
              </div>
              <h2 className="mt-4 sm:mt-8 text-center text-xl sm:text-2xl font-black leading-9 tracking-tight text-slate-900 dark:text-white">
                欢迎回来
              </h2>
              <p className="mt-1 sm:mt-2 text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
                登录您的账号以继续使用
              </p>
            </div>

            <div className="mt-6 sm:mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
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
                      placeholder="name@example.com"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between ml-1">
                    <label htmlFor="password" className="block text-xs sm:text-sm font-semibold leading-6 text-slate-900 dark:text-white">
                      密码
                    </label>
                    <div className="text-xs sm:text-sm">
                      <button
                        type="button"
                        onClick={() => navigateToView(View.FORGOT_PASSWORD, { replace: true })}
                        className="font-bold text-primary hover:text-primary/80 transition-colors"
                      >
                        忘记密码？
                      </button>
                    </div>
                  </div>
                  <div className="mt-1.5 sm:mt-2 relative">
                    <input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      className="block w-full rounded-xl border-0 bg-white/50 dark:bg-white/5 py-2.5 sm:py-3.5 px-4 text-slate-900 dark:text-white shadow-sm ring-1 ring-inset ring-slate-200 dark:ring-white/10 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6 outline-none transition-all hover:ring-slate-300 dark:hover:ring-white/20"
                      placeholder="请输入密码"
                    />
                  </div>
                </div>



                <div>
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
                          登录中...
                        </>
                      ) : (
                        '登录'
                      )}
                    </span>
                  </button>
                </div>
              </form>

              <p className="mt-10 text-center text-sm text-slate-500 dark:text-slate-400 font-medium">
                还没有账号？{' '}
                <button
                  onClick={() => navigateToView(View.SIGNUP, { replace: true })}
                  className="font-black leading-6 text-primary hover:text-blue-500 transition-colors"
                >
                  立即注册
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
