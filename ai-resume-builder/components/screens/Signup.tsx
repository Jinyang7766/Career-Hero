import React, { useState } from 'react';
import { View, ScreenProps } from '../../types';
import { API_BASE_URL } from '../../src/api-config';

const Signup: React.FC<ScreenProps> = ({ setCurrentView, onLogin }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          email,
          password,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Store token in localStorage
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        
        // Registration successful
        if (onLogin) onLogin(data.user);
      } else {
        // Registration failed
        setError(data.error || 'Registration failed');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background-light dark:bg-background-dark animate-in fade-in duration-500">
      <div className="flex flex-1 flex-col justify-center px-6 py-12 lg:px-8 relative">
        <div className="absolute top-0 right-0 p-4 z-20">
            <button 
              onClick={() => setCurrentView(View.LOGIN)}
              className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-primary transition-colors"
            >
                登录
            </button>
        </div>
        
        <div className="sm:mx-auto sm:w-full sm:max-w-sm z-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <span className="material-symbols-outlined text-[28px]">person_add</span>
          </div>
          <h2 className="mt-6 text-center text-2xl font-bold leading-9 tracking-tight text-slate-900 dark:text-white">
            创建新账号
          </h2>
          <p className="mt-2 text-center text-sm text-slate-500 dark:text-slate-400">
            开始您的职业生涯新篇章
          </p>
        </div>

        <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm z-10">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="name" className="block text-sm font-medium leading-6 text-slate-900 dark:text-white">
                全名
              </label>
              <div className="mt-2">
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  className="block w-full rounded-xl border-0 bg-white dark:bg-white/5 py-3 px-4 text-slate-900 dark:text-white shadow-sm ring-1 ring-inset ring-slate-200 dark:ring-white/10 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6 outline-none transition-all"
                  placeholder="John Doe"
                />
              </div>
            </div>

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

            <div>
              <label htmlFor="password" className="block text-sm font-medium leading-6 text-slate-900 dark:text-white">
                密码
              </label>
              <div className="mt-2">
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  className="block w-full rounded-xl border-0 bg-white dark:bg-white/5 py-3 px-4 text-slate-900 dark:text-white shadow-sm ring-1 ring-inset ring-slate-200 dark:ring-white/10 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6 outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">密码长度至少 8 位，包含字母和数字。</p>
            </div>
            
            <div className="flex items-center gap-2">
                <input id="terms" type="checkbox" className="w-4 h-4 rounded text-primary focus:ring-primary border-gray-300 dark:border-gray-600 bg-white dark:bg-white/5" required />
                <label htmlFor="terms" className="text-xs text-slate-500 dark:text-slate-400">
                    我已阅读并同意 <a href="#" className="text-primary hover:underline">服务条款</a> 和 <a href="#" className="text-primary hover:underline">隐私政策</a>
                </label>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="flex w-full justify-center rounded-xl bg-primary px-3 py-3.5 text-sm font-bold leading-6 text-white shadow-sm hover:bg-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isLoading ? '创建账户中...' : '注册账号'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Signup;