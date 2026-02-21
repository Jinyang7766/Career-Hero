export type AnnotationItem = {
  id: string;
  title: string;
  reason: string;
  targetId?: string;
  targetField?: string;
  originalValue?: string;
  suggestedValue?: string;
};

export const groupAnnotationsBySection = (annotations: Array<any>) =>
  annotations.reduce<Record<string, AnnotationItem[]>>((acc, item) => {
    const key = item.section || 'other';
    if (!acc[key]) acc[key] = [];
    acc[key].push({
      id: item.id,
      title: item.title,
      reason: item.reason,
      targetId: item.targetId,
      targetField: item.targetField,
      originalValue: item.originalValue,
      suggestedValue: item.suggestedValue,
    });
    return acc;
  }, {});

export const getSectionNotes = (annBySection: Record<string, AnnotationItem[]>, section: string) => annBySection[section] || [];

export const normalizeNoteText = (v: string) => String(v || '')
  .trim()
  .replace(/\s+/g, ' ')
  .replace(/^该句[描述表达内容信息结构]*[，,:：\s]*/i, '')
  .replace(/^此句[描述表达内容信息结构]*[，,:：\s]*/i, '');

export const noteSignature = (note: { title?: string; reason?: string }) => (
  `${normalizeNoteText(String(note.title || ''))}||${normalizeNoteText(String(note.reason || ''))}`.toLowerCase()
);

export const normalizeDisplayPunctuation = (text: string) => String(text || '')
  .replace(/[；;]+(?=[。！？!?])/g, '')
  .replace(/[，,]+(?=[。！？!?])/g, '')
  .replace(/[：:]+(?=[。！？!?])/g, '')
  .replace(/[。]{2,}/g, '。')
  .replace(/[；;]{2,}/g, '；')
  .replace(/[，,]{2,}/g, '，')
  .replace(/\s+([，。；：！？])/g, '$1')
  .trim();

export const getUniformSectionNote = (annBySection: Record<string, AnnotationItem[]>, section: string) => {
  const notes = getSectionNotes(annBySection, section);
  if (!notes.length) return null;
  const counts = new Map<string, { count: number; title: string; reason: string }>();
  notes.forEach((n) => {
    const title = normalizeNoteText(String(n.title || ''));
    const reason = normalizeNoteText(String(n.reason || ''));
    const sig = `${title}||${reason}`.toLowerCase();
    const prev = counts.get(sig);
    if (prev) {
      prev.count += 1;
    } else {
      counts.set(sig, { count: 1, title, reason });
    }
  });
  const top = Array.from(counts.values()).sort((a, b) => b.count - a.count)[0];
  if (!top || top.count < 2 || top.count !== notes.length) return null;
  return top;
};

