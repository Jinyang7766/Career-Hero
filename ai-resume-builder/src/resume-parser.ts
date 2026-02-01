import { GoogleGenerativeAI } from "@google/generative-ai";
import { ResumeData, ExperienceItem } from "../types";

export interface ParsedResume {
  personalInfo: {
    name: string;
    title: string;
    email: string;
    phone: string;
  };
  workExps: ExperienceItem[];
  educations: ExperienceItem[];
  projects: ExperienceItem[];
  skills: string[];
}

export class ResumeParser {
  private static genAI: GoogleGenerativeAI | null = null;

  private static getModel() {
    if (!this.genAI) {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('API密钥未配置');
      }
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
    return this.genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });
  }

  /**
   * 解析文本格式的简历
   */
  static async parseTextResume(text: string): Promise<ParsedResume> {
    console.log('开始解析文本简历...');
    
    const model = this.getModel();
    
    const prompt = `你是一名专业的简历解析专家。请从以下文本中提取简历信息，并严格按照JSON格式返回。

文本内容：
${text}

请返回以下JSON格式的简历数据：
{
  "personalInfo": {
    "name": "姓名",
    "title": "求职意向",
    "email": "邮箱",
    "phone": "电话"
  },
  "workExps": [
    {
      "title": "职位名称",
      "subtitle": "公司名称",
      "date": "工作时间",
      "description": "工作描述"
    }
  ],
  "educations": [
    {
      "title": "学校名称",
      "subtitle": "专业",
      "date": "时间",
      "description": "描述"
    }
  ],
  "projects": [
    {
      "title": "项目名称",
      "subtitle": "项目类型",
      "date": "时间",
      "description": "项目描述"
    }
  ],
  "skills": ["技能1", "技能2", "技能3"]
}

要求：
1. 如果某个字段无法提取，请使用空字符串 ""
2. 工作经历、教育经历、项目经历如果没有，请返回空数组 []
3. 技能如果没有，请返回空数组 []
4. 确保返回的是有效的JSON格式，不要包含任何其他文字
5. 时间格式尽量统一为 "2020.01 - 2023.12" 这样的格式`;

    try {
      const response = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });
      
      const aiText = response.response.text() || "";
      console.log('AI解析响应:', aiText);
      
      // 清理可能的markdown代码块
      const cleanText = aiText.replace(/```json\n?|\n?```/g, '').trim();
      
      let parsedData: ParsedResume;
      try {
        parsedData = JSON.parse(cleanText);
      } catch (parseError) {
        console.error('JSON解析失败:', parseError);
        console.log('原始AI响应:', aiText);
        throw new Error('AI返回的数据格式不正确');
      }
      
      // 数据验证和清理
      const validatedData: ParsedResume = {
        personalInfo: {
          name: parsedData.personalInfo?.name || '',
          title: parsedData.personalInfo?.title || '',
          email: parsedData.personalInfo?.email || '',
          phone: parsedData.personalInfo?.phone || ''
        },
        workExps: (parsedData.workExps || []).map((exp, index) => ({
          id: Date.now() + index,
          title: exp.title || '',
          subtitle: exp.subtitle || '',
          date: exp.date || '',
          description: exp.description || ''
        })),
        educations: (parsedData.educations || []).map((edu, index) => ({
          id: Date.now() + index + 1000,
          title: edu.title || '',
          subtitle: edu.subtitle || '',
          date: edu.date || '',
          description: edu.description || ''
        })),
        projects: (parsedData.projects || []).map((proj, index) => ({
          id: Date.now() + index + 2000,
          title: proj.title || '',
          subtitle: proj.subtitle || '',
          date: proj.date || '',
          description: proj.description || ''
        })),
        skills: Array.isArray(parsedData.skills) ? parsedData.skills.filter(skill => skill && skill.trim()) : []
      };
      
      console.log('解析完成的简历数据:', validatedData);
      return validatedData;
      
    } catch (error) {
      console.error('简历解析失败:', error);
      throw new Error(`简历解析失败: ${error.message}`);
    }
  }

  /**
   * 解析PDF文件（客户端解析）
   */
  static async parsePDFResume(file: File): Promise<ParsedResume> {
    console.log('开始解析PDF简历...');
    
    // 检查文件大小（限制10MB）
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('PDF文件大小不能超过10MB');
    }
    
    // 检查文件类型
    if (file.type !== 'application/pdf') {
      throw new Error('请上传PDF格式的文件');
    }
    
    try {
      // 直接使用客户端解析
      return await this.parsePDFClientSide(file);
      
    } catch (error) {
      console.error('PDF解析失败:', error);
      throw new Error('PDF解析失败，请确保文件格式正确且包含可提取的文本');
    }
  }

  /**
   * 客户端PDF解析（需要pdf.js库）
   */
  private static async parsePDFClientSide(file: File): Promise<ParsedResume> {
    try {
      // 动态加载pdf.js库
      const pdfjsLib = await import('pdfjs-dist');
      
      // 设置worker
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      
      // 读取文件
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      // 提取所有页面的文本
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        fullText += pageText + '\n';
      }
      
      console.log('PDF文本提取完成，长度:', fullText.length);
      
      // 使用文本解析方法
      return await this.parseTextResume(fullText);
      
    } catch (error) {
      console.error('客户端PDF解析失败:', error);
      throw new Error('PDF解析失败，请确保文件格式正确');
    }
  }

  /**
   * 将解析的数据转换为ResumeData格式
   */
  static convertToResumeData(parsedData: ParsedResume): Omit<ResumeData, 'id'> {
    return {
      personalInfo: parsedData.personalInfo,
      workExps: parsedData.workExps,
      educations: parsedData.educations,
      projects: parsedData.projects,
      skills: parsedData.skills,
      gender: ''
    };
  }
}
