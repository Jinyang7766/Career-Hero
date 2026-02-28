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
  career_profile_latest?: {
    id: string;
    createdAt: string;
    source?: string;
    summary: string;
    careerHighlights?: string[];
    coreSkills?: string[];
    constraints?: string[];
    experiences?: Array<{
      title: string;
      period?: string;
      organization?: string;
      actions?: string;
      results?: string;
      skills?: string[];
      inResume?: 'yes' | 'no' | 'unknown';
      confidence?: 'high' | 'medium' | 'low';
      evidence?: string;
    }>;
    rawInput?: string;
  };
  career_profile_history?: Array<{
    id: string;
    createdAt: string;
    source?: string;
    summary: string;
    careerHighlights?: string[];
    coreSkills?: string[];
    constraints?: string[];
    experiences?: Array<{
      title: string;
      period?: string;
      organization?: string;
      actions?: string;
      results?: string;
      skills?: string[];
      inResume?: 'yes' | 'no' | 'unknown';
      confidence?: 'high' | 'medium' | 'low';
      evidence?: string;
    }>;
    rawInput?: string;
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
const PROFILE_REFRESH_THROTTLE_MS = 60 * 1000;

const inflightProfileRequests = new Map<string, Promise<UserProfile | null>>();
const lastProfileFetchAt = new Map<string, number>();

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

export const primeUserProfileCache = (userId: string, profile: UserProfile) => {
  if (!userId || !profile) return;
  cacheWithExpiry.set(userId, profile);
  lastProfileFetchAt.set(userId, Date.now());
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

        // 3. 检查内存缓存（先用缓存快速展示）
        const cachedProfile = cacheWithExpiry.get(targetUserId);
        if (cachedProfile) {
          console.log('User profile loaded from cache:', cachedProfile);
          setUserProfile(cachedProfile);
          setLoading(false);
        }

        // 4. 快速回退：如果没有缓存且有 authUser，先使用基础信息显示
        if (!cachedProfile && authUser) {
          const quickProfile: UserProfile = {
            id: authUser.id,
            email: authUser.email || '',
            name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || '用户',
            created_at: authUser.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
            membership_tier: authUser.user_metadata?.membership_tier || (authUser as any)?.membership_tier || undefined,
            points_balance: Number((authUser as any)?.user_metadata?.points_balance ?? (authUser as any)?.points_balance ?? 0),
          };

          console.log('Using quick auth user profile for initial load:', quickProfile);
          setUserProfile(quickProfile);
          // 不设置loading为false，继续加载完整信息
        }

        // 5. 数据库刷新节流：缓存命中且最近刚刷新过时，直接复用缓存，避免高频 users?select 请求
        const lastFetchAt = lastProfileFetchAt.get(targetUserId) || 0;
        const shouldThrottleRefresh =
          !!cachedProfile && (Date.now() - lastFetchAt) < PROFILE_REFRESH_THROTTLE_MS;
        if (shouldThrottleRefresh) {
          return;
        }

        // 6. 同用户请求去重：多个页面并发读取时复用同一请求
        let inflight = inflightProfileRequests.get(targetUserId);
        if (!inflight) {
          inflight = (async () => {
            const profileResult = await DatabaseService.getUser(targetUserId);
            if (profileResult.success && profileResult.data) {
              return profileResult.data as UserProfile;
            }
            return null;
          })();
          inflightProfileRequests.set(targetUserId, inflight);
        }

        let profileData: UserProfile | null = null;
        try {
          profileData = await inflight;
          lastProfileFetchAt.set(targetUserId, Date.now());
        } finally {
          inflightProfileRequests.delete(targetUserId);
        }

        if (profileData) {
          console.log('User profile loaded from database:', profileData);
          setUserProfile(profileData);
          // 缓存用户信息
          cacheWithExpiry.set(targetUserId, profileData);
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
