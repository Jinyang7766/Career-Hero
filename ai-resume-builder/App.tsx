import React, { useState, useEffect, useMemo } from 'react';
import { View, ResumeData, ResumeSummary } from './types';
import { API_BASE_URL } from './src/api-config';
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

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentView, setCurrentView] = useState<View>(View.LOGIN);
  const [history, setHistory] = useState<View[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [error, setError] = useState<string>('');

  // Load user resumes when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadUserResumes();
    }
  }, [isAuthenticated]);

  // Check authentication status on mount and handle auth callback
  useEffect(() => {
    const initializeAuth = async () => {
      // 首先检查当前会话
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        console.log('检测到现有会话，自动登录');
        localStorage.setItem('authToken', session.access_token);
        localStorage.setItem('currentUser', JSON.stringify(session.user));
        setCurrentUser(session.user);
        setIsAuthenticated(true);
        setCurrentView(View.DASHBOARD);
        return;
      }

      // 常规的认证检查
      const token = localStorage.getItem('authToken');
      const user = localStorage.getItem('user');
      
      if (token && user) {
        const userData = JSON.parse(user);
        setCurrentUser(userData);
        setIsAuthenticated(true);
        setCurrentView(View.DASHBOARD);
      }
    };

    // 监听认证状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('认证状态变化:', event, session);
      
      if (event === 'SIGNED_IN' && session) {
        console.log('用户已登录');
        localStorage.setItem('authToken', session.access_token);
        localStorage.setItem('currentUser', JSON.stringify(session.user));
        setCurrentUser(session.user);
        setIsAuthenticated(true);
        setCurrentView(View.DASHBOARD);
      } else if (event === 'SIGNED_OUT') {
        console.log('用户已登出');
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        setCurrentUser(null);
        setIsAuthenticated(false);
        setCurrentView(View.LOGIN);
      }
    });

    initializeAuth();

    // 清理订阅
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Load user resumes from backend
  const loadUserResumes = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE_URL}/api/resumes`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const resumes: ResumeSummary[] = data.resumes.map((resume: any) => ({
          id: resume.id,
          title: resume.title,
          date: new Date(resume.date).toLocaleDateString('zh-CN'),
          score: resume.score,
          hasDot: resume.hasDot,
          thumbnail: (
            <>
              <div className="absolute top-2 left-1.5 w-8 h-1 bg-slate-300 dark:bg-slate-500 rounded-sm"></div>
              <div className="absolute top-4 left-1.5 w-10 h-0.5 bg-slate-200 dark:bg-slate-600 rounded-sm"></div>
              <div className="absolute top-9 left-1.5 w-11 h-8 bg-slate-100 dark:bg-slate-800 rounded-sm"></div>
            </>
          )
        }));
        setAllResumes(resumes);
      }
    } catch (error) {
      console.error('Failed to load resumes:', error);
    }
  };

  // Create new resume
  const createResume = async (title: string) => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_BASE_URL}/api/resumes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title,
          resume_data: resumeData,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Reload resumes to get the latest list
        await loadUserResumes();
        return data.resume;
      } else {
        throw new Error('Failed to create resume');
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
      }
    } else {
      // Fallback if history is empty
      setCurrentView(View.DASHBOARD);
    }
  };

  // Bottom Nav click handler (resets history)
  const handleBottomNavClick = (view: View) => {
    handleNavigate(view, true);
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
      currentUser
    };

    switch (currentView) {
      case View.LOGIN:
        return <Login setCurrentView={setCurrentView} onLogin={handleLogin} />;
      case View.SIGNUP:
        return <Signup setCurrentView={setCurrentView} onLogin={handleLogin} />;
      case View.FORGOT_PASSWORD:
        return <ForgotPassword setCurrentView={setCurrentView} goBack={() => setCurrentView(View.LOGIN)} />;
      case View.DASHBOARD:
        return <Dashboard {...commonProps} />;
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
        return <AccountSecurity {...commonProps} />;
      case View.HELP:
        return <Help {...commonProps} />;
      case View.HISTORY:
        return <History {...commonProps} />;
      case View.ALL_RESUMES:
        return <AllResumes {...commonProps} />;
      default:
         // Fallback based on auth status
        return isAuthenticated ? <Dashboard {...commonProps} /> : <Login setCurrentView={setCurrentView} onLogin={handleLogin} />;
    }
  };

  const showBottomNav = isAuthenticated && [View.DASHBOARD, View.TEMPLATES, View.AI_ANALYSIS, View.PROFILE].includes(currentView);

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark text-slate-900 dark:text-white max-w-md mx-auto shadow-2xl overflow-hidden relative">
      {renderView()}
      {showBottomNav && <BottomNav currentView={currentView} setCurrentView={handleBottomNavClick} />}
    </div>
  );
}

export default App;