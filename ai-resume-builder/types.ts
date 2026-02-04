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
}

export interface ResumeData {
  id?: number;
  personalInfo: {
    name: string;
    title: string;
    email: string;
    phone: string;
  };
  workExps: ExperienceItem[];
  educations: ExperienceItem[];
  projects: ExperienceItem[];
  skills: string[];
  summary?: string;
  gender?: string;
}

export interface ResumeSummary {
  id: number;
  title: string;
  date: string;
  score?: number;
  hasDot?: boolean;
  thumbnail: any;
}

export interface ScreenProps {
  setCurrentView: (view: View) => void;
  goBack?: () => void;
  onLogin?: (user: any) => void;
  onLogout?: () => void;
  resumeData?: ResumeData;
  setResumeData?: (data: ResumeData | ((prev: ResumeData) => ResumeData)) => void;
  completeness?: number;
  allResumes?: ResumeSummary[];
  setAllResumes?: (resumes: ResumeSummary[] | ((prev: ResumeSummary[]) => ResumeSummary[])) => void;
  createResume?: (title: string) => Promise<any>;
  loadUserResumes?: () => Promise<void>;
  currentUser?: any;
}