# 环境变量配置指南

## 🔧 必需的环境变量

在 Render 部署时，请在 Environment Variables 中设置以下变量：

### 1. Supabase 配置
```
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=your-supabase-anon-key
JWT_SECRET=your-jwt-secret-key
```

**获取方式：**
- 登录 [Supabase Dashboard](https://supabase.com/dashboard)
- 选择您的项目
- Settings → API
- 复制 Project URL 和 anon public key
- JWT_SECRET 可以在 Settings → Database → JWT Settings 中找到或自定义

### 2. Google Gemini AI 配置
```
GEMINI_API_KEY=your-gemini-api-key
```

**获取方式：**
- 访问 [Google AI Studio](https://makersuite.google.com/app/apikey)
- 创建新的 API Key
- 复制并粘贴到环境变量中

### 3. 前端配置（可选）
```
REACT_APP_API_URL=https://your-backend-url.onrender.com
```

**说明：**
- 将 `your-backend-url.onrender.com` 替换为您的实际后端 URL
- 前端会自动使用此 URL 调用后端 API

## 🚨 重要提醒

1. **不要提交真实的 API 密钥到 Git 仓库**
2. **确保所有环境变量都已正确设置**
3. **Supabase Key 应该是 anon public key，不是 service_role key**
4. **JWT_SECRET 应该是一个强随机字符串**

## 🐛 常见问题

### Supabase API Key 无效
- 确保使用的是 `anon` key，不是 `service_role` key
- 检查 Supabase 项目是否已启用
- 确认 URL 格式正确：`https://xxx.supabase.co`

### Gemini API 不工作
- 确认 API Key 有效且有配额
- 检查是否启用了 Gemini API
- 确认使用正确的模型名称：`gemini-3-flash-preview`

## 📋 部署检查清单

- [ ] SUPABASE_URL 已设置
- [ ] SUPABASE_KEY 已设置（anon key）
- [ ] JWT_SECRET 已设置
- [ ] GEMINI_API_KEY 已设置
- [ ] REACT_APP_API_URL 已设置（可选）
- [ ] 所有变量值都不包含 `your-xxx` 占位符
- [ ] 部署后测试 `/api/templates` 健康检查端点
