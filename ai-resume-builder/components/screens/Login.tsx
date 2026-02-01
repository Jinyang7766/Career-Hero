import React, { useState } from 'react';
import { View, ScreenProps } from '../../types';
import { AuthService } from '../../src/auth-service';

const Login: React.FC<ScreenProps> = ({ setCurrentView, onLogin }) => {
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
      const result = await AuthService.login(email, password);

      if (result.success) {
        localStorage.setItem('authToken', result.session?.access_token || '');
        localStorage.setItem('currentUser', JSON.stringify(result.user));
        onLogin(result.user);
        setCurrentView(View.DASHBOARD);
      } else {
        setError(result.error || '登录失败');
      }
    } catch (err) {
      setError('网络错误，请稍后重试');
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
                    onClick={() => setCurrentView(View.FORGOT_PASSWORD)}
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
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
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
                <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M12.0003 20.45C16.667 20.45 20.5843 17.2721 20.5843 12.7279C20.5843 12.0366 20.4988 11.3664 20.3392 10.7279H12.0003V14.1352H16.8122C16.6045 15.2533 15.4241 17.0458 12.0003 17.0458C9.11333 17.0458 6.66699 15.1091 5.79461 12.4839C5.57242 11.8152 5.45483 11.1026 5.45483 10.364C5.45483 9.62531 5.57242 8.91272 5.79461 8.24399C6.66699 5.61884 9.11333 3.68209 12.0003 3.68209C13.5684 3.68209 14.9625 4.22502 16.0699 5.12297L18.5714 2.62145C16.8488 1.01569 14.5912 0 12.0003 0C7.26284 0 3.16629 2.70889 1.15173 6.70288C0.312932 8.36531 0 10.1557 0 12C0 13.8443 0.312932 15.6347 1.15173 17.2971C3.16629 21.2911 7.26284 24 12.0003 24C15.2255 24 18.2575 22.8631 20.5113 20.9754L17.756 18.2612C16.2996 19.6481 14.2882 20.45 12.0003 20.45Z"
                    fill="currentColor"
                  />
                </svg>
                <span className="text-sm">Google</span>
              </button>
              <button className="flex w-full items-center justify-center gap-3 rounded-xl bg-white dark:bg-white/5 px-3 py-2.5 text-sm font-semibold text-slate-900 dark:text-white shadow-sm ring-1 ring-inset ring-slate-200 dark:ring-white/10 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors">
                <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M13.135 6.05675C13.88 5.145 14.385 3.87325 14.245 2.5C13.065 2.54625 11.635 3.29 10.795 4.26625C10.05 5.1225 9.52 6.4175 9.68 7.78125C10.97 7.79 12.295 6.96875 13.135 6.05675ZM16.59 15.3538C15.745 16.58 14.385 18.4975 12.275 18.4538C10.22 18.4013 9.565 17.2288 7.215 17.2288C4.855 17.2288 4.095 18.4013 2.155 18.4975C-0.075 18.6025 -1.745 10.925 1.775 5.8675C3.515 3.37375 6.275 3.295 7.025 3.295C8.75 3.295 9.5 4.35375 11.5 4.35375C13.525 4.35375 14.075 3.295 16.035 3.295C16.85 3.295 19.16 3.4 20.65 5.57875C20.535 5.6575 17.845 7.2325 17.865 10.39C17.895 14.085 20.8 15.2838 20.85 15.3013C20.83 15.3713 20.395 16.8938 19.345 18.4288C18.375 19.8375 17.41 21.2113 15.86 21.255C13.845 21.3075 13.33 20.0813 10.97 20.0813C8.62 20.0813 7.995 21.3075 6.095 21.255C4.665 21.2113 3.635 19.9513 2.71 18.6025C1.195 16.3938 0.5 13.5688 0.5 10.7438C0.5 6.995 2.925 4.70375 6.55 4.63375C7.95 4.6075 9.245 5.3425 10.075 5.3425C10.905 5.3425 12.515 4.6075 13.865 4.63375C16.14 4.68625 18.23 5.75375 19.565 7.69375C19.46 7.755 15.935 9.82 15.905 13.8975C15.89 15.9613 16.7 17.8338 17.915 19.1463C17.42 20.5638 16.63 21.7263 15.54 23.3188C14.77 24.4375 13.985 25.5 13.135 25.5C12.355 25.5 11.66 25.0713 11.235 24.3813C10.81 23.6913 10.75 22.8163 10.75 22.0288C10.75 21.5738 10.825 21.1363 10.97 20.7338C11.51 19.2375 12.57 18.0125 13.935 17.2075C15.3 16.4025 16.89 15.965 18.5 15.965C19.235 15.965 19.945 16.07 20.615 16.2625C20.485 16.0175 20.335 15.7813 20.165 15.5538L16.59 15.3538Z"
                  />
                </svg>
                <span className="text-sm">Apple</span>
              </button>
            </div>
          </div>

          <p className="mt-10 text-center text-sm text-slate-500 dark:text-slate-400">
            还没有账号？{' '}
            <button 
              onClick={() => setCurrentView(View.SIGNUP)}
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