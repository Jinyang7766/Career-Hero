import React from 'react';
import PageStatusFeedback from '../../../shared/PageStatusFeedback';

const FinalAnalysisLoadingPage: React.FC = () => (
  <div className="flex flex-col min-h-screen items-center justify-center bg-background-light dark:bg-background-dark">
    <PageStatusFeedback
      status="loading"
      title="正在生成分析报告..."
      message="AI 正在整合职业画像、简历与岗位信息，生成评分和优化建议。这会需要一点时间，请耐心等待..."
      icon="summarize"
    />
  </div>
);

export default FinalAnalysisLoadingPage;
