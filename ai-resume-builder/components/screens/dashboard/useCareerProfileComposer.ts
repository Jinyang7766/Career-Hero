import { useMemo, useState } from 'react';
import { organizeCareerProfileWithAI, persistCareerProfileToUser } from '../../../src/career-profile-service';
import {
  getLatestCareerProfile,
  normalizeCareerProfile,
  resolveCareerProfileTargetRole,
  type CareerProfile,
} from '../../../src/career-profile-utils';
import { primeUserProfileCache } from '../../../src/useUserProfile';
import { toast } from '../../../src/ui/dialogs';

type Params = {
  currentUserId?: string;
  userProfile: any;
};

type ProfileExtras = Partial<{
  mbti: string;
  personality: string;
  workStyle: string;
  careerGoal: string;
  targetRole: string;
  jobDirection: string;
  targetSalary: string;
}>;

type SaveCareerProfileOptions = {
  profileExtras?: ProfileExtras;
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
  const [localProfile, setLocalProfile] = useState<any>(null);

  const profile = useMemo(
    () => stripRawInput((localProfile || getLatestCareerProfile(userProfile)) as CareerProfile | null),
    [localProfile, userProfile]
  );
  const summary = String(profile?.summary || '').trim();
  const experienceCount = Array.isArray(profile?.experiences) ? profile.experiences.length : 0;
  const updatedAt = String(profile?.createdAt || '').trim();
  const initialText = '';

  const saveCareerProfile = async (rawText: string, options?: SaveCareerProfileOptions) => {
    const userId = String(currentUserId || '').trim();
    if (!userId) {
      toast('登录状态异常，请重新登录后再试', 'error');
      return false;
    }
    setIsSaving(true);
    try {
      const { profile: generated, note } = await organizeCareerProfileWithAI({
        rawExperienceText: rawText,
        existingProfile: profile || null,
      });
      const profileToPersist = stripRawInput(generated as CareerProfile | null);
      if (!profileToPersist) {
        toast('职业画像保存失败，请稍后重试', 'error');
        return false;
      }
      const extras = options?.profileExtras || {};
      const targetRoleCandidate = String(
        extras.targetRole ||
        extras.jobDirection ||
        profileToPersist.personalInfo?.title ||
        profileToPersist.targetRole ||
        profileToPersist.jobDirection ||
        ''
      ).trim();
      const canonicalTargetRole = resolveCareerProfileTargetRole({
        ...profileToPersist,
        targetRole: targetRoleCandidate,
        jobDirection: targetRoleCandidate,
      });
      const profileWithExtras = {
        ...profileToPersist,
        mbti: String(extras.mbti || profileToPersist.mbti || '').trim(),
        personality: String(extras.personality || profileToPersist.personality || '').trim(),
        workStyle: String(extras.workStyle || profileToPersist.workStyle || '').trim(),
        careerGoal: String(extras.careerGoal || profileToPersist.careerGoal || '').trim(),
        targetRole: canonicalTargetRole,
        jobDirection: canonicalTargetRole,
        targetSalary: String(extras.targetSalary || profileToPersist.targetSalary || '').trim(),
      };
      const updatedUser = await persistCareerProfileToUser(userId, profileWithExtras as CareerProfile);
      if (updatedUser) {
        primeUserProfileCache(userId, updatedUser as any);
      }
      setLocalProfile(profileWithExtras);
      if (note) toast(note, 'success');
      return true;
    } catch (err: any) {
      toast(String(err?.message || '职业画像保存失败，请稍后重试'), 'error');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const saveStructuredCareerProfile = async (draftProfile: CareerProfile) => {
    const userId = String(currentUserId || '').trim();
    if (!userId) {
      toast('登录状态异常，请重新登录后再试', 'error');
      return false;
    }
    const targetRoleCandidate = resolveCareerProfileTargetRole(draftProfile);
    const normalized = normalizeCareerProfile({
      ...(draftProfile || {}),
      id: String((draftProfile as any)?.id || `career_profile_${Date.now()}`),
      createdAt: String((draftProfile as any)?.createdAt || new Date().toISOString()),
      source: String((draftProfile as any)?.source || 'manual_self_report'),
      targetRole: targetRoleCandidate,
      jobDirection: targetRoleCandidate || String((draftProfile as any)?.jobDirection || '').trim(),
      personalInfo: {
        ...((draftProfile as any)?.personalInfo || {}),
        title: targetRoleCandidate || String((draftProfile as any)?.personalInfo?.title || '').trim(),
      },
      rawInput: '',
    });
    if (!normalized) {
      toast('画像内容为空，请先补充至少一条有效经历或总结', 'error');
      return false;
    }

    setIsSaving(true);
    try {
      const canonicalTargetRole = resolveCareerProfileTargetRole(normalized);
      const resolvedGender = String(normalized.gender || normalized.personalInfo?.gender || '').trim();
      const profileToPersist = stripRawInput({
        ...normalized,
        targetRole: canonicalTargetRole,
        jobDirection: canonicalTargetRole || String(normalized.jobDirection || '').trim(),
        gender: resolvedGender,
        personalInfo: {
          ...(normalized.personalInfo || {}),
          title: canonicalTargetRole || String(normalized.personalInfo?.title || '').trim(),
          gender: resolvedGender,
        },
      });
      if (!profileToPersist) {
        toast('职业画像保存失败，请稍后重试', 'error');
        return false;
      }
      const updatedUser = await persistCareerProfileToUser(userId, profileToPersist);
      if (updatedUser) {
        primeUserProfileCache(userId, updatedUser as any);
      }
      setLocalProfile(profileToPersist);

      return true;
    } catch (err: any) {
      toast(String(err?.message || '职业画像保存失败，请稍后重试'), 'error');
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
    saveCareerProfile,
    saveStructuredCareerProfile,
  };
};
