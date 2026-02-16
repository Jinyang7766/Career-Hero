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
      <div className="flex flex-1 flex-col justify-center px-4 py-8 lg:px-8 relative overflow-hidden">
        {/* Decorative Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* Main Blobs - Soft & Large */}
          <div className="absolute top-[-5%] left-[-5%] w-[400px] h-[400px] rounded-full bg-primary/10 blur-[100px] animate-pulse" style={{ animationDuration: '8s' }}></div>
          <div className="absolute bottom-[-5%] right-[-5%] w-[350px] h-[350px] rounded-full bg-blue-500/10 blur-[100px] animate-pulse" style={{ animationDuration: '10s', animationDelay: '1s' }}></div>
          <div className="absolute top-[20%] right-[10%] w-[150px] h-[150px] rounded-full bg-purple-500/5 blur-[80px]"></div>

          {/* Subtle Grid Interaction */}
          <div className="absolute inset-0 opacity-[0.2] dark:opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(circle, #3b82f6 1px, transparent 1px)', backgroundSize: '32px 32px' }}></div>

          {/* Floating Accents */}
          <div className="absolute top-[15%] left-[20%] w-24 h-24 border border-primary/10 rounded-full"></div>
          <div className="absolute bottom-[25%] right-[15%] w-16 h-16 border border-blue-400/10 rounded-lg rotate-12"></div>
        </div>

        <div className="sm:mx-auto sm:w-full sm:max-w-md z-10">
          <div className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-2xl border border-white dark:border-white/10 rounded-2xl sm:rounded-3xl shadow-2xl shadow-blue-500/5 p-6 sm:p-10 animate-in zoom-in-95 duration-500">
            <div className="sm:mx-auto sm:w-full sm:max-w-sm">
              <div className="mx-auto flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-xl bg-primary/10 text-primary ring-4 ring-primary/5">
                <span className="material-symbols-outlined text-[24px] sm:text-[28px]">person_add</span>
              </div>
              <h2 className="mt-4 sm:mt-6 text-center text-xl sm:text-2xl font-black leading-9 tracking-tight text-slate-900 dark:text-white">
                创建新账号
              </h2>
              <p className="mt-1 sm:mt-2 text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
                开始您的职业生涯新篇章
              </p>
            </div>

            <div className="mt-6 sm:mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
              <form className="space-y-4 sm:space-y-5" onSubmit={handleSubmit}>
                <div>
                  <label htmlFor="name" className="block text-xs sm:text-sm font-semibold leading-6 text-slate-900 dark:text-white ml-1">
                    全名
                  </label>
                  <div className="mt-1.5 sm:mt-2">
                    <input
                      id="name"
                      name="name"
                      type="text"
                      required
                      className="block w-full rounded-xl border-0 bg-white/50 dark:bg-white/5 py-2.5 sm:py-3 px-4 text-slate-900 dark:text-white shadow-sm ring-1 ring-inset ring-slate-200 dark:ring-white/10 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6 outline-none transition-all hover:ring-slate-300 dark:hover:ring-white/20"
                      placeholder="例如: 张三"
                    />
                  </div>
                </div>

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
                      className="block w-full rounded-xl border-0 bg-white/50 dark:bg-white/5 py-2.5 sm:py-3 px-4 text-slate-900 dark:text-white shadow-sm ring-1 ring-inset ring-slate-200 dark:ring-white/10 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6 outline-none transition-all hover:ring-slate-300 dark:hover:ring-white/20"
                      placeholder="name@example.com"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="block text-xs sm:text-sm font-semibold leading-6 text-slate-900 dark:text-white ml-1">
                    密码
                  </label>
                  <div className="mt-1.5 sm:mt-2">
                    <input
                      id="password"
                      name="password"
                      type="password"
                      required
                      className="block w-full rounded-xl border-0 bg-white/50 dark:bg-white/5 py-2.5 sm:py-3 px-4 text-slate-900 dark:text-white shadow-sm ring-1 ring-inset ring-slate-200 dark:ring-white/10 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6 outline-none transition-all hover:ring-slate-300 dark:hover:ring-white/20"
                      placeholder="请输入密码"
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500 ml-1">密码长度至少 8 位，包含字母和数字。</p>
                </div>

                <div className="flex items-center gap-2 ml-1">
                  <input id="terms" type="checkbox" className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded text-primary focus:ring-primary border-gray-300 dark:border-gray-600 bg-white dark:bg-white/5" required />
                  <label htmlFor="terms" className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium">
                    我已阅读并同意 <a href="#" className="text-primary hover:underline">服务条款</a> 和 <a href="#" className="text-primary hover:underline">隐私政策</a>
                  </label>
                </div>

                {error && (
                  <div className="mb-4 flex items-center gap-3 p-4 bg-red-500/10 backdrop-blur-md border border-red-400/20 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="size-6 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-red-500 text-[16px]">error</span>
                    </div>
                    <p className="text-sm text-red-600 dark:text-red-400 font-bold leading-tight">{error}</p>
                  </div>
                )}

                <div className="pt-2">
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
                          创建中...
                        </>
                      ) : (
                        '注册账号'
                      )}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => navigateToView(View.LOGIN, { replace: true })}
                    className="mt-6 flex w-full justify-center text-xs font-bold text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
                  >
                    已有账号？去登录
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signup;
