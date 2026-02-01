export default async function handler(req: any, res: any) {
  // 只处理POST请求
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    console.log('开始处理PDF解析请求...');
    
    // 由于Vercel Serverless Functions不直接支持FormData，
    // 我们需要使用客户端PDF解析
    return res.status(400).json({
      success: false,
      error: '服务端PDF解析暂不支持，请使用客户端解析功能',
      suggestion: '请使用文本粘贴功能，或确保浏览器支持客户端PDF解析'
    });
    
  } catch (error) {
    console.error('PDF解析失败:', error);
    
    return res.status(500).json({
      success: false,
      error: 'PDF解析失败',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
