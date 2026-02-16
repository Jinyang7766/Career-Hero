import React, { useState } from 'react';
import { View, ScreenProps } from '../../types';
import { AuthService } from '../../src/auth-service';
import { supabase } from '../../src/supabase-client';
import { useAppContext } from '../../src/app-context';

const Signup: React.FC<ScreenProps> = () => {
  const { login, navigateToView } = useAppContext();
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
      console.log('Attempting signup with:', { email, name });

      // 使用AuthService进行注册
      const result = await AuthService.signUp(email, password, name);

      if (!result.success) {
        console.error('Signup failed:', result.error);

        // 显示具体错误原因
        let errorMessage = '注册失败';
        if (result.error?.message?.includes('User already registered')) {
          errorMessage = '该邮箱已被注册，请直接登录或使用其他邮箱';
        } else if (result.error?.message?.includes('Password should be at least')) {
          errorMessage = '密码长度至少需要6位字符';
        } else if (result.error?.message?.includes('Invalid email')) {
          errorMessage = '邮箱格式不正确，请检查后重试';
        } else if (result.error?.message?.includes('over_email_send_rate_limit')) {
          errorMessage = '发送邮件过于频繁，请稍后再试';
        } else if (result.error?.message?.includes('signup_disabled')) {
          errorMessage = '注册功能已禁用，请联系管理员';
        } else {
          errorMessage = `注册失败: ${result.error?.message || '未知错误'}`;
        }

        setError(errorMessage);
        return;
      }

      console.log('Signup successful:', result.data);

      if (result.data?.user) {
        // 注册成功，但可能需要邮箱验证
        if (result.data.session) {
          // 直接登录成功
          localStorage.setItem('supabase_session', JSON.stringify(result.data.session));
          localStorage.setItem('user', JSON.stringify(result.data.user));

          console.log('Signup and login successful:', result.data.user);
          login(result.data.user);
        } else {
          // 需要邮箱验证
          console.log('Signup successful, email verification required');
          setError('注册成功！请检查邮箱并点击验证链接以完成注册');
          setTimeout(() => {
            navigateToView(View.LOGIN, { replace: true });
          }, 3000);
        }
      } else {
        console.error('No user data returned from signup');
        setError('注册失败：未返回用户信息，请重试');
      }
    } catch (err) {
      console.error('Unexpected signup error:', {
        error: err,
        message: err instanceof Error ? err.message : 'Unknown error',
        stack: err instanceof Error ? err.stack : 'No stack trace'
      });
      setError(`网络错误: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background-light dark:bg-background-dark animate-in fade-in duration-500">
      <div className="flex flex-1 flex-col justify-center px-6 py-12 lg:px-8 relative">
        <div className="absolute top-0 right-0 p-4 z-20">
          <button
            onClick={() => navigateToView(View.LOGIN, { replace: true })}
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
                  placeholder="例如: 张三"
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
                  placeholder="请输入密码"
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
              <div className="mb-4 flex items-center gap-3 p-4 bg-red-500/80 backdrop-blur-md border border-red-400/30 rounded-2xl shadow-lg shadow-red-500/10 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="size-6 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-white text-[16px]">error</span>
                </div>
                <p className="text-sm text-white font-bold leading-tight">{error}</p>
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
