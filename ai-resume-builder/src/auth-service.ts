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
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name || '',
          }
        }
      });

      if (error) throw error;

      return { 
        success: true, 
        user: data.user,
        message: '注册成功！请检查邮箱验证链接。'
      };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message || '注册失败' 
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
