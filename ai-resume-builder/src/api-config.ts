// API配置文件
export const API_CONFIG = {
  // 开发环境
  development: {
    baseURL: 'http://localhost:5000'
  },
  // 生产环境 - 替换为你的后端部署地址
  production: {
    baseURL: 'https://your-backend-url.onrender.com' // 后续会替换为实际地址
  }
};

// 获取当前环境的API配置
export const getAPIConfig = () => {
  const env = import.meta.env.MODE || 'development';
  return API_CONFIG[env as keyof typeof API_CONFIG] || API_CONFIG.development;
};

// 导出API基础URL
export const API_BASE_URL = getAPIConfig().baseURL;
