import { supabase } from './supabase-client';

export class DatabaseService {
  // 创建用户记录
  static async createUser(userId: string, email: string, name: string) {
    try {
      const { error } = await supabase
        .from('users')
        .insert({
          id: userId,
          email: email,
          name: name,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      
      if (error) {
        console.error('Error creating user record:', error);
        return { success: false, error };
      }
      
      return { success: true };
    } catch (err) {
      console.error('Database operation failed:', err);
      return { success: false, error: err };
    }
  }

  // 获取用户信息
  static async getUser(userId: string) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) {
        console.error('Error fetching user:', error);
        return { success: false, error, data: null };
      }
      
      return { success: true, data };
    } catch (err) {
      console.error('Database operation failed:', err);
      return { success: false, error: err, data: null };
    }
  }

  // 更新用户信息
  static async updateUser(userId: string, updates: any) {
    try {
      const { error } = await supabase
        .from('users')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);
      
      if (error) {
        console.error('Error updating user:', error);
        return { success: false, error };
      }
      
      return { success: true };
    } catch (err) {
      console.error('Database operation failed:', err);
      return { success: false, error: err };
    }
  }

  // 创建简历记录
  static async createResume(userId: string, title: string, resumeData: any) {
    try {
      const { data, error } = await supabase
        .from('resumes')
        .insert({
          user_id: userId,
          title: title,
          resume_data: resumeData,
          score: 0,
          has_dot: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (error) {
        console.error('Error creating resume:', error);
        return { success: false, error, data: null };
      }
      
      return { success: true, data };
    } catch (err) {
      console.error('Database operation failed:', err);
      return { success: false, error: err, data: null };
    }
  }

  // 获取用户的所有简历
  static async getUserResumes(userId: string) {
    try {
      const { data, error } = await supabase
        .from('resumes')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching resumes:', error);
        return { success: false, error, data: [] };
      }
      
      return { success: true, data: data || [] };
    } catch (err) {
      console.error('Database operation failed:', err);
      return { success: false, error: err, data: [] };
    }
  }

  // 更新简历
  static async updateResume(resumeId: string, updates: any) {
    try {
      const { data, error } = await supabase
        .from('resumes')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', resumeId)
        .select()
        .single();
      
      if (error) {
        console.error('Error updating resume:', error);
        return { success: false, error, data: null };
      }
      
      return { success: true, data };
    } catch (err) {
      console.error('Database operation failed:', err);
      return { success: false, error: err, data: null };
    }
  }

  // 删除简历
  static async deleteResume(resumeId: string) {
    try {
      const { error } = await supabase
        .from('resumes')
        .delete()
        .eq('id', resumeId);
      
      if (error) {
        console.error('Error deleting resume:', error);
        return { success: false, error };
      }
      
      return { success: true };
    } catch (err) {
      console.error('Database operation failed:', err);
      return { success: false, error: err };
    }
  }
}