export const buildModuleOverview = (
  annBySection: Record<string, AnnotationItem[]>,
  section: string,
  hasContent = true
): string | null => {
  if (section === 'projects' && !hasContent) {
    const notes = getSectionNotes(annBySection, 'projects');
    if (!notes.length) return null;
    const merged = notes
      .map((n) => `${String(n.title || '')} ${String(n.reason || '')}`)
      .join(' ');
    const shouldAddProjects = /新增|补充|添加|增加|项目经历|项目经验|项目模块|AI项目|项目字段/i.test(merged);
    if (!shouldAddProjects) return null;
    const firstReason = normalizeNoteText(String(notes[0]?.reason || ''));
    if (firstReason) return normalizeDisplayPunctuation(`当前暂无项目经历。${firstReason}`);
    return '当前暂无项目经历，建议新增项目经历模块，并补充与目标岗位相关的代表性项目。';
  }

  const uniform = getUniformSectionNote(annBySection, section);
  if (uniform?.reason) {
    const uniformText = normalizeNoteText(uniform.reason).replace(/[。！？!?；;，,、\s]+$/g, '');
    const sectionActionByType: Record<string, string> = {
      personalInfo: '补齐关键信息并统一呈现格式，确保招聘方可快速判断匹配度。',
      summary: '按“岗位关键词-核心能力-可量化成果”三段重写简介，减少空泛表达。',
      workExps: '按“职责范围-关键动作-量化结果”补全每段经历，优先补充指标。',
      projects: '按“背景目标-个人贡献-结果复盘”重写项目描述，突出个人价值。',
      skills: '按岗位相关性对技能分层，并补充可证明的工具/场景。',
    };
    return normalizeDisplayPunctuation(`当前模块存在共性问题：${uniformText || '表达与岗位匹配度不足'}。建议${sectionActionByType[section] || '围绕岗位匹配度进行针对性优化。'}`);
  }

  const source = getSectionNotes(annBySection, section);
  const defaultOverviewBySection: Record<string, string> = {
    personalInfo: '本模块信息完整，联系方式清晰可读。',
    summary: '本模块结构完整，建议继续强化岗位匹配亮点。',
    workExps: '本模块结构完整，建议继续强化结果导向与关键成果。',
    projects: '本模块结构完整，建议继续突出项目目标、行动与结果。',
    skills: '本模块结构完整，建议继续聚焦与目标岗位高度相关的技能。',
  };
  if (!source.length) return defaultOverviewBySection[section] || '本模块信息结构完整。';
  const text = source
    .map((n) => `${String(n.title || '')} ${String(n.reason || '')}`)
    .join(' ');
  const sectionDimensions: Record<string, Array<{ label: string; regex: RegExp }>> = {
    personalInfo: [
      { label: '信息完整性', regex: /信息|联系方式|邮箱|电话|姓名|title|职位/i },
      { label: '求职定位', regex: /定位|方向|岗位|职能|匹配/i },
      { label: '呈现规范性', regex: /规范|格式|可读|清晰|统一/i },
    ],
    summary: [
      { label: '岗位匹配亮点', regex: /匹配|岗位|关键词|契合|相关/i },
      { label: '价值主张', regex: /优势|价值|亮点|核心竞争力|定位/i },
      { label: '表达凝练度', regex: /精炼|冗长|结构|逻辑|表达|叙述/i },
    ],
    workExps: [
      { label: '职责边界', regex: /职责|边界|负责|分工|角色/i },
      { label: '业务动作', regex: /动作|方法|策略|执行|推进|落地/i },
      { label: '结果指标', regex: /结果|成果|指标|量化|roi|gmv|转化|增长|点击率/i },
    ],
    projects: [
      { label: '问题场景', regex: /问题|场景|背景|目标/i },
      { label: '方案方法', regex: /方案|方法|设计|实现|技术路线/i },
      { label: '个人贡献与结果', regex: /贡献|结果|产出|效果|指标|量化/i },
    ],
    skills: [
      { label: '技能分层', regex: /技能|能力|熟练|掌握|精通/i },
      { label: '工具与平台', regex: /工具|平台|系统|软件|excel|sql|python|bi/i },
      { label: '岗位相关性', regex: /岗位|业务|相关|匹配|应用场景/i },
    ],
  };
  const defs = sectionDimensions[section] || [];
  const dimensions = defs.filter((d) => d.regex.test(text)).map((d) => d.label);
  if (!dimensions.length) return defaultOverviewBySection[section] || '本模块建议已识别，可继续提升表达清晰度。';

  const reasons = source
    .map((n) => normalizeNoteText(String(n.reason || '')))
    .filter(Boolean);
  const reasonCounts = new Map<string, number>();
  reasons.forEach((r) => reasonCounts.set(r, (reasonCounts.get(r) || 0) + 1));
  const topReasons = Array.from(reasonCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([r]) => r.replace(/[。！？!?；;，,、\s]+$/g, ''))
    .slice(0, 2);

  const sectionNameByKey: Record<string, string> = {
    personalInfo: '基本信息',
    summary: '个人简介',
    workExps: '工作经历',
    projects: '项目经历',
    skills: '技能模块',
  };
  const dimActionBySection: Record<string, Record<string, string>> = {
    personalInfo: {
      信息完整性: '补齐姓名/联系方式/求职岗位等关键项',
      求职定位: '明确目标岗位与职能关键词',
      呈现规范性: '统一字段格式，避免口语化或冗余',
    },
    summary: {
      岗位匹配亮点: '补入与目标岗位直接相关的经历关键词',
      价值主张: '明确“你能解决什么问题”',
      表达凝练度: '压缩泛化表述，保留高价值信息',
    },
    workExps: {
      职责边界: '明确你负责的范围与角色边界',
      业务动作: '补充具体方法、策略与执行动作',
      结果指标: '补入可验证的结果指标与变化幅度',
    },
    projects: {
      问题场景: '写清业务背景、目标与挑战',
      方案方法: '补充关键方案与实现路径',
      个人贡献与结果: '强调个人贡献并给出结果数据',
    },
    skills: {
      技能分层: '区分熟练度并分层展示',
      工具与平台: '补充实际使用的工具与平台',
      岗位相关性: '保留高相关技能，弱化无关信息',
    },
  };

  const topDims = dimensions.slice(0, 3);
  const actions = topDims
    .map((d) => dimActionBySection[section]?.[d])
    .filter(Boolean)
    .slice(0, 2);
  const sectionLabel = sectionNameByKey[section] || '该模块';
  const issueText = topReasons.length
    ? `主要问题：${topReasons.join('；')}。`
    : '主要问题：当前内容与岗位价值的连接仍不够充分。';
  const actionText = actions.length
    ? `优化建议：${actions.join('；')}。`
    : '优化建议：围绕岗位要求补充细节、过程与结果，提升说服力。';
  return normalizeDisplayPunctuation(`当前${sectionLabel}已有基础信息，但在${topDims.join('、')}方面仍有提升空间。${issueText}${actionText}`);
};

export const normalizeForMatch = (v: string) => String(v || '')
  .toLowerCase()
  .replace(/\s+/g, '')
  .replace(/[，,。.;；:：\-—_()（）\[\]【】'"`]/g, '');

export const splitSentences = (text: string) => {
  const chunks = (String(text || '').match(/[^。！？!?；;]+[。！？!?；;]?/g) || [])
    .map((s) => s.trim())
    .filter(Boolean);
  return chunks.length ? chunks : [String(text || '').trim()].filter(Boolean);
};

export const isDescriptionNote = (note: AnnotationItem) => {
  const field = String(note.targetField || '').trim().toLowerCase();
  if (!field) return true;
  return ['description', 'content', 'responsibility', 'achievement', 'highlights'].includes(field);
};

export const isModuleOnlyNote = (note: AnnotationItem) => {
  const blob = `${String(note.title || '')} ${String(note.reason || '')}`.toLowerCase();
  const moduleSignals = /(补充|新增|添加|增加|补齐|补全|完善|扩展|补入|增补|单独以项目|项目形式|新增项目|补充项目|项目模块|模块化)/i;
  if (moduleSignals.test(blob)) return true;
  const field = String(note.targetField || '').trim().toLowerCase();
  if (!field && /(模块|字段|经历|项目)/i.test(blob)) return true;
  return false;
};

