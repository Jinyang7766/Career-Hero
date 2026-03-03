export type GuidedFlowStep =
  | 'step1_profile_input'
  | 'step2_profile_confirm'
  | 'step3_mode_and_resume'
  | 'step4_report'
  | 'step5_refine'
  | 'step6_interview';

export type GuidedFlowSource = 'guided_flow' | 'legacy_entry' | 'system';

export type GuidedFlowAnalysisMode = 'generic' | 'targeted';

export type GuidedFlowState = {
  step: GuidedFlowStep;
  resume_id?: string;
  jd_key?: string;
  analysis_mode?: GuidedFlowAnalysisMode;
  updated_at?: string;
  source?: GuidedFlowSource;
};

