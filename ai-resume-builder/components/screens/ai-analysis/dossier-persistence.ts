import { DatabaseService } from '../../../src/database-service';
import { supabase } from '../../../src/supabase-client';

type PersistUserDossierInput = {
  source: 'interview' | 'final_diagnosis';
  score: number;
  summary: string;
  jdText?: string;
  targetCompany?: string;
  strengths?: string[];
  weaknesses?: string[];
  missingKeywords?: string[];
  suggestionsTotal?: number;
};

export const persistUserDossierToProfile = async (input: PersistUserDossierInput) => {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.id) return false;

    const now = new Date().toISOString();
    const dossier = {
      id: `dossier_${input.source}_${Date.now()}`,
      createdAt: now,
      source: input.source,
      score: Number.isFinite(Number(input.score)) ? Math.max(0, Math.min(100, Math.round(Number(input.score)))) : 0,
      summary: String(input.summary || '').trim(),
      targetCompany: String(input.targetCompany || '').trim(),
      jdText: String(input.jdText || '').trim(),
      scoreBreakdown: {
        experience: 0,
        skills: 0,
        format: 0,
      },
      suggestionsOverview: {
        total: Math.max(0, Number(input.suggestionsTotal || 0)),
      },
      strengths: Array.isArray(input.strengths) ? input.strengths : [],
      weaknesses: Array.isArray(input.weaknesses) ? input.weaknesses : [],
      missingKeywords: Array.isArray(input.missingKeywords) ? input.missingKeywords : [],
    };

    const userResult = await DatabaseService.getUser(String(user.id));
    const userHistory = Array.isArray((userResult as any)?.data?.analysis_dossier_history)
      ? (userResult as any).data.analysis_dossier_history
      : [];
    const nextUserHistory = [dossier, ...userHistory].slice(0, 50);

    await DatabaseService.updateUser(String(user.id), {
      analysis_dossier_latest: dossier,
      analysis_dossier_history: nextUserHistory,
    });
    return true;
  } catch (err) {
    console.warn('Failed to persist dossier to user profile:', err);
    return false;
  }
};

