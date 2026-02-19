import { useState, useEffect } from 'react';
import { supabase } from './supabase-client';
import { DatabaseService } from './database-service';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  created_at: string;
  updated_at: string;
  deletion_pending_until?: string;
  phone?: string;
  referral_code?: string;
  diagnoses_remaining?: number;
  interviews_remaining?: number;
  points_balance?: number;
  membership_tier?: string;
  avatar_url?: string;
  analysis_dossier_latest?: {
    id: string;
    createdAt: string;
    score: number;
    summary: string;
    targetCompany?: string;
    jdText?: string;
    scoreBreakdown?: {
      experience: number;
      skills: number;
      format: number;
    };
    suggestionsOverview?: {
      total: number;
      actionable?: number;
      pending?: number;
      accepted?: number;
      ignored?: number;
    };
    strengths?: string[];
    weaknesses?: string[];
    missingKeywords?: string[];
  };
  analysis_dossier_history?: Array<{
    id: string;
    createdAt: string;
    score: number;
    summary: string;
    targetCompany?: string;
    jdText?: string;
    scoreBreakdown?: {
      experience: number;
      skills: number;
      format: number;
    };
    suggestionsOverview?: {
      total: number;
      actionable?: number;
      pending?: number;
      accepted?: number;
      ignored?: number;
    };
    strengths?: string[];
    weaknesses?: string[];
    missingKeywords?: string[];
  }>;
}

// 缓存项接口
interface CacheItem {
  profile: UserProfile;
  timestamp: number;
}

// 本地缓存，存储用户信息
const userCache = new Map<string, CacheItem>();

// 缓存过期时间（10分钟）
const CACHE_EXPIRY = 10 * 60 * 1000;
const PROFILE_CACHE_KEY_PREFIX = 'user_profile_cache:';

// 缓存管理方法
const cacheWithExpiry = {
  set: (key: string, profile: UserProfile) => {
    const item: CacheItem = {
      profile,
      timestamp: Date.now()
    };
    userCache.set(key, item);
    try {
      localStorage.setItem(`${PROFILE_CACHE_KEY_PREFIX}${key}`, JSON.stringify(item));
    } catch (_err) {
      // Ignore localStorage write errors.
    }
  },
  get: (key: string): UserProfile | null => {
    let item = userCache.get(key);
    if (!item) {
      try {
        const raw = localStorage.getItem(`${PROFILE_CACHE_KEY_PREFIX}${key}`);
        if (raw) {
          const parsed = JSON.parse(raw) as CacheItem;
          if (parsed?.profile && typeof parsed.timestamp === 'number') {
            userCache.set(key, parsed);
            item = parsed;
          }
        }
      } catch (_err) {
        // Ignore localStorage parse errors.
      }
    }
    if (!item) return null;

    // 检查缓存是否过期
    if (Date.now() - item.timestamp > CACHE_EXPIRY) {
      userCache.delete(key);
      try {
        localStorage.removeItem(`${PROFILE_CACHE_KEY_PREFIX}${key}`);
      } catch (_err) {
        // Ignore localStorage remove errors.
      }
      return null;
    }

    return item.profile;
  },
  delete: (key: string) => {
    userCache.delete(key);
    try {
      localStorage.removeItem(`${PROFILE_CACHE_KEY_PREFIX}${key}`);
    } catch (_err) {
      // Ignore localStorage remove errors.
    }
  }
};

// 从localStorage获取用户信息
export const getUserFromLocalStorage = (): any => {
  try {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      return JSON.parse(userStr);
    }

    const sessionStr = localStorage.getItem('supabase_session');
    if (sessionStr) {
      const session = JSON.parse(sessionStr);
      return session.user;
    }

    return null;
  } catch (error) {
    console.error('Error getting user from localStorage:', error);
    return null;
  }
};

export const useUserProfile = (userId?: string, seedUser?: any) => {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadUserProfile = async () => {
      try {
        // Keep existing content stable while background refresh runs.
        setLoading((prev) => (userProfile ? prev : true));
        setError(null);

        // Get current authenticated user if no userId provided
        let targetUserId = userId;
        let authUser = seedUser || null;

        // 1. 优先从localStorage获取用户信息
        const localStorageUser = getUserFromLocalStorage();

        if (!targetUserId && authUser?.id) {
          targetUserId = authUser.id;
        }

        if (!targetUserId) {
          // 2. 尝试从supabase获取当前用户
          const { data: { user }, error: userError } = await supabase.auth.getUser();
          if (userError || !user) {
            console.error('No authenticated user found:', userError);
            setError('用户未登录');
            return;
          }
          targetUserId = user.id;
          authUser = user;
        } else if (localStorageUser && localStorageUser.id === targetUserId) {
          // 如果提供了userId且与localStorage中的用户匹配，使用localStorage中的用户信息
          authUser = localStorageUser;
        }

        console.log('Loading user profile for:', targetUserId);

        // 3. 检查内存缓存（先用缓存快速展示，再后台刷新最新值）
        const cachedProfile = cacheWithExpiry.get(targetUserId);
        if (cachedProfile) {
          console.log('User profile loaded from cache:', cachedProfile);
          setUserProfile(cachedProfile);
          setLoading(false);
        }

        // 4. 快速回退：如果有authUser，先使用它来显示基本信息
        if (authUser) {
          const quickProfile: UserProfile = {
            id: authUser.id,
            email: authUser.email || '',
            name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || '用户',
            created_at: authUser.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          console.log('Using quick auth user profile for initial load:', quickProfile);
          setUserProfile(quickProfile);
          // 不设置loading为false，继续加载完整信息
        }

        // 5. 尝试从数据库获取完整用户信息（异步，不阻塞UI）
        const profileResult = await DatabaseService.getUser(targetUserId);

        if (profileResult.success && profileResult.data) {
          console.log('User profile loaded from database:', profileResult.data);
          setUserProfile(profileResult.data);
          // 缓存用户信息
          cacheWithExpiry.set(targetUserId, profileResult.data);
        }
      } catch (err) {
        console.error('Error loading user profile:', err);
        // 如果发生错误，但已经显示了基本信息，不要覆盖
        if (!userProfile) {
          setError('加载用户信息失败');
        }
      } finally {
        setLoading(false);
      }
    };

    loadUserProfile();
  }, [userId, seedUser?.id]);

  return { userProfile, loading, error };
};
