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
      console.log('=== DatabaseService.createResume 调试信息 ===');
      console.log('Creating resume:', { userId, title });
      console.log('Resume data validation:', {
        isObject: typeof resumeData === 'object',
        isNull: resumeData === null,
        isUndefined: resumeData === undefined,
        keys: resumeData ? Object.keys(resumeData) : [],
        size: resumeData ? JSON.stringify(resumeData).length : 0,
        hasPersonalInfo: resumeData?.personalInfo,
        hasWorkExps: resumeData?.workExps,
        hasEducations: resumeData?.educations,
        hasSkills: resumeData?.skills
      });
      
      // 验证简历数据
      if (!resumeData || typeof resumeData !== 'object') {
        console.error('❌ Invalid resume data: not an object');
        return { success: false, error: new Error('简历数据无效'), data: null };
      }
      
      if (Object.keys(resumeData).length === 0) {
        console.error('❌ Invalid resume data: empty object');
        return { success: false, error: new Error('简历数据为空'), data: null };
      }
      
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
      
      console.log('Supabase insert result:', { data, error });
      
      if (error) {
        console.error('❌ Error creating resume:', error);
        console.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        return { success: false, error, data: null };
      }
      
      console.log('✅ Resume created successfully:', data);
      return { success: true, data };
    } catch (err) {
      console.error('❌ Database operation failed:', err);
      return { success: false, error: err, data: null };
    }
  }

  // 获取用户的所有简历
  static async getUserResumes(userId: string) {
    try {
      console.log('=== DatabaseService.getUserResumes 调试信息 ===');
      console.log('Querying resumes for user:', userId);
      
      const { data, error } = await supabase
        .from('resumes')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      console.log('Supabase query result:', { data, error });
      
      if (error) {
        console.error('❌ Error fetching resumes:', error);
        console.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        return { success: false, error, data: [] };
      }
      
      console.log('✅ Successfully fetched resumes:', {
        count: data?.length || 0,
        resumeIds: data?.map(r => r.id) || [],
        resumeTitles: data?.map(r => r.title) || [],
        resumeDataStatus: data?.map(r => ({
          id: r.id,
          title: r.title,
          hasResumeData: !!r.resume_data,
          resumeDataKeys: r.resume_data ? Object.keys(r.resume_data) : [],
          resumeDataSize: r.resume_data ? JSON.stringify(r.resume_data).length : 0
        })) || []
      });
      
      return { success: true, data: data || [] };
    } catch (err) {
      console.error('❌ Database operation failed:', err);
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

  // 记录 AI 建议评分
  static async createSuggestionFeedback(feedback: {
    userId: string;
    resumeId?: string | number | null;
    suggestionId: string;
    rating: 'up' | 'down';
    title?: string;
    reasonMasked?: string;
    originalValueMasked?: any;
    suggestedValueMasked?: any;
  }) {
    try {
      const { error } = await supabase
        .from('ai_suggestion_feedback')
        .insert({
          user_id: feedback.userId,
          resume_id: feedback.resumeId ?? null,
          suggestion_id: feedback.suggestionId,
          rating: feedback.rating,
          title: feedback.title,
          reason_masked: feedback.reasonMasked ?? null,
          original_value_masked: feedback.originalValueMasked ?? null,
          suggested_value_masked: feedback.suggestedValueMasked ?? null,
          created_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error creating suggestion feedback:', error);
        return { success: false, error };
      }

      return { success: true };
    } catch (err) {
      console.error('Database operation failed:', err);
      return { success: false, error: err };
    }
  }
}
