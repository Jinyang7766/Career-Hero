import { buildApiUrl } from './api-config';
import { DatabaseService } from './database-service';
import { supabase } from './supabase-client';
import type { UserProfile } from './useUserProfile';
import { normalizeCareerProfile, type CareerProfile } from './career-profile-utils';

const isLikelyJwt = (token?: string | null) => {
  const raw = String(token || '').trim();
  return raw.split('.').length === 3;
};

const getBackendAuthToken = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = String(session?.access_token || '').trim();
    if (isLikelyJwt(token)) return token;
  } catch (_error) {
    // ignore
  }
  try {
    const sessionStr = localStorage.getItem('supabase_session');
    if (sessionStr) {
      const parsed = JSON.parse(sessionStr);
      const token = String(parsed?.access_token || parsed?.token || '').trim();
      if (isLikelyJwt(token)) return token;
    }
  } catch (_error) {
    // ignore
  }
  const legacy = String(localStorage.getItem('token') || '').trim();
  return isLikelyJwt(legacy) ? legacy : '';
};

type OrganizeCareerProfileInput = {
  rawExperienceText: string;
  existingProfile?: CareerProfile | null;
};

export const organizeCareerProfileWithAI = async ({
  rawExperienceText,
  existingProfile,
}: OrganizeCareerProfileInput): Promise<{ profile: CareerProfile; analysisModel?: string | null; note?: string }> => {
  const token = await getBackendAuthToken();
  if (!token) {
    throw new Error('登录已过期，请重新登录后再试');
  }
  const response = await fetch(buildApiUrl('/api/ai/organize-career-profile'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token.trim()}`,
    },
    body: JSON.stringify({
      rawExperienceText,
      existingProfile: existingProfile || null,
    }),
  });
  const payload = await response.json().catch(() => ({} as any));
  if (!response.ok) {
    throw new Error(String(payload?.error || '职业画像整理失败'));
  }
  const normalized = normalizeCareerProfile(payload?.profile);
  if (!normalized) {
    throw new Error('职业画像整理结果无效，请稍后重试');
  }
  return {
    profile: normalized,
    analysisModel: payload?.analysis_model || null,
    note: payload?.note ? String(payload.note) : undefined,
  };
};

export const persistCareerProfileToUser = async (
  userId: string,
  profile: CareerProfile
): Promise<UserProfile | null> => {
  const targetUserId = String(userId || '').trim();
  if (!targetUserId) throw new Error('缺少用户ID');

  const latestUser = await DatabaseService.getUser(targetUserId);
  if (!latestUser.success) {
    throw new Error(String(latestUser.error?.message || '读取用户资料失败'));
  }
  const baseUser = (latestUser.data || {}) as any;
  const history = Array.isArray(baseUser?.career_profile_history) ? baseUser.career_profile_history : [];
  const nextHistory = [profile, ...history].slice(0, 30);

  const update = await DatabaseService.updateUser(targetUserId, {
    career_profile_latest: profile,
    career_profile_history: nextHistory,
  });
  if (!update.success) {
    const errorMessage = String((update as any)?.error?.message || (update as any)?.error || '保存职业画像失败');
    if (errorMessage.includes('career_profile_latest') || errorMessage.includes('career_profile_history')) {
      throw new Error('数据库尚未创建 career_profile 字段，请先执行最新 SQL 迁移。');
    }
    throw new Error(errorMessage);
  }

  return {
    ...(baseUser || {}),
    career_profile_latest: profile,
    career_profile_history: nextHistory,
  } as UserProfile;
};
