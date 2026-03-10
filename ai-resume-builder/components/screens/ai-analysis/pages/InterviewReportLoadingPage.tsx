import React from 'react';
import PageStatusFeedback from '../../../shared/PageStatusFeedback';

const InterviewReportLoadingPage: React.FC = () => (
  <div className="flex flex-col min-h-screen items-center justify-center bg-background-light dark:bg-background-dark">
    <PageStatusFeedback
      status="loading"
      title="正在生成面试报告..."
      message="AI 正在整理本场面试对话与作答表现，生成综合评估与改进建议。这会需要一点时间，请耐心等待..."
      icon="fact_check"
    />
  </div>
);

export default InterviewReportLoadingPage;
