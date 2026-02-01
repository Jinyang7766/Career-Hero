// Vercel Serverless Function for AI Chat
import { GoogleGenerativeAI } from "@google/generative-ai";

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

    const ai = new GoogleGenerativeAI(apiKey);
    const model = ai.getGenerativeModel({ model: 'gemini-3-flash' });
    
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

    const prompt = `你是一位专业的简历顾问。请遵循以下原则：

📝 **风格要求**：克制、专业、极简
📏 **长度限制**：最多150字，分点说明
🎯 **内容重点**：提供可执行的具体建议
📋 **格式要求**：使用Markdown格式，适当使用emoji

**回复结构**：
- 简短开场（1句话）
- 2个关键点（使用数字列表）
- 每点不超过30字
- 结尾鼓励（1句话）

**避免**：
- 长篇大论
- 过多解释
- 重复内容
- 复杂术语

---

**用户问题**：${message}

**简历信息**：
${resumeDetails}

请基于以上信息提供简短专业的建议。`;

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
