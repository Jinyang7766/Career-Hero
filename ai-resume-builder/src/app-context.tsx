import React, { createContext, useContext } from 'react';
import type { ResumeData, ResumeSummary, View } from '../types';

export type AppContextValue = {
  isAuthenticated: boolean;
  currentUser: any;
  currentView: View;

  resumeData: ResumeData;
  setResumeData: (data: ResumeData | ((prev: ResumeData) => ResumeData)) => void;

  allResumes: ResumeSummary[];
  setAllResumes: (resumes: ResumeSummary[] | ((prev: ResumeSummary[]) => ResumeSummary[])) => void;
  loadUserResumes: () => Promise<void>;
  createResume: (title: string) => Promise<any>;

  completeness: number;

  isNavHidden: boolean;
  setIsNavHidden: (hidden: boolean) => void;

  navigateToView: (view: View, opts?: { replace?: boolean; root?: boolean }) => void;
  goBack: () => void;

  login: (userData?: any) => void;
  logout: () => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider = AppContext.Provider;

export const useAppContext = () => {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useAppContext must be used within <AppProvider>');
  }
  return ctx;
};
