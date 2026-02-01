import { useState, useEffect } from 'react';
import { supabase } from './supabase-client';
import { DatabaseService } from './database-service';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export const useUserProfile = (userId?: string) => {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadUserProfile = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get current authenticated user if no userId provided
        let targetUserId = userId;
        if (!targetUserId) {
          const { data: { user }, error: userError } = await supabase.auth.getUser();
          if (userError || !user) {
            console.error('No authenticated user found:', userError);
            setError('用户未登录');
            return;
          }
          targetUserId = user.id;
        }

        console.log('Loading user profile for:', targetUserId);

        // Try to get user profile from database first
        const profileResult = await DatabaseService.getUser(targetUserId);
        
        if (profileResult.success && profileResult.data) {
          console.log('User profile loaded from database:', profileResult.data);
          setUserProfile(profileResult.data);
        } else {
          console.log('User profile not found in database, using auth user metadata');
          
          // Fallback to auth user metadata
          const { data: { user }, error: authError } = await supabase.auth.getUser();
          
          if (authError || !user) {
            console.error('Error getting auth user:', authError);
            setError('获取用户信息失败');
            return;
          }

          // Create profile from auth user data
          const authProfile: UserProfile = {
            id: user.id,
            email: user.email || '',
            name: user.user_metadata?.name || user.email?.split('@')[0] || '用户',
            created_at: user.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          console.log('Using auth user profile:', authProfile);
          setUserProfile(authProfile);
        }
      } catch (err) {
        console.error('Error loading user profile:', err);
        setError('加载用户信息失败');
      } finally {
        setLoading(false);
      }
    };

    loadUserProfile();
  }, [userId]);

  return { userProfile, loading, error };
};
