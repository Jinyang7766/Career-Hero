import type { ResumeData } from '../../../types';
import { buildApiUrl } from '../../../src/api-config';
import { toSkillListForImport } from '../../../src/skill-utils';
import type { ResumeImportInput } from '../../ResumeImportDialog';

type ImportedResume = Omit<ResumeData, 'id'>;

const toErrorMessage = (error: unknown, fallback: string): string => {
  const message = String((error as any)?.message || '').trim();
  return message || fallback;
};

export const parseFusionUploadedResume = async (input: ResumeImportInput): Promise<ImportedResume> => {
  if (input.type === 'text') {
    const response = await fetch(buildApiUrl('/api/ai/parse-resume'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        resumeText: input.rawText,
      }),
    });
    const payload = await response.json().catch(() => ({} as any));
    if (!response.ok) {
      throw new Error(String(payload?.error || '简历解析失败'));
    }
    if (!payload?.success || !payload?.data) {
      throw new Error('简历解析结果为空');
    }
    return {
      ...payload.data,
      skills: toSkillListForImport(payload.data?.skills),
    };
  }

  const formData = new FormData();
  formData.append('file', input.file);
  const response = await fetch(buildApiUrl('/api/parse-pdf'), {
    method: 'POST',
    body: formData,
  });
  const payload = await response.json().catch(() => ({} as any));
  if (!response.ok) {
    throw new Error(String(payload?.error || 'PDF/DOCX 导入失败'));
  }
  if (!payload?.success || !payload?.data) {
    throw new Error('简历解析结果为空');
  }
  return {
    ...payload.data,
    skills: toSkillListForImport(payload.data?.skills),
  };
};

export const parseFusionUploadedResumeSafe = async (
  input: ResumeImportInput
): Promise<{ ok: true; data: ImportedResume } | { ok: false; error: string }> => {
  try {
    const data = await parseFusionUploadedResume(input);
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: toErrorMessage(error, '简历解析失败，请稍后重试'),
    };
  }
};

