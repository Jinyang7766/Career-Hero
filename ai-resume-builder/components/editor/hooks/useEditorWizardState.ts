import { useEffect, useMemo, useRef, useState } from 'react';
import type { ResumeData } from '../../../types';

type WizardStep = 'import' | 'personal' | 'work' | 'education' | 'projects' | 'skills' | 'summary';

const WIZARD_STEPS: { key: WizardStep; label: string; icon: string }[] = [
  { key: 'import', label: '导入简历', icon: 'upload_file' },
  { key: 'personal', label: '个人信息', icon: 'person' },
  { key: 'work', label: '工作经历', icon: 'work' },
  { key: 'education', label: '教育背景', icon: 'school' },
  { key: 'projects', label: '项目经历', icon: 'rocket_launch' },
  { key: 'skills', label: '专业技能', icon: 'extension' },
  { key: 'summary', label: '个人总结', icon: 'auto_awesome' },
];

export const useEditorWizardState = (resumeData: ResumeData) => {
  const [currentStep, setCurrentStep] = useState<WizardStep>('import');
  const [hasTouchedProjects, setHasTouchedProjects] = useState(false);
  const [hasImportedResume, setHasImportedResume] = useState(false);
  const [showImportSuccess, setShowImportSuccess] = useState(false);
  const suppressStepResetOnNextIdChangeRef = useRef(false);
  const lastProcessedResumeIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (resumeData?.id && resumeData.id !== lastProcessedResumeIdRef.current) {
      if (suppressStepResetOnNextIdChangeRef.current) {
        lastProcessedResumeIdRef.current = resumeData.id;
        suppressStepResetOnNextIdChangeRef.current = false;
        return;
      }
      setCurrentStep('personal');
      setHasImportedResume(true);
      setShowImportSuccess(false);
      if ((resumeData.projects || []).length > 0) {
        setHasTouchedProjects(true);
      }
      lastProcessedResumeIdRef.current = resumeData.id;
    }
  }, [resumeData?.id, resumeData?.projects]);

  const currentStepIndex = useMemo(
    () => WIZARD_STEPS.findIndex(s => s.key === currentStep),
    [currentStep]
  );
  const progress = useMemo(
    () => ((currentStepIndex + 1) / WIZARD_STEPS.length) * 100,
    [currentStepIndex]
  );

  return {
    WIZARD_STEPS,
    currentStep,
    setCurrentStep,
    currentStepIndex,
    progress,
    hasTouchedProjects,
    setHasTouchedProjects,
    hasImportedResume,
    setHasImportedResume,
    showImportSuccess,
    setShowImportSuccess,
    suppressStepResetOnNextIdChangeRef,
  };
};
