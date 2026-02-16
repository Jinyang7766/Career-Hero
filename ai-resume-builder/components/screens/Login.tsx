import React, { useState } from 'react';
import { View, ScreenProps } from '../../types';
import { supabase } from '../../src/supabase-client';
import QqPenguinIcon from '../icons/QqPenguinIcon';
import { useAppContext } from '../../src/app-context';

const Login: React.FC<ScreenProps> = () => {
  const { login, navigateToView } = useAppContext();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

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

        setError(errorMessage);
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
      setError('网络错误，请检查连接后重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background-light dark:bg-background-dark animate-in fade-in duration-500">
      <div className="flex flex-1 flex-col justify-center px-6 py-12 lg:px-8 relative">
        {/* Background blobs */}
        <div className="absolute top-[-10%] right-[-10%] w-[300px] h-[300px] rounded-full bg-primary/10 blur-[80px] pointer-events-none"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[250px] h-[250px] rounded-full bg-blue-600/10 blur-[80px] pointer-events-none"></div>

        <div className="sm:mx-auto sm:w-full sm:max-w-sm z-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary to-blue-600 shadow-lg shadow-primary/30">
            <span className="material-symbols-outlined text-white text-[32px]">description</span>
          </div>
          <h2 className="mt-8 text-center text-2xl font-bold leading-9 tracking-tight text-slate-900 dark:text-white">
            欢迎回来
          </h2>
          <p className="mt-2 text-center text-sm text-slate-500 dark:text-slate-400">
            登录您的账号以继续使用
          </p>
        </div>

        <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm z-10">
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
                  className="block w-full rounded-xl border-0 bg-white dark:bg-white/5 py-3.5 px-4 text-slate-900 dark:text-white shadow-sm ring-1 ring-inset ring-slate-200 dark:ring-white/10 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6 outline-none transition-all"
                  placeholder="name@example.com"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-sm font-medium leading-6 text-slate-900 dark:text-white">
                  密码
                </label>
                <div className="text-sm">
                  <button
                    type="button"
                    onClick={() => navigateToView(View.FORGOT_PASSWORD, { replace: true })}
                    className="font-semibold text-primary hover:text-primary/80 transition-colors"
                  >
                    忘记密码？
                  </button>
                </div>
              </div>
              <div className="mt-2 relative">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="block w-full rounded-xl border-0 bg-white dark:bg-white/5 py-3.5 px-4 text-slate-900 dark:text-white shadow-sm ring-1 ring-inset ring-slate-200 dark:ring-white/10 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6 outline-none transition-all"
                  placeholder="请输入密码"
                />
              </div>
            </div>

            {error && (
              <div className="mb-4 flex items-center gap-3 p-4 bg-red-500/80 backdrop-blur-md border border-red-400/30 rounded-2xl shadow-lg shadow-red-500/10 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="size-6 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-white text-[16px]">error</span>
                </div>
                <p className="text-sm text-white font-bold leading-tight">{error}</p>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="flex w-full justify-center rounded-xl bg-primary px-3 py-3.5 text-sm font-bold leading-6 text-white shadow-sm hover:bg-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    登录中...
                  </span>
                ) : (
                  '登录'
                )}
              </button>
            </div>
          </form>

          <div className="mt-8">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200 dark:border-white/10" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-background-light dark:bg-background-dark px-2 text-slate-500">
                  其他登录方式
                </span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4">
              <button className="flex w-full items-center justify-center gap-3 rounded-xl bg-white dark:bg-white/5 px-3 py-2.5 text-sm font-semibold text-slate-900 dark:text-white shadow-sm ring-1 ring-inset ring-slate-200 dark:ring-white/10 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M9.5 4C5.91 4 3 6.47 3 9.5c0 1.75 1 3.34 2.65 4.43l-.6 1.97 2.28-1.2c.7.2 1.44.31 2.17.31.24 0 .48-.01.71-.03-.06-.25-.09-.52-.09-.79 0-2.63 2.48-4.75 5.55-4.75.42 0 .83.04 1.23.11C15.78 6.35 12.92 4 9.5 4zm-2 4.2a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm4 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
                  <path d="M16.55 10.5c-3.01 0-5.45 2.03-5.45 4.5s2.44 4.5 5.45 4.5c.59 0 1.17-.08 1.72-.22l2.08 1.1-.55-1.82c1.26-.82 2.03-2.06 2.03-3.56 0-2.47-2.44-4.5-5.28-4.5zm-1.95 2.7a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8zm3.6 0a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8z" />
                </svg>
                <span className="text-sm">微信</span>
              </button>
              <button className="flex w-full items-center justify-center gap-3 rounded-xl bg-white dark:bg-white/5 px-3 py-2.5 text-sm font-semibold text-slate-900 dark:text-white shadow-sm ring-1 ring-inset ring-slate-200 dark:ring-white/10 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors">
                <QqPenguinIcon className="h-5 w-5" />
                <span className="text-sm">QQ</span>
              </button>
            </div>
          </div>

          <p className="mt-10 text-center text-sm text-slate-500 dark:text-slate-400">
            还没有账号？{' '}
            <button
              onClick={() => navigateToView(View.SIGNUP, { replace: true })}
              className="font-semibold leading-6 text-primary hover:text-blue-500 transition-colors"
            >
              立即注册
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
