import { create } from 'zustand';
import type { ResumeData, ResumeSummary } from '../types';

export const createEmptyResumeData = (): ResumeData => ({
  personalInfo: {
    name: '',
    title: '',
    email: '',
    phone: '',
    location: '',
    linkedin: '',
    website: '',
    summary: '',
    avatar: '',
    age: '',
  },
  workExps: [],
  educations: [],
  projects: [],
  skills: [],
  summary: '',
  gender: '',
  templateId: undefined,
  optimizationStatus: undefined,
  optimizedResumeId: undefined,
  optimizedFromId: undefined,
  lastJdText: '',
  targetCompany: '',
  targetRole: '',
  analysisSnapshot: undefined,
  interviewSessions: undefined,
  exportHistory: undefined,
});

const stripLocationFromResumeData = (resumeData: ResumeData): ResumeData => resumeData;

type ResumeUpdater = ResumeData | ((prev: ResumeData) => ResumeData);
type ResumeListUpdater = ResumeSummary[] | ((prev: ResumeSummary[]) => ResumeSummary[]);

type AppStoreState = {
  resumeData: ResumeData;
  allResumes: ResumeSummary[];
  isNavHidden: boolean;
  setResumeData: (next: ResumeUpdater) => void;
  setAllResumes: (next: ResumeListUpdater) => void;
  setIsNavHidden: (hidden: boolean) => void;
  resetResumeData: () => void;
};

export const useAppStore = create<AppStoreState>((set) => ({
  resumeData: createEmptyResumeData(),
  allResumes: [],
  isNavHidden: false,
  setResumeData: (next) =>
    set((state) => {
      const resolved = typeof next === 'function' ? (next as (prev: ResumeData) => ResumeData)(state.resumeData) : next;
      return { resumeData: stripLocationFromResumeData(resolved) };
    }),
  setAllResumes: (next) =>
    set((state) => ({
      allResumes: typeof next === 'function' ? (next as (prev: ResumeSummary[]) => ResumeSummary[])(state.allResumes) : next,
    })),
  setIsNavHidden: (hidden) => set({ isNavHidden: hidden }),
  resetResumeData: () => set({ resumeData: createEmptyResumeData() }),
}));

export const selectCompleteness = (state: AppStoreState): number => {
  const data = state.resumeData;
  let score = 0;
  if (data.personalInfo.name) score += 10;
  if (data.personalInfo.title) score += 10;
  if (data.personalInfo.email) score += 10;
  if (data.personalInfo.phone) score += 10;
  if (data.workExps.length > 0) score += 20;
  if (data.educations.length > 0) score += 20;
  if (data.skills.length > 0) score += 10;
  if (data.projects.length > 0) score += 10;
  return Math.min(score, 100);
};
