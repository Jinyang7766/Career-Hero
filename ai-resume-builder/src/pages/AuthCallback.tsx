import React, { useEffect } from 'react';
import { supabase } from '../supabase-client';

const AuthCallback: React.FC = () => {
  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        console.log('处理认证回调...');
        
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('认证回调错误:', error);
          window.location.href = '/?error=auth_failed';
          return;
        }
        
        if (data.session) {
          console.log('认证成功，用户已登录');
          localStorage.setItem('authToken', data.session.access_token);
          localStorage.setItem('currentUser', JSON.stringify(data.session.user));
          window.location.href = '/?auth=success';
        } else {
          console.log('未找到会话');
          window.location.href = '/?error=no_session';
        }
      } catch (error) {
        console.error('认证回调异常:', error);
        window.location.href = '/?error=callback_failed';
      }
    };

    handleAuthCallback();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background-light dark:bg-background-dark">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-white">正在验证邮箱...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
