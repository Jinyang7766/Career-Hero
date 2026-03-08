type Params = {
  isEditMode: boolean;
  isSavingEdit: boolean;
  hasDirtyChanges: boolean;
  isGenerating: boolean;
};

export type PreviewExportGuardState = {
  disabled: boolean;
  reason: string;
  helperText: string;
  buttonText: string;
};

export const getPreviewExportGuardState = ({
  isEditMode,
  isSavingEdit,
  hasDirtyChanges,
  isGenerating,
}: Params): PreviewExportGuardState => {
  if (isGenerating) {
    return {
      disabled: true,
      reason: 'PDF 正在生成中，请稍候。',
      helperText: '正在导出 PDF，请耐心等待下载完成。',
      buttonText: '生成中...',
    };
  }

  if (isSavingEdit) {
    return {
      disabled: true,
      reason: '编辑内容保存中，请稍后再导出。',
      helperText: '请等待当前编辑保存完成后再导出 PDF。',
      buttonText: '保存中，暂不可导出',
    };
  }

  if (isEditMode) {
    return {
      disabled: true,
      reason: '请先点击右上角「完成」并保存编辑，再导出 PDF。',
      helperText: '请先完成编辑。',
      buttonText: '请先完成编辑',
    };
  }

  if (hasDirtyChanges) {
    return {
      disabled: true,
      reason: '检测到未保存改动，请先保存后再导出。',
      helperText: '存在未保存改动。请先保存，避免导出旧内容。',
      buttonText: '请先保存改动',
    };
  }

  return {
    disabled: false,
    reason: '',
    helperText: '注意：PDF导出样式取决于后端生成配置，可能与预览略有差异。',
    buttonText: '导出 PDF',
  };
};
