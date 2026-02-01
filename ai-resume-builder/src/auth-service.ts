import { supabase } from './supabase-client';

export class AuthService {
  // 注册用户 - 使用触发器自动创建数据库记录
  static async signUp(email: string, password: string, name: string) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name,
          },
          emailRedirectTo: `${window.location.origin}/login`
        }
      });

      if (error) {
        console.error('Signup error:', error);
        return { success: false, error };
      }

      // 数据库记录由触发器自动创建
      console.log('User created successfully, database record created by trigger');
      
      return { 
        success: true, 
        data,
        needsEmailVerification: !data.session 
      };
    } catch (err) {
      console.error('Signup exception:', err);
      return { success: false, error: err };
    }
  }

  // 登录用户
  static async signIn(email: string, password: string) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Signin error:', error);
        return { success: false, error };
      }

      return { success: true, data };
    } catch (err) {
      console.error('Signin exception:', err);
      return { success: false, error: err };
    }
  }

  // 获取当前用户
  static async getCurrentUser() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (error) {
        console.error('Get user error:', error);
        return { success: false, error, user: null };
      }

      return { success: true, user };
    } catch (err) {
      console.error('Get user exception:', err);
      return { success: false, error: err, user: null };
    }
  }

  // 登出用户
  static async signOut() {
    try {
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error('Signout error:', error);
        return { success: false, error };
      }

      return { success: true };
    } catch (err) {
      console.error('Signout exception:', err);
      return { success: false, error: err };
    }
  }

  // 手动创建用户记录（备选方案）
  static async createUserRecord(userId: string, email: string, name: string) {
    try {
      const { error } = await supabase.rpc('create_user_record', {
        user_id: userId,
        user_email: email,
        user_name: name
      });

      if (error) {
        console.error('Create user record error:', error);
        return { success: false, error };
      }

      return { success: true };
    } catch (err) {
      console.error('Create user record exception:', err);
      return { success: false, error: err };
    }
  }
}
