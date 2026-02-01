import { supabase } from './supabase-client';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
}

export class AuthService {
  // 注册
  static async signup(email: string, password: string, name?: string) {
    try {
      console.log('开始注册流程...', { email, name: name || '' });
      console.log('Supabase URL:', import.meta.env.VITE_SUPABASE_URL);
      
      // 获取当前环境的重定向URL
      const redirectUrl = import.meta.env.PROD 
        ? 'https://career-hero-frontend.vercel.app' 
        : 'http://localhost:5173';
      
      console.log('使用重定向URL:', redirectUrl);

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name || '',
          },
          emailRedirectTo: redirectUrl
        }
      });

      console.log('Supabase注册响应:', { data, error });

      if (error) {
        console.error('注册错误详情:', error);
        throw error;
      }

      // 检查用户是否已经存在
      if (data.user && !data.user.email_confirmed_at) {
        console.log('用户已创建，等待邮箱验证');
        return { 
          success: true, 
          user: data.user,
          message: '注册成功！请检查邮箱验证链接。如果未收到邮件，请检查垃圾邮件文件夹。'
        };
      } else if (data.user && data.user.email_confirmed_at) {
        console.log('邮箱已验证，直接登录');
        return { 
          success: true, 
          user: data.user,
          message: '登录成功！'
        };
      } else {
        console.log('注册状态未知');
        return { 
          success: true, 
          user: null,
          message: '注册请求已提交，请检查邮箱。'
        };
      }
    } catch (error: any) {
      console.error('完整错误对象:', error);
      console.error('错误信息:', error.message);
      console.error('错误状态:', error.status);
      console.error('错误代码:', error.code);
      
      // 特殊错误处理
      if (error.message?.includes('User already registered')) {
        return { 
          success: false, 
          error: '该邮箱已经被注册，请直接登录或使用其他邮箱。'
        };
      }
      
      return { 
        success: false, 
        error: error.message || '注册失败',
        details: error
      };
    }
  }

  // 测试邮件配置
  static async testEmailConfig() {
    try {
      console.log('测试邮件配置...');
      console.log('Supabase URL:', import.meta.env.VITE_SUPABASE_URL);
      
      // 尝试发送测试邮件（使用一个临时邮箱）
      const testEmail = 'test@example.com';
      const { data, error } = await supabase.auth.signUp({
        email: testEmail,
        password: 'testpassword123',
        options: {
          data: {
            name: 'Test User',
          },
          emailRedirectTo: import.meta.env.PROD 
            ? 'https://career-hero-frontend.vercel.app' 
            : 'http://localhost:5173'
        }
      });

      console.log('测试邮件发送结果:', { data, error });
      
      return { 
        success: !error, 
        error: error?.message,
        data 
      };
    } catch (error: any) {
      console.error('测试邮件配置失败:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  // 登录
  static async login(email: string, password: string) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      return { 
        success: true, 
        user: data.user,
        session: data.session
      };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message || '登录失败' 
      };
    }
  }

  // 登出
  static async logout() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      return { success: true };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message || '登出失败' 
      };
    }
  }

  // 获取当前用户
  static async getCurrentUser() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    } catch (error) {
      return null;
    }
  }

  // 监听认证状态变化
  static onAuthStateChange(callback: (user: any) => void) {
    return supabase.auth.onAuthStateChange((_event, session) => {
      callback(session?.user || null);
    });
  }
}
