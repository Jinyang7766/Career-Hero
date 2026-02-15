import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, ResumeData, ResumeSummary } from './types';
import { DatabaseService } from './src/database-service';
import { supabase } from './src/supabase-client';
import BottomNav from './components/BottomNav';
import Dashboard from './components/screens/Dashboard';
import Templates from './components/screens/Templates';
import Profile from './components/screens/Profile';
import Preview from './components/screens/Preview';
import Editor from './components/screens/Editor';
import Settings from './components/screens/Settings';
import AccountSecurity from './components/screens/AccountSecurity';
import Help from './components/screens/Help';
import History from './components/screens/History';
import AllResumes from './components/screens/AllResumes';
import AiAnalysis from './components/screens/AiAnalysis';
import Login from './components/screens/Login';
import Signup from './components/screens/Signup';
import ForgotPassword from './components/screens/ForgotPassword';
import DeletionPending from './components/screens/DeletionPending';
import MemberCenter from './components/screens/MemberCenter';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentView, setCurrentView] = useState<View>(View.LOGIN);
  const [history, setHistory] = useState<View[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isNavHidden, setIsNavHidden] = useState(false);

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

  // Show bottom nav on main tabs only (Editor has its own navigation)
  const showBottomNav = isAuthenticated && [View.DASHBOARD, View.AI_ANALYSIS, View.PROFILE, View.ALL_RESUMES].includes(currentView) && !isNavHidden;

  // Load user resumes when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadUserResumes();
    }
  }, [isAuthenticated]);

  // Check authentication status on mount
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
            // Update local user object with latest deletion status
            const updatedUser = { ...session.user, deletion_pending_until: profileResult.data.deletion_pending_until };
            setCurrentUser(updatedUser);
            setCurrentView(View.DELETION_PENDING);
          } else {
            setCurrentView(View.DASHBOARD);
          }
        } else {
          console.log('No active session');
          setCurrentView(View.LOGIN);
        }
      } catch (error) {
        console.error('Error checking auth status:', error);
        setCurrentView(View.LOGIN);
      }
    };

    checkAuth();
  }, []);

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
          if (!dateString) {
            return '时间未知';
          }

          const date = new Date(dateString);

          if (isNaN(date.getTime())) {
            return '时间格式错误';
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

          return {
            id: resume.id,
            title: resume.title,
            date: cleanedDate,
            score: resume.score,
            hasDot: resume.has_dot,
            optimizationStatus: resume.resume_data?.optimizationStatus || 'unoptimized',
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

      const result = await DatabaseService.createResume(user.id, title, resumeData);

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

  // Centralized Resume Data (Active Editing) - Start with empty data
  const [resumeData, setResumeData] = useState<ResumeData>({
    personalInfo: {
      name: '',
      title: '',
      email: '',
      phone: ''
    },
    workExps: [],
    educations: [],
    projects: [],
    skills: [],
    gender: ''
  });

  // Centralized All Resumes List - Start empty for new users
  const [allResumes, setAllResumes] = useState<ResumeSummary[]>([]);

  // Calculate Completeness
  const completeness = useMemo(() => {
    let score = 0;
    // Personal Info: 40 points total (10 each)
    if (resumeData.personalInfo.name) score += 10;
    if (resumeData.personalInfo.title) score += 10;
    if (resumeData.personalInfo.email) score += 10;
    if (resumeData.personalInfo.phone) score += 10;

    // Sections: 60 points total
    if (resumeData.workExps.length > 0) score += 20;
    if (resumeData.educations.length > 0) score += 20;
    if (resumeData.skills.length > 0) score += 10;
    if (resumeData.projects.length > 0) score += 10;

    return Math.min(score, 100);
  }, [resumeData]);

  // Check auth state on mount (mocking persistence)
  useEffect(() => {
    // In a real app, verify token or session here
    if (isAuthenticated && [View.LOGIN, View.SIGNUP, View.FORGOT_PASSWORD].includes(currentView)) {
      handleNavigate(View.DASHBOARD, true);
    }
  }, [isAuthenticated]);

  const handleLogin = (userData?: any) => {
    if (userData) {
      setCurrentUser(userData);
    }
    setIsAuthenticated(true);
    handleNavigate(View.DASHBOARD, true);
  };

  const handleLogout = () => {
    // Clear localStorage
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');

    setCurrentUser(null);
    setIsAuthenticated(false);
    setHistory([]);
    setCurrentView(View.LOGIN);
  };

  // Enhanced navigation handler
  const handleNavigate = (view: View, isRoot: boolean = false) => {
    if (isRoot) {
      setHistory([]); // Clear history for root navigation (like BottomNav tabs)
    } else {
      setHistory(prev => [...prev, currentView]); // Push current view to history
    }
    setCurrentView(view);
  };

  // Back button handler
  const handleGoBack = () => {
    if (history.length > 0) {
      const newHistory = [...history];
      const previousView = newHistory.pop();
      setHistory(newHistory);
      if (previousView) {
        setCurrentView(previousView);
        // Reset wizard mode when going back
        if (previousView === View.DASHBOARD) {
          setShowWizard(false);
        }
      }
    } else {
      // Fallback if history is empty
      setShowWizard(false);
      setCurrentView(View.DASHBOARD);
    }
  };

  // Bottom Nav click handler (resets history and wizard mode)
  const handleBottomNavClick = (view: View) => {
    const makeEmptyResumeData = () => ({
      personalInfo: {
        name: '',
        title: '',
        email: '',
        phone: '',
        location: '',
        linkedin: '',
        website: '',
        summary: '',
        avatar: ''
      },
      workExps: [],
      educations: [],
      projects: [],
      skills: [],
      summary: '',
      gender: ''
    });

    setShowWizard(false); // Reset wizard mode when navigating via BottomNav
    if (view === View.ALL_RESUMES) {
      setResumeData(makeEmptyResumeData());
    }
    if (view === View.AI_ANALYSIS) {
      localStorage.setItem('ai_analysis_entry_source', 'bottom_nav');
      // Only reset if user has not started any AI assistant flow yet
      const hasActivity = localStorage.getItem('ai_analysis_has_activity') === '1';
      if (!hasActivity) {
        localStorage.removeItem('ai_analysis_step');
        localStorage.removeItem('ai_analysis_in_progress');
      }
    }
    handleNavigate(view, true);
  };

  // Onboarding Wizard State
  const [showWizard, setShowWizard] = useState(false);

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
        setCurrentView(View.EDITOR);
      } else {
        alert('保存简历失败: ' + result.error?.message);
      }
    } catch (error) {
      console.error('Wizard complete error:', error);
      alert('保存简历出错');
    }
  };

  const renderView = () => {

    const commonProps = {
      setCurrentView: (view: View) => handleNavigate(view),
      goBack: handleGoBack,
      resumeData,
      setResumeData,
      completeness,
      allResumes,
      setAllResumes,
      createResume,
      loadUserResumes,
      currentUser,
      hasBottomNav: showBottomNav,
      setIsNavHidden
    };

    switch (currentView) {
      case View.LOGIN:
        return <Login setCurrentView={setCurrentView} onLogin={handleLogin} />;
      case View.SIGNUP:
        return <Signup setCurrentView={setCurrentView} onLogin={handleLogin} />;
      case View.FORGOT_PASSWORD:
        return <ForgotPassword setCurrentView={setCurrentView} goBack={() => setCurrentView(View.LOGIN)} />;
      case View.DASHBOARD:
        return <Dashboard {...commonProps} createNewResume={() => {
          // Always start with a fully-empty resume. This prevents stale fields from a previously opened resume
          // (especially when the user viewed an existing resume but didn't edit).
          setResumeData({
            personalInfo: {
              name: '',
              title: '',
              email: '',
              phone: '',
              location: '',
              linkedin: '',
              website: '',
              summary: '',
              avatar: ''
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
            analysisSnapshot: undefined,
            aiSuggestionFeedback: undefined,
            interviewSessions: undefined,
            exportHistory: undefined
          });
          setShowWizard(true);
          handleNavigate(View.EDITOR);
        }} />;
      case View.EDITOR:
        return <Editor {...commonProps} wizardMode={showWizard} />;
      case View.TEMPLATES:
        return <Editor {...commonProps} />;
      case View.AI_ANALYSIS:
        return <AiAnalysis {...commonProps} />;
      case View.PROFILE:
        return <Profile {...commonProps} />;
      case View.PREVIEW:
        return <Preview {...commonProps} />;
      case View.EDITOR:
        return <Editor {...commonProps} />;
      case View.SETTINGS:
        return <Settings {...commonProps} onLogout={handleLogout} />;
      case View.ACCOUNT_SECURITY:
        return <AccountSecurity {...commonProps} onLogout={handleLogout} />;
      case View.HELP:
        return <Help {...commonProps} />;
      case View.HISTORY:
        return <History {...commonProps} />;
      case View.ALL_RESUMES:
        return <AllResumes {...commonProps} />;
      case View.MEMBER_CENTER:
        return <MemberCenter {...commonProps} />;
      case View.DELETION_PENDING:
        return <DeletionPending {...commonProps} onLogout={handleLogout} />;
      default:
        // Fallback based on auth status
        return isAuthenticated ? <Dashboard {...commonProps} createNewResume={() => setShowWizard(true)} /> : <Login setCurrentView={setCurrentView} onLogin={handleLogin} />;
    }
  };



  const ToastOverlay = () => {
    if (!toast) return null;
    // 使用磨砂红色 (Frosted Red: translucent red + backdrop blur)
    const cls = 'bg-red-500/85 backdrop-blur-xl text-white border-red-400/30';

    return (
      <div className="fixed inset-x-0 top-3 z-[9999] flex justify-center px-4 pointer-events-none">
        <div className={`pointer-events-auto w-full max-w-[480px] rounded-3xl shadow-2xl shadow-red-500/40 border ${cls} animate-in slide-in-from-top duration-300`}>
          <div className="px-5 py-4 flex items-center gap-3">
            <div className="size-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[20px]">notifications</span>
            </div>
            <div className="flex-1">
              <div className="text-[10px] uppercase tracking-widest font-black opacity-60 leading-none mb-1">System</div>
              <div className="text-[14px] leading-snug font-bold">{toast.msg}</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const ConfirmModal = () => {
    if (!confirmState) return null;
    const onCancel = () => {
      confirmState.resolve(false);
      setConfirmState(null);
    };
    const onOk = () => {
      confirmState.resolve(true);
      setConfirmState(null);
    };
    return (
      <div className="fixed inset-0 z-[10000] flex items-center justify-center px-6">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" onClick={onCancel} />
        <div className="relative w-full max-w-[360px] rounded-[32px] border border-red-400/30 bg-red-500/90 backdrop-blur-2xl text-white shadow-2xl p-8 animate-in zoom-in-95 duration-200">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="size-16 rounded-full bg-white/20 flex items-center justify-center mb-2">
              <span className="material-symbols-outlined text-white text-[32px]">warning</span>
            </div>
            <h3 className="text-xl font-bold tracking-tight">确认操作</h3>
            <p className="text-sm text-white/90 leading-relaxed font-medium mb-2">
              {confirmState.message}
            </p>
          </div>
          <div className="mt-8 flex flex-col gap-3">
            <button
              onClick={onOk}
              className="w-full rounded-2xl bg-white text-red-600 py-3.5 font-bold hover:bg-white/90 active:scale-[0.98] transition-all shadow-lg"
            >
              确定
            </button>
            <button
              onClick={onCancel}
              className="w-full rounded-2xl bg-black/20 text-white/90 py-3.5 font-bold hover:bg-black/30 active:scale-[0.98] transition-all border border-white/10"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark text-slate-900 dark:text-white max-w-md mx-auto shadow-2xl overflow-hidden relative">
      <ToastOverlay />
      <ConfirmModal />
      {renderView()}
      {showBottomNav && <BottomNav currentView={currentView} setCurrentView={handleBottomNavClick} />}
    </div>
  );
}

export default App;
