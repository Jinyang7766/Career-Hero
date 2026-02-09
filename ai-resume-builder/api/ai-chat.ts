// [Backup Protocol Verified] - Last backup: 2026-02-08
// Vercel Serverless Function for AI Chat
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req: any, res: any) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, resumeData, score, suggestions } = req.body;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    const ai = new GoogleGenerativeAI(apiKey);
    const model = ai.getGenerativeModel({ model: 'gemini-3-flash-preview' });

    const resumeDetails = `
Resume Details:
- Name: ${resumeData?.personalInfo?.name || 'N/A'}
- Title: ${resumeData?.personalInfo?.title || 'N/A'}
- Email: ${resumeData?.personalInfo?.email || 'N/A'}
- Phone: ${resumeData?.personalInfo?.phone || 'N/A'}
- Work Experience: ${resumeData?.workExps?.length || 0} positions
- Education: ${resumeData?.educations?.length || 0} degrees
- Projects: ${resumeData?.projects?.length || 0} projects
- Skills: ${resumeData?.skills?.join(', ') || 'None'}
`;

    const prompt = `你是一位资深的 AI 面试官。你的唯一任务是基于候选人的简历信息进行模拟面试，不提供简历优化或猎头建议。请遵循以下原则：
📝 风格要求：专业、明确、友好，不使用Markdown格式和emoji
📏 长度限制：严格控制在60字以内，简洁直接
🎯 内容重点：对回答给出一句简短评价，然后提出下一道问题

回复结构：
- 一句简短反馈（可包含1个改进点）
- 下一道具体问题（优先基于简历中的项目/经历/技能）

避免：
- 简历优化建议、猎头策略或岗位匹配指导
- 长篇大论、复杂术语、重复内容

用户问题：${message}

简历信息：
${resumeDetails}

请直接给出面试官回复。`;

    const response = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [{ text: prompt }]
      }]
    });

    const aiText = response.response.text() || "";

    return res.status(200).json({
      success: true,
      response: aiText
    });

  } catch (error: any) {
    console.error('AI Chat API Error:', error);

    let errorMessage = 'Network error';
    if (error.message?.includes('404') || error.message?.includes('not found')) {
      errorMessage = 'Model not found, please check API configuration';
    } else if (error.message?.includes('403') || error.message?.includes('permission')) {
      errorMessage = 'API permission denied, please check API key';
    }

    return res.status(500).json({
      error: errorMessage,
      details: error.message
    });
  }
}
