// AI Service - 调用Vercel Serverless API
export class AIService {
  static async sendMessage(message: string, resumeData: any, score: number, suggestions: any[]) {
    try {
      console.log('Sending message to AI API...');
      
      const response = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          resumeData,
          score,
          suggestions
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('AI API response received:', data);
      
      return {
        success: true,
        text: data.response
      };
    } catch (error) {
      console.error('AI Service Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
