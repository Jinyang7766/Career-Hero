import React from 'react';
import { pushRuntimeTrace, writeLastRuntimeError } from '../src/runtime-diagnostics';

class ScreenErrorBoundary extends React.Component<
  { children: React.ReactNode; title?: string },
  { hasError: boolean; message: string; errorId: string }
> {
  constructor(props: { children: React.ReactNode; title?: string }) {
    super(props);
    this.state = { hasError: false, message: '', errorId: '' };
  }

  static getDerivedStateFromError(error: any) {
    return {
      hasError: true,
      message: String(error?.message || error || '未知错误'),
    };
  }

  componentDidCatch(error: any, errorInfo: any) {
    const errorId = `err_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    this.setState({ errorId });
    pushRuntimeTrace('screen_error_boundary', 'caught', {
      title: this.props.title || 'unknown',
      message: String(error?.message || error || ''),
      errorId,
    });
    writeLastRuntimeError({
      errorId,
      title: this.props.title || '',
      message: String(error?.message || error || ''),
      stack: String(error?.stack || ''),
      componentStack: String(errorInfo?.componentStack || ''),
    });
    console.error('[ScreenErrorBoundary]', error, errorInfo);
  }

  private getDiagnosticText() {
    try {
      const raw = localStorage.getItem('career_hero_last_error') || '';
      return String(raw || '').slice(-12000);
    } catch {
      return '';
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    const diagnosticText = this.getDiagnosticText();
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-700">
          <div className="text-base font-bold">
            {this.props.title || '页面加载失败'}
          </div>
          <div className="mt-2 text-sm break-all">{this.state.message}</div>
          {this.state.errorId && (
            <div className="mt-2 text-xs break-all">错误ID: {this.state.errorId}</div>
          )}
          {diagnosticText && (
            <button
              className="mt-3 rounded-lg border border-rose-300 bg-white/70 px-3 py-1.5 text-xs font-semibold"
              type="button"
              onClick={() => {
                try {
                  void navigator.clipboard?.writeText(diagnosticText);
                  alert('诊断信息已复制');
                } catch {
                  alert('复制失败，请截图当前页面并联系管理员');
                }
              }}
            >
              复制诊断信息
            </button>
          )}
        </div>
      </div>
    );
  }
}

export default ScreenErrorBoundary;
