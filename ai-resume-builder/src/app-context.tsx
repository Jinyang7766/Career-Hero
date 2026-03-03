import React, { createContext, useContext, useEffect, useRef, useSyncExternalStore } from 'react';
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

  login: (userData?: any, opts?: { isNewUser?: boolean }) => void;
  logout: (opts?: { skipConfirm?: boolean }) => void;
  theme: 'light' | 'dark' | 'system';
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
};

type AppContextStore = {
  getState: () => AppContextValue;
  setState: (nextState: AppContextValue) => void;
  subscribe: (listener: () => void) => () => void;
};

const createAppContextStore = (initialState: AppContextValue): AppContextStore => {
  let state = initialState;
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    setState: (nextState: AppContextValue) => {
      state = nextState;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

const AppContext = createContext<AppContextStore | null>(null);

export const AppProvider: React.FC<{ value: AppContextValue; children: React.ReactNode }> = ({ value, children }) => {
  const storeRef = useRef<AppContextStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createAppContextStore(value);
  }

  useEffect(() => {
    storeRef.current?.setState(value);
  }, [value]);

  return <AppContext.Provider value={storeRef.current}>{children}</AppContext.Provider>;
};

export function useAppContext(): AppContextValue;
export function useAppContext<T>(selector: (state: AppContextValue) => T): T;
export function useAppContext<T>(selector?: (state: AppContextValue) => T) {
  const store = useContext(AppContext);
  if (!store) {
    throw new Error('useAppContext must be used within <AppProvider>');
  }
  const select = selector || ((state: AppContextValue) => state as unknown as T);
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.getState()),
    () => select(store.getState())
  );
}
