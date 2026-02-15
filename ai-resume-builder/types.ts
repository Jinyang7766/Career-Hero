export enum View {
  DASHBOARD = 'DASHBOARD',
  TEMPLATES = 'TEMPLATES',
  AI_ANALYSIS = 'AI_ANALYSIS',
  PROFILE = 'PROFILE',
  PREVIEW = 'PREVIEW',
  EDITOR = 'EDITOR',
  SETTINGS = 'SETTINGS',
  ACCOUNT_SECURITY = 'ACCOUNT_SECURITY',
  HELP = 'HELP',
  HISTORY = 'HISTORY',
  ALL_RESUMES = 'ALL_RESUMES',
  LOGIN = 'LOGIN',
  SIGNUP = 'SIGNUP',
  FORGOT_PASSWORD = 'FORGOT_PASSWORD',
  DELETION_PENDING = 'DELETION_PENDING',
  MEMBER_CENTER = 'MEMBER_CENTER',
}

export interface NavProps {
  currentView: View;
  setCurrentView: (view: View) => void;
}

export interface ExperienceItem {
  id: number;
  title: string;
  subtitle: string;
  date: string;
  description: string;
  startDate?: string;
  endDate?: string;
}

export interface PersonalInfo {
  name: string;
  title: string;
  email: string;
  phone: string;
  location?: string;
  linkedin?: string;
  website?: string;
  summary?: string;
  avatar?: string;
}

export interface WorkExperience extends ExperienceItem {
  company?: string;
}

export interface Project extends ExperienceItem {
  link?: string;
}

export interface Education extends ExperienceItem {
  school?: string;
  degree?: string;
  major?: string;
}

export interface ResumeData {
  id?: number;
  resumeTitle?: string;
  personalInfo: PersonalInfo;
  workExps: WorkExperience[];
  educations: Education[];
  projects: Project[];
  skills: string[];
  summary?: string;
  gender?: string;
  templateId?: string;
  optimizationStatus?: 'optimized' | 'unoptimized';
  optimizedResumeId?: number;
  optimizedFromId?: number;
  lastJdText?: string;
  targetCompany?: string;
  analysisSnapshot?: {
    score: number;
    summary: string;
    strengths: string[];
    weaknesses: string[];
    missingKeywords: string[];
    scoreBreakdown: {
      experience: number;
      skills: number;
      format: number;
    };
    suggestions?: any[];
    updatedAt: string;
    jdText?: string;
    targetCompany?: string;
  };
  aiSuggestionFeedback?: Record<string, {
    rating: 'up' | 'down';
    ratedAt: string;
    title?: string;
    reason?: string;
  }>;
  interviewSessions?: Record<string, {
    jdText: string;
    messages: { id: string; role: 'user' | 'model'; text: string }[];
    updatedAt: string;
  }>;
  exportHistory?: {
    filename: string;
    size: number;
    type: 'PDF';
    exportedAt: string;
  }[];
}

export interface ResumeSummary {
  id: number;
  title: string;
  date: string;
  score?: number;
  hasDot?: boolean;
  optimizationStatus?: 'optimized' | 'unoptimized';
  thumbnail: any;
}

export interface ScreenProps {
  // Legacy prop-based navigation. Prefer using `useAppContext().navigateToView(...)`.
  setCurrentView?: (view: View) => void;
  goBack?: () => void;
  onLogin?: (user: any) => void;
  onLogout?: () => void;
  resumeData?: ResumeData;
  hasBottomNav?: boolean;
  setResumeData?: (data: ResumeData | ((prev: ResumeData) => ResumeData)) => void;
  completeness?: number;
  allResumes?: ResumeSummary[];
  setAllResumes?: (resumes: ResumeSummary[] | ((prev: ResumeSummary[]) => ResumeSummary[])) => void;
  createResume?: (title: string) => Promise<any>;
  loadUserResumes?: () => Promise<void>;
  currentUser?: any;
  setIsNavHidden?: (hidden: boolean) => void;
}
