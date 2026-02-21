export const cleanMicroInterviewAnswerLimit = (text: string) =>
  String(text || '')
    .replace(/[，,。\s]*请将回答控制在3分钟内[。！!？?]*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const cleanIntroLengthReminder = (text: string) =>
  String(text || '')
    .replace(/[^\n]*自我介绍偏长[^\n]*(\n)?/g, '')
    .replace(/[^\n]*后续请控制在1分钟内[^\n]*(\n)?/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const cleanRedundantReaskLine = (text: string) => {
  const source = String(text || '').trim();
  if (!source) return source;
  const hasSupplementHint = /请你在回答中明确补充|请在回答中明确补充|请在回答中补充|请补充以下要点|请围绕上述要点补充/i.test(source);
  if (!hasSupplementHint) return source;
  const next = source
    .split(/\r?\n/)
    .filter((line) => !/^请重新回答\s*[：:]/.test(String(line || '').trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return next || source;
};

export const normalizeInterviewReplyText = (text: string) => {
  const normalized = String(text || '').replace(/\*/g, '').trim();
  return cleanRedundantReaskLine(
    cleanIntroLengthReminder(
      cleanMicroInterviewAnswerLimit(normalized)
    )
  );
};

export const shouldTreatAsFollowUpSignal = (text: string) =>
  /回答(?:过短|不足|不完整|模糊|空泛|几乎为空)|信息量(?:不足|不够)|无法识别|无效内容|无法支持(?:面试)?评估|请(?:针对该问题)?重新回答|请先补充|请补充|请继续补充|当前问题[:：]|追问[:：]/.test(
    String(text || '')
  );
