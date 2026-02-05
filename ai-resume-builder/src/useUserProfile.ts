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

// 本地缓存，存储用户信息
const userCache = new Map<string, UserProfile>();

// 缓存过期时间（10分钟）
const CACHE_EXPIRY = 10 * 60 * 1000;

// 缓存项接口
interface CacheItem {
  profile: UserProfile;
  timestamp: number;
}

// 扩展Map，添加缓存管理方法
const cacheWithExpiry = {
  set: (key: string, profile: UserProfile) => {
    userCache.set(key, {
      profile,
      timestamp: Date.now()
    } as any);
  },
  get: (key: string): UserProfile | null => {
    const item = userCache.get(key) as CacheItem | undefined;
    if (!item) return null;
    
    // 检查缓存是否过期
    if (Date.now() - item.timestamp > CACHE_EXPIRY) {
      userCache.delete(key);
      return null;
    }
    
    return item.profile;
  },
  delete: (key: string) => {
    userCache.delete(key);
  }
};

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
        let authUser = null;
        
        if (!targetUserId) {
          const { data: { user }, error: userError } = await supabase.auth.getUser();
          if (userError || !user) {
            console.error('No authenticated user found:', userError);
            setError('用户未登录');
            return;
          }
          targetUserId = user.id;
          authUser = user;
        }

        console.log('Loading user profile for:', targetUserId);

        // 1. 先检查缓存
        const cachedProfile = cacheWithExpiry.get(targetUserId);
        if (cachedProfile) {
          console.log('User profile loaded from cache:', cachedProfile);
          setUserProfile(cachedProfile);
          setLoading(false);
          return;
        }

        // 2. 尝试从数据库获取用户信息
        const profileResult = await DatabaseService.getUser(targetUserId);
        
        if (profileResult.success && profileResult.data) {
          console.log('User profile loaded from database:', profileResult.data);
          setUserProfile(profileResult.data);
          // 缓存用户信息
          cacheWithExpiry.set(targetUserId, profileResult.data);
        } else {
          console.log('User profile not found in database, using auth user metadata');
          
          // Fallback to auth user metadata
          if (!authUser) {
            const { data: { user }, error: authError } = await supabase.auth.getUser();
            if (authError || !user) {
              console.error('Error getting auth user:', authError);
              setError('获取用户信息失败');
              return;
            }
            authUser = user;
          }

          // Create profile from auth user data
          const authProfile: UserProfile = {
            id: authUser.id,
            email: authUser.email || '',
            name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || '用户',
            created_at: authUser.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          console.log('Using auth user profile:', authProfile);
          setUserProfile(authProfile);
          // 缓存用户信息
          cacheWithExpiry.set(targetUserId, authProfile);
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
