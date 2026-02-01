// Vercel Serverless Function for AI Chat
import { GoogleGenAI } from "@google/genai";

export default async function handler(req: any, res: any) {
  // 只允许POST请求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, resumeData, score, suggestions } = req.body;
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'API密钥未配置' });
    }

    const ai = new GoogleGenAI({ apiKey });
    
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
- Current Score: ${score}/100
`;

    const prompt = `You are an expert AI resume consultant and career advisor.

${resumeDetails}

User Question: ${message}

Please provide professional and actionable advice. Format your response in a clear, readable way with appropriate use of emojis and formatting.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });

    const aiText = response.text || "";

    return res.status(200).json({
      success: true,
      response: aiText
    });

  } catch (error) {
    console.error('AI Chat API Error:', error);
    
    let errorMessage = '网络连接异常';
    if (error.message?.includes('404') || error.message?.includes('not found')) {
      errorMessage = '模型未找到，请检查API配置';
    } else if (error.message?.includes('403') || error.message?.includes('permission')) {
      errorMessage = 'API权限不足，请检查API密钥';
    }

    return res.status(500).json({
      error: errorMessage,
      details: error.message
    });
  }
}
