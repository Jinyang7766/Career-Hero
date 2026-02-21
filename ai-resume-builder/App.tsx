import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, ResumeData, ResumeSummary } from './types';
import { DatabaseService } from './src/database-service';
import { supabase } from './src/supabase-client';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { AppProvider } from './src/app-context';
import { createEmptyResumeData, selectCompleteness, useAppStore } from './src/app-store';
import BottomNav from './components/BottomNav';
import Dashboard from './components/screens/Dashboard';
import Profile from './components/screens/Profile';
import Preview from './components/screens/Preview';
import Editor from './components/screens/Editor';
import Settings from './components/screens/Settings';
import AccountSecurity from './components/screens/AccountSecurity';
import Help from './components/screens/Help';
import History from './components/screens/History';
import PointsHistory from './components/screens/PointsHistory';
import AllResumes from './components/screens/AllResumes';
import AiAnalysis from './components/screens/AiAnalysis';
import Login from './components/screens/Login';
import Signup from './components/screens/Signup';
import ForgotPassword from './components/screens/ForgotPassword';
import DeletionPending from './components/screens/DeletionPending';
import MemberCenter from './components/screens/MemberCenter';
import TermsOfService from './components/screens/TermsOfService';
import PrivacyPolicy from './components/screens/PrivacyPolicy';
import ScreenErrorBoundary from './components/ScreenErrorBoundary';
import { deriveDiagnosisProgress, deriveLatestAnalysisStep } from './src/diagnosis-progress';
import { deriveInterviewStageStatus } from './components/screens/ai-analysis/interview-stage-status';
import { makeJdKey, parseInterviewScopedKey } from './components/screens/ai-analysis/id-utils';
import { pathToView, viewToPath } from './src/app-routing';
import { useThemeSync } from './src/hooks/useThemeSync';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const setResumeData = useAppStore((state) => state.setResumeData);
  const allResumes = useAppStore((state) => state.allResumes);
  const setAllResumes = useAppStore((state) => state.setAllResumes);
  const isNavHidden = useAppStore((state) => state.isNavHidden);
  const setIsNavHidden = useAppStore((state) => state.setIsNavHidden);
  const [theme, setThemeState] = useState<'light' | 'dark' | 'system'>(() => {
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | 'system' | null;
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    return 'system';
  });

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useThemeSync({ theme, setResolvedTheme });

  const setTheme = (newTheme: 'light' | 'dark' | 'system') => setThemeState(newTheme);

  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const appContainerRef = useRef<HTMLDivElement | null>(null);
  const routeHistoryRef = useRef<string[]>([]);

  const currentView = useMemo(() => pathToView(location.pathname), [location.pathname, isAuthenticated]);
  const currentRoute = useMemo(() => `${location.pathname}${location.search || ''}`, [location.pathname, location.search]);

  // Maintain an app-level route stack so in-app back buttons always return to the previous app page.
  useEffect(() => {
    const stack = routeHistoryRef.current;
    if (!stack.length) {
      routeHistoryRef.current = [currentRoute];
      return;
    }

    const last = stack[stack.length - 1];
    if (last === currentRoute) return;

    if (navigationType === 'REPLACE') {
      routeHistoryRef.current = [...stack.slice(0, -1), currentRoute];
      return;
    }

    if (navigationType === 'POP') {
      const idx = stack.lastIndexOf(currentRoute);
      if (idx >= 0) {
        routeHistoryRef.current = stack.slice(0, idx + 1);
      } else {
        routeHistoryRef.current = [...stack, currentRoute];
      }
      return;
    }

    routeHistoryRef.current = [...stack, currentRoute];
  }, [currentRoute, navigationType]);

  // Always reset scroll position when entering a new page/route so headers/back buttons stay visible.
  useEffect(() => {
    const scrollToTop = () => {
      try {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      } catch {
        window.scrollTo(0, 0);
      }

      const scroller = document.scrollingElement as HTMLElement | null;
      if (scroller) {
        scroller.scrollTop = 0;
      }

      const docEl = document.documentElement as HTMLElement | null;
      if (docEl) {
        docEl.scrollTop = 0;
      }

      const bodyEl = document.body as HTMLElement | null;
      if (bodyEl) {
        bodyEl.scrollTop = 0;
      }

      if (appContainerRef.current) {
        appContainerRef.current.scrollTop = 0;
      }
    };

    scrollToTop();
    const raf = window.requestAnimationFrame(scrollToTop);
    const timer = window.setTimeout(scrollToTop, 60);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [location.pathname]);

  // Global toast + confirm overlays to avoid browser-native alert/confirm (which show the site URL).
  const toastTimerRef = useRef<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'info' | 'success' | 'error' } | null>(null);
  const showToast = useCallback((msg: string, type: 'info' | 'success' | 'error' = 'info', ms: number = 2200) => {
    const text = String(msg ?? '').trim();
    if (!text) return;
    setToast({ msg: text, type });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, ms);
  }, []);

  const [confirmState, setConfirmState] = useState<null | { message: string; resolve: (ok: boolean) => void }>(null);
  const confirmAsync = useCallback((message: string) => {
    return new Promise<boolean>((resolve) => {
      const text = String(message ?? '').trim();
      if (!text) return resolve(false);
      setConfirmState({ message: text, resolve });
    });
  }, []);

  // Intercept browser-native alert() globally to avoid URL-bearing dialogs.
  useEffect(() => {
    const originalAlert = window.alert;

    // Expose helpers for any module that wants to call them without prop drilling.
    (window as any).__careerHeroToast = (msg: string, type?: 'info' | 'success' | 'error', ms?: number) => showToast(msg, type ?? 'info', ms ?? 2200);
    (window as any).__careerHeroConfirm = (msg: string) => confirmAsync(msg);

    window.alert = (message?: any) => {
      showToast(String(message ?? ''), 'info', 2600);
    };

    return () => {
      window.alert = originalAlert;
      try {
        delete (window as any).__careerHeroToast;
        delete (window as any).__careerHeroConfirm;
      } catch {
        // ignore
      }
    };
  }, [showToast, confirmAsync]);

  // Show bottom nav on main tabs (allow unauth users to see Home/My entry on dashboard)
  const showBottomNav = (
    (isAuthenticated && [View.DASHBOARD, View.AI_ANALYSIS, View.AI_INTERVIEW, View.PROFILE, View.ALL_RESUMES].includes(currentView))
    || (!isAuthenticated && [View.DASHBOARD, View.AI_ANALYSIS, View.AI_INTERVIEW, View.PROFILE].includes(currentView))
  ) && !isNavHidden;

  // Basic route guards / root redirects.
  // IMPORTANT: Only run after the initial auth check completes to avoid
  // prematurely redirecting to /login while Supabase session is still loading.
  useEffect(() => {
    if (!authChecked) return; // Wait for checkAuth to finish

    const p = (location.pathname || '').toLowerCase();
    const publicPaths = ['/login', '/signup', '/forgot-password', '/terms-of-service', '/privacy-policy'];

    if (p === '/' || p === '') {
      navigate(viewToPath(View.DASHBOARD), { replace: true });
      return;
    }

    // Unauthenticated users can stay on visitor-mode pages.
    if (!isAuthenticated && (p.startsWith('/dashboard') || p.startsWith('/ai-analysis') || p.startsWith('/ai-interview') || p.startsWith('/profile'))) {
      return;
    }

    if (!isAuthenticated && !publicPaths.some((x) => p.startsWith(x))) {
      navigate(viewToPath(View.LOGIN), { replace: true });
    }
  }, [authChecked, isAuthenticated, location.pathname, navigate]);

  // Load user resumes when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadUserResumes();
    }
  }, [isAuthenticated]);

  // Check authentication status on mount.
  // IMPORTANT: This effect only sets auth state. It does NOT navigate to /dashboard.
  // All routing decisions are handled by the route-guard effect above.
  // The only exception is /deletion-pending, which is a forced redirect.
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (session?.user) {
          console.log('User authenticated:', session.user);
          setCurrentUser(session.user);
          setIsAuthenticated(true);

          // IMPORTANT: Check for deletion pending status from database record
          // because session.user.user_metadata might be stale
          const profileResult = await DatabaseService.getUser(session.user.id);
          if (profileResult.success && profileResult.data?.deletion_pending_until) {
            const updatedUser = { ...session.user, deletion_pending_until: profileResult.data.deletion_pending_until };
            setCurrentUser(updatedUser);
            navigate(viewToPath(View.DELETION_PENDING), { replace: true });
          }
          // Do NOT navigate to /dashboard here — the route guard effect handles
          // redirecting from root "/" or public paths after authChecked becomes true.
        } else {
          console.log('No active session');
          // No session → route guard will redirect non-public paths to /login.
        }
      } catch (error) {
        console.error('Error checking auth status:', error);
        // On error, leave isAuthenticated=false; route guard will redirect.
      } finally {
        setAuthChecked(true);
      }
    };

    checkAuth();
  }, [navigate]);


  // Load user resumes from Supabase
  const loadUserResumes = async () => {
    try {
      console.log('Loading user resumes...');

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error('User not authenticated:', userError);
        return;
      }

      console.log('Loading resumes for user:', user.id);

      const result = await DatabaseService.getUserResumes(user.id);

      if (result.success) {
        console.log('Resumes loaded successfully:', result.data);

        // Format date to Beijing timezone (UTC+8) with seconds
        const formatDateTime = (dateString: string) => {
          const formatNow = () => {
            const now = new Date();
            const beijingNow = new Date(now.getTime() + (8 * 60 * 60 * 1000) + (now.getTimezoneOffset() * 60 * 1000));
            const year = beijingNow.getFullYear();
            const month = String(beijingNow.getMonth() + 1).padStart(2, '0');
            const day = String(beijingNow.getDate()).padStart(2, '0');
            const hours = String(beijingNow.getHours()).padStart(2, '0');
            const minutes = String(beijingNow.getMinutes()).padStart(2, '0');
            const seconds = String(beijingNow.getSeconds()).padStart(2, '0');
            return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
          };
          if (!dateString) {
            return formatNow();
          }

          const date = new Date(dateString);

          if (isNaN(date.getTime())) {
            return formatNow();
          }

          // Convert to Beijing timezone (UTC+8)
          const beijingTime = new Date(date.getTime() + (8 * 60 * 60 * 1000) + (date.getTimezoneOffset() * 60 * 1000));

          const year = beijingTime.getFullYear();
          const month = String(beijingTime.getMonth() + 1).padStart(2, '0');
          const day = String(beijingTime.getDate()).padStart(2, '0');
          const hours = String(beijingTime.getHours()).padStart(2, '0');
          const minutes = String(beijingTime.getMinutes()).padStart(2, '0');
          const seconds = String(beijingTime.getSeconds()).padStart(2, '0');

          return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        };

        const resumes: ResumeSummary[] = result.data.map((resume: any) => {
          const formattedDate = formatDateTime(resume.updated_at || resume.created_at);
          // 清理日期字符串，确保只包含纯数字和分隔符
          const cleanedDate = formattedDate.replace(/[^0-9\-:\s]/g, '');
          const rowData = resume.resume_data || {};
          const analysisSnapshot = rowData.analysisSnapshot || null;
          const analysisBindings = rowData.analysisBindings || {};
          const analysisSessionByJd = rowData.analysisSessionByJd || {};
          const interviewSessions = rowData.interviewSessions || {};
          const latestAnalysisStep = deriveLatestAnalysisStep(rowData);
          const reportReadyInSession = Object.values(analysisSessionByJd || {}).some((s: any) => String(s?.state || '') === 'report_ready');
          const hasBinding = !!(analysisBindings && Object.keys(analysisBindings).length > 0);
          const hasSnapshotScore = typeof analysisSnapshot?.score === 'number' && analysisSnapshot.score > 0;
          const analysisScore = hasSnapshotScore ? Number(analysisSnapshot.score) : undefined;
          const diagnosisProgress = deriveDiagnosisProgress(rowData);
          const analyzed = Boolean(hasSnapshotScore || hasBinding || reportReadyInSession);
          const isInterviewSceneSession = (sessionKey: string, session: any) => {
            const chatMode = String(session?.chatMode || '').trim().toLowerCase();
            if (chatMode) return chatMode === 'interview';
            const legacyStep = String(session?.step || '').trim().toLowerCase();
            if (legacyStep === 'final_report' || legacyStep === 'comparison' || legacyStep === 'report' || legacyStep === 'micro_intro') {
              return false;
            }
            if (legacyStep === 'chat' || legacyStep === 'interview_report') {
              return true;
            }
            const parsedState = parseInterviewScopedKey(String(sessionKey || ''));
            const stateType = String(session?.interviewType || parsedState.interviewType || '').trim().toLowerCase();
            const stateMode = String(session?.interviewMode || parsedState.interviewMode || '').trim().toLowerCase();
            const stateJdKey =
              String(session?.jdKey || '').trim() ||
              makeJdKey(String(session?.jdText || '').trim() || '__no_jd__');
            return Object.entries(interviewSessions || {}).some(([interviewKey, iv]: [string, any]) => {
              if (String(iv?.chatMode || '').trim().toLowerCase() !== 'interview') return false;
              const ivJdKey = makeJdKey(String(iv?.jdText || '').trim() || '__no_jd__');
              if (stateJdKey && ivJdKey && ivJdKey !== stateJdKey) return false;
              const parsed = parseInterviewScopedKey(String(interviewKey || ''));
              const ivType = String(iv?.interviewType || parsed.interviewType || '').trim().toLowerCase();
              const ivMode = String(iv?.interviewMode || parsed.interviewMode || '').trim().toLowerCase();
              if (stateType && ivType && stateType !== ivType) return false;
              if (stateMode && ivMode && stateMode !== ivMode) return false;
              return true;
            });
          };
          const interviewInterrupted = Object.entries(analysisSessionByJd || {}).some(([jdKey, session]: [string, any]) => {
            if (!isInterviewSceneSession(jdKey, session)) return false;
            const state = String(session?.state || '');
            if (state !== 'paused' && state !== 'interview_in_progress') return false;
            return true;
          });
          const interviewHistory = Object.entries(analysisSessionByJd || {})
            .filter(([key, session]: [string, any]) => {
              if (!isInterviewSceneSession(key, session)) return false;
              const state = String(session?.state || '');
              const isDone = state === 'interview_done';
              const isInProgress = state === 'paused' || state === 'interview_in_progress';
              return isDone || isInProgress;
            })
            .map(([jdKey, session]: [string, any]) => {
              const state = String(session?.state || '');
              const isDone = state === 'interview_done';
              const company = session.targetCompany || '未知面试';
              return {
                jdKey,
                company,
                status: (isDone ? 'completed' : 'interrupted') as 'completed' | 'interrupted',
                updatedAt: session.updatedAt || new Date().toISOString()
              };
            })
            .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

          const {
            interviewStageStatus,
            interviewStageStatusByMode,
          } = deriveInterviewStageStatus({
            ...rowData,
            id: resume.id,
          });

          return {
            id: resume.id,
            title: resume.title,
            date: cleanedDate,
            score: resume.score,
            analysisScore,
            diagnosisProgress,
            latestAnalysisStep,
            analyzed,
            interviewInterrupted,
            interviewHistory,
            interviewStageStatus,
            interviewStageStatusByMode,
            hasDot: resume.has_dot,
            optimizationStatus: rowData.optimizationStatus || 'unoptimized',
            thumbnail: (
              <>
                <div className="absolute top-2 left-1.5 w-8 h-1 bg-slate-300 dark:bg-slate-500 rounded-sm"></div>
                <div className="absolute top-4 left-1.5 w-10 h-0.5 bg-slate-200 dark:bg-slate-600 rounded-sm"></div>
                <div className="absolute top-9 left-1.5 w-11 h-8 bg-slate-100 dark:bg-slate-800 rounded-sm"></div>
              </>
            )
          };
        });

        console.log('Processed resumes:', resumes);
        setAllResumes(resumes);
      } else {
        console.error('Failed to load resumes:', result.error);
      }
    } catch (error) {
      console.error('Failed to load resumes:', error);
    }
  };

  // Create new resume
  const createResume = async (title: string) => {
    try {
      console.log('Creating new resume with title:', title);

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error('User not authenticated:', userError);
        throw new Error('请先登录');
      }

      console.log('Creating resume for user:', user.id);

      const result = await DatabaseService.createResume(user.id, title, useAppStore.getState().resumeData);

      if (result.success) {
        console.log('Resume created successfully:', result.data);
        // Reload resumes to get the latest list
        await loadUserResumes();
        return result.data;
      } else {
        console.error('Failed to create resume:', result.error);
        throw new Error(result.error?.message || '创建简历失败');
      }
    } catch (error) {
      console.error('Failed to create resume:', error);
      throw error;
    }
  };

  // If user is authenticated, don't allow staying on auth pages.
  useEffect(() => {
    if (!isAuthenticated) return;
    if (isLoggingOut) return;
    if ([View.LOGIN, View.SIGNUP, View.FORGOT_PASSWORD].includes(currentView)) {
      navigate(viewToPath(View.DASHBOARD), { replace: true });
    }
  }, [isAuthenticated, isLoggingOut, currentView, navigate]);

  const handleLogin = (userData?: any) => {
    if (userData) {
      setCurrentUser(userData);
    }
    setIsAuthenticated(true);
    navigate(viewToPath(View.DASHBOARD), { replace: true });
  };

  const handleLogout = async (opts?: { skipConfirm?: boolean }) => {
    if (isLoggingOut) return;
    if (!opts?.skipConfirm) {
      const ok = await confirmAsync('确定要退出登录吗？');
      if (!ok) return;
    }

    setIsLoggingOut(true);
    void (async () => {
      const logoutUserId = String(currentUser?.id || '').trim();
      try {
        // Ensure server/session is actually signed out to avoid auth race.
        await supabase.auth.signOut();
      } catch (error) {
        console.warn('Supabase signOut failed, fallback to local logout:', error);
      } finally {
        // Clear local auth caches
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        localStorage.removeItem('supabase_session');
        localStorage.removeItem('token');
        localStorage.removeItem('user_avatar');
        if (logoutUserId) {
          localStorage.removeItem(`user_avatar:${logoutUserId}`);
          localStorage.removeItem(`has_created_resume_${logoutUserId}`);
        }

        // Clear in-memory user data to prevent stale UI after logout.
        setAllResumes([]);
        setResumeData(createEmptyResumeData());
        routeHistoryRef.current = [];

        setCurrentUser(null);
        setIsAuthenticated(false);
        setAuthChecked(true);
        navigate(viewToPath(View.LOGIN), { replace: true });
        // Release on next tick after navigation commit.
        setTimeout(() => setIsLoggingOut(false), 0);
      }
    })();
  };

  // Enhanced navigation handler (router-based)
  const handleNavigate = (view: View, isRoot: boolean = false) => {
    navigate(viewToPath(view), { replace: !!isRoot });
  };

  // Back button handler
  const handleGoBack = () => {
    if (!isAuthenticated && currentView === View.LOGIN) {
      setShowWizard(false);
      navigate(viewToPath(View.DASHBOARD), { replace: true });
      return;
    }
    if (!isAuthenticated && currentView === View.FORGOT_PASSWORD) {
      setShowWizard(false);
      navigate(viewToPath(View.LOGIN), { replace: true });
      return;
    }
    const stack = routeHistoryRef.current;
    if (stack.length > 1) {
      const prev = stack[stack.length - 2];
      routeHistoryRef.current = stack.slice(0, -1);
      navigate(prev, { replace: true });
      return;
    }
    setShowWizard(false);
    navigate(viewToPath(View.DASHBOARD), { replace: true });
  };

  // Bottom Nav click handler (resets history and wizard mode)
  const handleBottomNavClick = (view: View) => {
    setShowWizard(false); // Reset wizard mode when navigating via BottomNav
    if (view === View.ALL_RESUMES) {
      setResumeData(createEmptyResumeData());
    }
    if (view === View.AI_ANALYSIS) {
      localStorage.setItem('ai_analysis_force_resume_select', '1');
      localStorage.setItem('ai_analysis_entry_source', 'bottom_nav');
      localStorage.removeItem('ai_analysis_step');
      localStorage.removeItem('ai_analysis_in_progress');
      localStorage.removeItem('ai_analysis_has_activity');
      routeHistoryRef.current = ['/ai-analysis'];
      navigate('/ai-analysis', { replace: true });
      return;
    }
    if (view === View.AI_INTERVIEW) {
      localStorage.setItem('ai_analysis_force_resume_select', '1');
      localStorage.setItem('ai_analysis_entry_source', 'bottom_nav');
      localStorage.removeItem('ai_analysis_step');
      localStorage.removeItem('ai_analysis_in_progress');
      localStorage.removeItem('ai_analysis_has_activity');
      routeHistoryRef.current = ['/ai-interview'];
      navigate('/ai-interview', { replace: true });
      return;
    }
    routeHistoryRef.current = [viewToPath(view)];
    handleNavigate(view, true);
  };

  // Check if first time user on auth
  useEffect(() => {
    if (isAuthenticated && currentUser) {
      const hasCreatedResume = localStorage.getItem(`has_created_resume_${currentUser.id}`);
      if (!hasCreatedResume) {
        // Double check with loaded resumes
        if (allResumes.length === 0) {
          // Wait a bit to ensure resumes are loaded
          setTimeout(() => {
            if (allResumes.length === 0) {
              setShowWizard(true);
            }
          }, 1000);
        }
      }
    }
  }, [isAuthenticated, currentUser, allResumes.length]);

  const handleWizardComplete = async (data: ResumeData) => {
    try {
      if (!currentUser) return;

      console.log('Wizard completed, saving resume:', data);

      // Create the resume in database
      const title = data.personalInfo.title ? `${data.personalInfo.name} - ${data.personalInfo.title}` : '我的简历';

      // Update local state first for immediate feedback
      setResumeData(data);

      const result = await DatabaseService.createResume(currentUser.id, title, data);

      if (result.success) {
        localStorage.setItem(`has_created_resume_${currentUser.id}`, 'true');
        setShowWizard(false);
        await loadUserResumes();
        navigate(viewToPath(View.EDITOR), { replace: true });
      } else {
        alert('保存简历失败: ' + result.error?.message);
      }
    } catch (error) {
      console.error('Wizard complete error:', error);
      alert('保存简历出错');
    }
  };

  const handleCreateNewResume = () => {
    if (!isAuthenticated) {
      navigate(viewToPath(View.LOGIN), { replace: true });
      return;
    }
    setResumeData(createEmptyResumeData());
    setShowWizard(true);
    handleNavigate(View.EDITOR);
  };

  const renderView = () => {
    // Show loading state while auth is being checked to prevent flash of login page
    if (!authChecked) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="flex flex-col items-center gap-3">
            <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-slate-400 font-medium">加载中...</span>
          </div>
        </div>
      );
    }

    switch (currentView) {
      case View.LOGIN:
        return <Login />;
      case View.SIGNUP:
        return <Signup />;
      case View.FORGOT_PASSWORD:
        return <ForgotPassword />;
      case View.DASHBOARD:
        return <Dashboard createNewResume={handleCreateNewResume} />;
      case View.EDITOR:
        return <Editor wizardMode={showWizard} />;
      case View.TEMPLATES:
        return <Editor />;
      case View.AI_ANALYSIS:
        return (
          <ScreenErrorBoundary title="AI诊断页面异常">
            <AiAnalysis key="ai-analysis-mode" />
          </ScreenErrorBoundary>
        );
      case View.AI_INTERVIEW:
        return (
          <ScreenErrorBoundary title="AI面试页面异常">
            <AiAnalysis key="ai-interview-mode" isInterviewMode={true} />
          </ScreenErrorBoundary>
        );
      case View.PROFILE:
        return <Profile />;
      case View.PREVIEW:
        return <Preview />;
      case View.EDITOR:
        return <Editor />;
      case View.SETTINGS:
        return <Settings />;
      case View.ACCOUNT_SECURITY:
        return <AccountSecurity />;
      case View.HELP:
        return <Help />;
      case View.HISTORY:
        return <History />;
      case View.POINTS_HISTORY:
        return <PointsHistory />;
      case View.ALL_RESUMES:
        return <AllResumes />;
      case View.MEMBER_CENTER:
        return <MemberCenter />;
      case View.DELETION_PENDING:
        return <DeletionPending />;
      case View.TERMS_OF_SERVICE:
        return <TermsOfService />;
      case View.PRIVACY_POLICY:
        return <PrivacyPolicy />;
      default:
        // Fallback based on auth status
        return isAuthenticated
          ? <Dashboard createNewResume={handleCreateNewResume} />
          : <Login />;
    }
  };



  const ToastOverlay = () => {
    if (!toast) return null;

    const styles = {
      success: {
        bg: 'bg-emerald-500/90 dark:bg-emerald-600/90',
        border: 'border-emerald-400/30',
        shadow: 'shadow-emerald-500/20',
        icon: 'check_circle'
      },
      error: {
        bg: 'bg-rose-500/90 dark:bg-rose-600/90',
        border: 'border-rose-400/30',
        shadow: 'shadow-rose-500/20',
        icon: 'error'
      },
      info: {
        bg: 'bg-slate-800/90 dark:bg-slate-700/90',
        border: 'border-slate-600/30',
        shadow: 'shadow-slate-900/20',
        icon: 'info'
      }
    };

    const style = styles[toast.type] || styles.info;

    return (
      <div className="fixed inset-x-0 top-6 z-[9999] flex justify-center px-4 pointer-events-none">
        <div className={`pointer-events-auto flex items-center gap-3 rounded-2xl shadow-2xl backdrop-blur-xl border ${style.bg} ${style.border} ${style.shadow} px-5 py-3 animate-in slide-in-from-top-4 fade-in duration-300 max-w-[90%]`}>
          <span className="material-symbols-outlined text-white text-[20px] shrink-0">{style.icon}</span>
          <div className="text-[14px] font-bold text-white leading-tight">{toast.msg}</div>
        </div>
      </div>
    );
  };

  const ConfirmModal = () => {
    if (!confirmState) return null;
    const isDelete = /(确定要(删除|解绑|退出|注销|移除|清理|重置|清除|重新诊断|清空)|^(删除|解绑|注销|退出|移除|清空|重置|清除|重新诊断)\?|重新诊断|清空)/.test(confirmState.message);

    const onCancel = () => {
      confirmState.resolve(false);
      setConfirmState(null);
    };
    const onOk = () => {
      confirmState.resolve(true);
      setConfirmState(null);
    };

    return (
      <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 sm:p-4">
        <div
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300"
          onClick={onCancel}
        />
        <div className="relative w-full max-w-sm bg-white dark:bg-[#1c2936] rounded-[28px] shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden border border-slate-100 dark:border-white/5 animate-in zoom-in-95 fade-in duration-300">
          <div className="p-8 pb-6">
            <div className="flex flex-col items-center text-center">
              <div className={`size-16 rounded-3xl ${isDelete ? 'bg-rose-50 dark:bg-rose-500/10' : 'bg-primary/5 dark:bg-primary/10'} flex items-center justify-center mb-6 rotate-3 transform transition-transform hover:rotate-0 duration-300`}>
                <span className={`material-symbols-outlined ${isDelete ? 'text-rose-500' : 'text-primary'} text-[36px]`}>
                  {isDelete ? 'delete_forever' : 'help'}
                </span>
              </div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white mb-3 tracking-tight">
                {isDelete ? '确认操作？' : '提示'}
              </h3>
              <p className="text-[15px] font-medium text-slate-500 dark:text-slate-400 leading-relaxed px-2">
                {confirmState.message}
              </p>
            </div>
          </div>
          <div className="p-6 pt-0 flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 h-12 rounded-2xl text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-all active:scale-95"
            >
              取消
            </button>
            <button
              onClick={onOk}
              className={`flex-1 h-12 rounded-2xl text-sm font-bold text-white shadow-lg active:scale-95 transition-all
                ${isDelete
                  ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/25'
                  : 'bg-primary hover:bg-blue-600 shadow-primary/25'}`}
            >
              确定
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <AppProvider
      value={{
        isAuthenticated,
        currentUser,
        currentView,
        resumeData: useAppStore.getState().resumeData,
        setResumeData,
        allResumes: useAppStore.getState().allResumes,
        setAllResumes,
        loadUserResumes,
        createResume,
        completeness: selectCompleteness(useAppStore.getState()),
        isNavHidden,
        setIsNavHidden,
        navigateToView: (view, opts) => {
          if (opts?.root) {
            handleBottomNavClick(view);
            return;
          }
          navigate(viewToPath(view), { replace: !!opts?.replace });
        },
        goBack: handleGoBack,
        login: handleLogin,
        logout: handleLogout,
        theme,
        resolvedTheme,
        setTheme,
      }}
    >
      <div ref={appContainerRef} className={`min-h-screen bg-background-light dark:bg-background-dark text-slate-900 dark:text-white max-w-md mx-auto shadow-2xl overflow-hidden relative`}>
        <ToastOverlay />
        <ConfirmModal />
        {renderView()}
        {showBottomNav && <BottomNav />}
      </div>
    </AppProvider>
  );
}

export default App;
