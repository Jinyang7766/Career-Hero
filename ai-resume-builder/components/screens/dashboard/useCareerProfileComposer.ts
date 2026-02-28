import { useState } from 'react';
import { organizeCareerProfileWithAI, persistCareerProfileToUser } from '../../../src/career-profile-service';
import { getLatestCareerProfile, normalizeCareerProfile, type CareerProfile } from '../../../src/career-profile-utils';
import { primeUserProfileCache } from '../../../src/useUserProfile';

type Params = {
  currentUserId?: string;
  userProfile: any;
};

const stripRawInput = (profile: CareerProfile | null): CareerProfile | null => {
  if (!profile) return null;
  return {
    ...profile,
    rawInput: '',
  };
};

export const useCareerProfileComposer = ({ currentUserId, userProfile }: Params) => {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [localProfile, setLocalProfile] = useState<any>(null);

  const profile = stripRawInput((localProfile || getLatestCareerProfile(userProfile)) as CareerProfile | null);
  const summary = String(profile?.summary || '').trim();
  const experienceCount = Array.isArray(profile?.experiences) ? profile.experiences.length : 0;
  const updatedAt = String(profile?.createdAt || '').trim();
  const initialText = '';

  const saveCareerProfile = async (rawText: string) => {
    const userId = String(currentUserId || '').trim();
    if (!userId) {
      setError('登录状态异常，请重新登录后再试');
      return false;
    }
    setIsSaving(true);
    setError('');
    setHint('');
    try {
      const { profile: generated, note } = await organizeCareerProfileWithAI({
        rawExperienceText: rawText,
        existingProfile: profile || null,
      });
      const profileToPersist = stripRawInput(generated as CareerProfile | null);
      if (!profileToPersist) {
        setError('职业画像保存失败，请稍后重试');
        return false;
      }
      const updatedUser = await persistCareerProfileToUser(userId, profileToPersist);
      if (updatedUser) {
        primeUserProfileCache(userId, updatedUser as any);
      }
      setLocalProfile(profileToPersist);
      setHint(note || '职业画像已更新，后续 JD 诊断与简历优化会优先参照该画像。');
      return true;
    } catch (err: any) {
      setError(String(err?.message || '职业画像保存失败，请稍后重试'));
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const saveStructuredCareerProfile = async (draftProfile: CareerProfile) => {
    const userId = String(currentUserId || '').trim();
    if (!userId) {
      setError('登录状态异常，请重新登录后再试');
      return false;
    }
    const normalized = normalizeCareerProfile({
      ...(draftProfile || {}),
      id: String((draftProfile as any)?.id || `career_profile_${Date.now()}`),
      createdAt: String((draftProfile as any)?.createdAt || new Date().toISOString()),
      source: String((draftProfile as any)?.source || 'manual_self_report'),
      rawInput: '',
    });
    if (!normalized) {
      setError('画像内容为空，请先补充至少一条有效经历或总结');
      return false;
    }

    setIsSaving(true);
    setError('');
    setHint('');
    try {
      const profileToPersist = stripRawInput(normalized);
      if (!profileToPersist) {
        setError('职业画像保存失败，请稍后重试');
        return false;
      }
      const updatedUser = await persistCareerProfileToUser(userId, profileToPersist);
      if (updatedUser) {
        primeUserProfileCache(userId, updatedUser as any);
      }
      setLocalProfile(profileToPersist);
      setHint('职业画像编辑已保存，后续 JD 诊断与简历优化将优先参照该画像。');
      return true;
    } catch (err: any) {
      setError(String(err?.message || '职业画像保存失败，请稍后重试'));
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return {
    profile,
    summary,
    experienceCount,
    updatedAt,
    initialText,
    isSaving,
    error,
    hint,
    saveCareerProfile,
    saveStructuredCareerProfile,
  };
};
