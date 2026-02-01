import { supabase } from './supabase-client';

export interface Resume {
  id: string;
  user_id: string;
  title: string;
  resume_data: any;
  score: number;
  has_dot: boolean;
  created_at: string;
  updated_at: string;
}

export class ResumeService {
  // 获取用户所有简历
  static async getUserResumes() {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) {
        throw new Error('用户未登录');
      }

      const { data, error } = await supabase
        .from('resumes')
        .select('*')
        .eq('user_id', user.data.user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      return { success: true, resumes: data || [] };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message || '获取简历失败' 
      };
    }
  }

  // 创建新简历
  static async createResume(title: string, resumeData: any) {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) {
        throw new Error('用户未登录');
      }

      const { data, error } = await supabase
        .from('resumes')
        .insert({
          user_id: user.data.user.id,
          title,
          resume_data: resumeData,
          score: 0,
          has_dot: false
        })
        .select()
        .single();

      if (error) throw error;

      return { success: true, resume: data };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message || '创建简历失败' 
      };
    }
  }

  // 更新简历
  static async updateResume(id: string, title: string, resumeData: any) {
    try {
      const { data, error } = await supabase
        .from('resumes')
        .update({
          title,
          resume_data: resumeData,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return { success: true, resume: data };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message || '更新简历失败' 
      };
    }
  }

  // 获取单个简历
  static async getResume(id: string) {
    try {
      const { data, error } = await supabase
        .from('resumes')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      return { success: true, resume: data };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message || '获取简历失败' 
      };
    }
  }

  // 删除简历
  static async deleteResume(id: string) {
    try {
      const { error } = await supabase
        .from('resumes')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message || '删除简历失败' 
      };
    }
  }
}
