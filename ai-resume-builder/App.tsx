import React, { Suspense, useState, useEffect, useMemo, useRef } from 'react';
import { View, ResumeData, ResumeSummary } from './types';
import { DatabaseService } from './src/database-service';
import { supabase } from './src/supabase-client';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { AppProvider } from './src/app-context';
import { createEmptyResumeData, selectCompleteness, useAppStore } from './src/app-store';
import BottomNav from './components/BottomNav';
import ScreenErrorBoundary from './components/ScreenErrorBoundary';
import AppOverlays from './components/app/AppOverlays';
import { deriveDiagnosisProgress, deriveLatestAnalysisStep } from './src/diagnosis-progress';
import { deriveInterviewStageStatus } from './components/screens/ai-analysis/interview-stage-status';
import { makeJdKey, parseInterviewScopedKey } from './components/screens/ai-analysis/id-utils';
import { pathToView, viewToPath } from './src/app-routing';
import { useAppDialogs } from './src/hooks/useAppDialogs';
import { useRouteHistoryStack } from './src/hooks/useRouteHistoryStack';
import { useScrollResetOnRoute } from './src/hooks/useScrollResetOnRoute';
import { useThemeSync } from './src/hooks/useThemeSync';

const Dashboard = React.lazy(() => import('./components/screens/Dashboard'));
const Profile = React.lazy(() => import('./components/screens/Profile'));
const Preview = React.lazy(() => import('./components/screens/Preview'));
const Editor = React.lazy(() => import('./components/screens/Editor'));
const Settings = React.lazy(() => import('./components/screens/Settings'));
const AccountSecurity = React.lazy(() => import('./components/screens/AccountSecurity'));
const Help = React.lazy(() => import('./components/screens/Help'));
const History = React.lazy(() => import('./components/screens/History'));
const PointsHistory = React.lazy(() => import('./components/screens/PointsHistory'));
const AllResumes = React.lazy(() => import('./components/screens/AllResumes'));
const AiAnalysis = React.lazy(() => import('./components/screens/AiAnalysis'));
const Login = React.lazy(() => import('./components/screens/Login'));
const Signup = React.lazy(() => import('./components/screens/Signup'));
const ForgotPassword = React.lazy(() => import('./components/screens/ForgotPassword'));
const DeletionPending = React.lazy(() => import('./components/screens/DeletionPending'));
const MemberCenter = React.lazy(() => import('./components/screens/MemberCenter'));
const TermsOfService = React.lazy(() => import('./components/screens/TermsOfService'));
const PrivacyPolicy = React.lazy(() => import('./components/screens/PrivacyPolicy'));

const ScreenFallback: React.FC<{ label?: string }> = ({ label = '页面加载中...' }) => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="flex flex-col items-center gap-3">
      <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <span className="text-sm text-slate-400 font-medium">{label}</span>
    </div>
  </div>
);

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

  const currentView = useMemo(() => pathToView(location.pathname), [location.pathname, isAuthenticated]);
  const currentRoute = useMemo(() => `${location.pathname}${location.search || ''}`, [location.pathname, location.search]);
  const {
    routeHistoryRef,
    clearHistory,
    setSingleHistory,
    popPrevRoute,
  } = useRouteHistoryStack({
    currentRoute,
    navigationType: navigationType as 'POP' | 'PUSH' | 'REPLACE',
  });
  const {
    toast,
    confirmState,
    setConfirmState,
    showToast,
    confirmAsync,
  } = useAppDialogs();

  useScrollResetOnRoute({
    pathname: location.pathname,
    appContainerRef,
  });


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
        clearHistory();

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
    const prev = popPrevRoute();
    if (prev) {
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
      setSingleHistory('/ai-analysis');
      navigate('/ai-analysis', { replace: true });
      return;
    }
    if (view === View.AI_INTERVIEW) {
      localStorage.setItem('ai_analysis_force_resume_select', '1');
      localStorage.setItem('ai_analysis_entry_source', 'bottom_nav');
      localStorage.removeItem('ai_analysis_step');
      localStorage.removeItem('ai_analysis_in_progress');
      localStorage.removeItem('ai_analysis_has_activity');
      setSingleHistory('/ai-interview');
      navigate('/ai-interview', { replace: true });
      return;
    }
    setSingleHistory(viewToPath(view));
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
      return <ScreenFallback label="加载中..." />;
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
        <AppOverlays
          toast={toast}
          confirmState={confirmState}
          setConfirmState={setConfirmState}
        />
        <Suspense fallback={<ScreenFallback />}>
          {renderView()}
        </Suspense>
        {showBottomNav && <BottomNav />}
      </div>
    </AppProvider>
  );
}

export default App;
