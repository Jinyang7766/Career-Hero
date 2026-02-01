# 前端配置修复指南

## 🚨 前端空白问题解决

前端显示空白的原因是缺少必要的环境变量配置。

## 🔧 前端环境变量配置

### 1. 创建前端 .env 文件

在 `ai-resume-builder` 目录下创建 `.env` 文件：

```bash
# Supabase 配置（必需）
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key

# 后端 API 配置（必需）
VITE_API_BASE_URL=https://your-backend-url.onrender.com

# Gemini API Key（可选，用于前端直接调用）
VITE_GEMINI_API_KEY=your-gemini-api-key
```

### 2. 获取 Supabase 配置

1. 登录 [Supabase Dashboard](https://supabase.com/dashboard)
2. 选择您的项目
3. 进入 **Settings** → **API**
4. 复制以下信息：
   - **Project URL**: `https://your-project-id.supabase.co`
   - **anon public key**: `eyJ...` (长字符串)

### 3. 获取后端 URL

从 Render 部署页面复制您的后端服务 URL，格式如：
`https://your-backend-name.onrender.com`

## 🚀 快速修复步骤

### 步骤 1: 配置 Supabase
```bash
cd ai-resume-builder
```

创建 `.env` 文件：
```bash
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_API_BASE_URL=https://your-backend-name.onrender.com
```

### 步骤 2: 重新启动前端
```bash
npm run dev
```

### 步骤 3: 验证配置
1. 打开浏览器开发者工具
2. 检查 Console 是否有错误
3. 确认没有 "Missing Supabase environment variables" 错误

## 🔍 问题排查

### 检查环境变量是否加载
在浏览器控制台运行：
```javascript
console.log('Supabase URL:', import.meta.env.VITE_SUPABASE_URL);
console.log('API Base URL:', import.meta.env.VITE_API_BASE_URL);
```

### 常见错误
1. **"Missing Supabase environment variables"**
   - 解决：添加 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`

2. **"Network error"**
   - 解决：检查 `VITE_API_BASE_URL` 是否正确

3. **"Invalid API key"**
   - 解决：确认 Supabase key 是 anon key，不是 service_role key

## 📋 部署检查清单

- [ ] 创建了 `ai-resume-builder/.env` 文件
- [ ] 配置了正确的 Supabase URL
- [ ] 配置了正确的 Supabase anon key
- [ ] 配置了正确的后端 API URL
- [ ] 重新启动了前端服务
- [ ] 浏览器控制台没有错误
- [ ] 登录界面正常显示

## 🎯 预期结果

配置完成后，前端应该：
1. 显示登录界面
2. 能够连接到 Supabase
3. 能够调用后端 API
4. 正常进行用户认证

## 🆘 如果仍然有问题

1. 检查浏览器控制台的错误信息
2. 确认所有环境变量都已正确设置
3. 确认 Supabase 项目已启用
4. 确认后端服务正在运行
