export interface Suggestion {
  id: string;
  type: 'optimization' | 'grammar' | 'missing';
  title: string;
  reason: string;
  targetSection: 'personalInfo' | 'workExps' | 'skills' | 'projects' | 'educations' | 'summary';
  targetId?: number;
  targetField?: string;
  suggestedValue: any;
  originalValue?: string;
  status: 'pending';
  rating?: 'up' | 'down';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  audioUrl?: string;
  audioMime?: string;
  audioDuration?: number;
  audioPending?: boolean;
  suggestion?: Suggestion;
}

export interface ScoreBreakdown {
  experience: number;
  skills: number;
  format: number;
}

export interface AnalysisReport {
  summary: string;
  microInterviewFirstQuestion?: string;
  strengths: string[];
  weaknesses: string[];
  missingKeywords: string[];
  scoreBreakdown: ScoreBreakdown;
}
