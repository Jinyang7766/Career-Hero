import React from 'react';

class ScreenErrorBoundary extends React.Component<
  { children: React.ReactNode; title?: string },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode; title?: string }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: any) {
    return {
      hasError: true,
      message: String(error?.message || error || '未知错误'),
    };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('[ScreenErrorBoundary]', error, errorInfo);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-700">
          <div className="text-base font-bold">
            {this.props.title || '页面加载失败'}
          </div>
          <div className="mt-2 text-sm break-all">{this.state.message}</div>
        </div>
      </div>
    );
  }
}

export default ScreenErrorBoundary;

