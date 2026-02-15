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
  status: 'pending' | 'accepted' | 'ignored';
  rating?: 'up' | 'down';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  audioUrl?: string;
  audioMime?: string;
  suggestion?: Suggestion;
}

