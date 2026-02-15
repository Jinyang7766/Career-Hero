# Career Hero - AI Resume Builder 🚀

一个基于React和Flask的智能简历构建器，集成AI分析、专业模板和猎头策略建议。

## ✨ 核心功能

- 🤖 **AI智能分析** - 基于 **Google Gemini 3** 的多维度简历评估
- 🔍 **Vector RAG 增强** - 集成 Supabase `pgvector` 与语义检索，根据行业案例精准优化
- 🎙️ **AI模拟面试** - 沉浸式模拟面试体验，针对性问题提问与实时反馈
- 🧠 **AI 多模态输入** - 支持语音等多模态输入，直接发送给模型理解
- 🔔 **统一提示框** - 全局 Toast/Confirm 提示，不使用浏览器原生弹窗（避免展示网址）
- 🎯 **猎头策略** - 专业的求职指导和面试技巧
- 📝 **智能编辑** - 实时验证和完成度追踪
- 🖼️ **头像支持** - 支持上传和裁剪个人头像，打造个性化简历
- 🎨 **多模板支持** - 专业简历模板库
- 📱 **响应式设计** - 完美适配移动端
- 🔐 **用户系统** - 完整的认证和数据管理
- 📊 **PDF导出** - 一键生成专业PDF简历
- 💾 **云端存储** - 基于 Supabase 的分层数据架构

## 项目结构

```
Career-Hero/
├── ai-resume-builder/          # React前端
│   ├── components/            # React组件
│   ├── App.tsx               # 主应用组件
│   ├── types.ts              # TypeScript类型定义
│   └── package.json          # 前端依赖
├── backend/                   # Flask后端
│   ├── app.py                # 主应用文件
│   ├── api_service.py        # API服务类
│   ├── requirements.txt      # Python依赖
│   └── .env.example          # 环境变量示例
├── database/                  # 数据库
│   └── schema.sql            # Supabase数据库架构
└── README.md                 # 项目说明
```

## 🛠️ 技术栈

### 前端技术
- **React 18** - 现代化UI框架
- **TypeScript** - 类型安全的JavaScript
- **Vite** - 快速构建工具
- **Tailwind CSS** - 实用优先的CSS框架
- **Google Gemini 3** - 顶尖智能分析引擎

### 后端技术
- **Flask 3.0** - 轻量级Web框架
- **Playwright** - 高动态 PDF 生成引擎 (替代 html2pdf 以获得完美排版)
- **Supabase** - 现代化数据库服务
- **JWT认证** - 安全的用户认证
- **Flask-CORS** - 跨域资源共享

### 数据库
- **Supabase PostgreSQL** - 云端数据库
- **pgvector** - 向量数据库插件，驱动 RAG 语义检索
- **RLS安全策略** - 行级安全保护

## 🚀 快速开始

### 前置要求
- Node.js 18+ 
- Python 3.8+
- Git

### 1. 克隆项目
```bash
git clone https://github.com/yourusername/Career-Hero.git
cd Career-Hero
```

### 2. 设置Supabase数据库

1. 访问 [Supabase](https://supabase.com) 创建新项目
2. 在SQL编辑器中执行 `database/schema.sql` (包含 `pgvector` 相关配置)
3. 获取项目的URL和API密钥

### 3. 配置后端
```bash
cd backend
cp .env.example .env
```

编辑 `.env` 文件：
```env
SUPABASE_URL=your-supabase-url
SUPABASE_KEY=your-supabase-key
JWT_SECRET=your-jwt-secret-key
# AI 模型细粒度控制 (可选)
GEMINI_RESUME_PARSE_MODEL=gemini-2.5-flash-lite
GEMINI_ANALYSIS_MODEL=gemini-3-flash-preview
GEMINI_INTERVIEW_MODEL=gemini-3-flash-preview
GEMINI_VISION_MODEL=gemini-3-pro-preview
PDF_PARSE_DEBUG=1  # 开启 PDF 解析详细调试
RAG_ENABLED=1      # 全局 RAG 检索开关 (1=开启, 0=关闭)
```

启动后端服务：
```bash
pip install -r requirements.txt
python app.py
```

### 4. 配置前端
```bash
cd ai-resume-builder
cp .env.example .env
```

编辑 `.env` 文件（可选，用于AI功能）：
```env
VITE_GEMINI_API_KEY=your-gemini-api-key
```

启动前端服务：
```bash
npm install
npm run dev
```

### 5. 访问应用
- 前端：http://localhost:5173
- 后端API：http://localhost:5000

### 6. 初始化 RAG 语料库 (可选但推荐)
```bash
# 生成向量并上传至 Supabase
python scripts/seed_cases.py
```

## 📋 API文档

### 认证端点
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录  
- `POST /api/auth/forgot-password` - 忘记密码

### 简历管理
- `GET /api/resumes` - 获取用户所有简历
- `POST /api/resumes` - 创建新简历
- `GET /api/resumes/{id}` - 获取特定简历
- `PUT /api/resumes/{id}` - 更新简历
- `DELETE /api/resumes/{id}` - 删除简历

### AI分析
- `POST /api/ai/analyze` - AI简历分析（集成Gemini）

### 用户管理
- `GET /api/user/profile` - 获取用户资料
- `PUT /api/user/profile` - 更新用户资料

## 🏗️ 项目架构

### 前端架构
```
ai-resume-builder/
├── components/
│   ├── screens/           # 页面组件
│   │   ├── Dashboard.tsx  # 仪表板
│   │   ├── Editor.tsx     # 简历编辑器
│   │   ├── AiAnalysis.tsx # AI分析
│   │   └── ...
│   ├── templates/         # 模板组件
│   └── BottomNav.tsx      # 底部导航
├── types.ts              # 类型定义
├── App.tsx               # 主应用
└── main.tsx              # 入口文件
```

### 后端架构
```
backend/
├── app.py                # Flask应用主文件
├── api_service.py        # API服务封装
├── requirements.txt      # Python依赖
└── .env.example          # 环境变量示例
```

### 数据库设计
- **users表** - 用户信息和认证
- **resumes表** - 简历数据和元信息
- **RLS策略** - 行级安全保护

## 🎯 核心特性详解

### AI智能分析
- **简历评分** - 基于行业标准的完整性评分
- **内容优化** - 针对性的改进建议
- **关键词匹配** - ATS系统优化
- **猎头策略** - 专业的求职指导

### 模板系统
- **多种风格** - 现代、经典、创意等模板
- **实时预览** - 即时查看效果
- **PDF导出** - 高质量输出
- **自定义样式** - 个性化调整

### 用户体验
- **响应式设计** - 完美适配各种设备
- **实时验证** - 表单即时反馈
- **进度追踪** - 可视化完成度
- **数据同步** - 云端自动保存

## 🚀 部署指南

### 🌟 推荐方案：Vercel + Render

#### 前端部署到Vercel
1. **访问 [Vercel](https://vercel.com)** 并登录GitHub账号
2. **导入项目**：选择 `Career-Hero` 仓库
3. **配置根目录**：设置为 `ai-resume-builder`
4. **环境变量**：
   ```
   VITE_GEMINI_API_KEY=your_gemini_api_key
   VITE_API_BASE_URL=https://your-backend-url.onrender.com
   ```
5. **点击Deploy** - 自动部署完成！

#### 后端部署到Render
1. **访问 [Render](https://render.com)** 并注册账号
2. **创建Web Service**：选择 "New Web Service"
3. **连接GitHub**：选择 `Career-Hero` 仓库
4. **配置设置**：
   - **Root Directory**: `backend`
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn app:app`
5. **环境变量**：
   ```
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_key
   JWT_SECRET=your_jwt_secret
   # 生产环境建议设置具体模型以保证成本和效果平衡
   GEMINI_RESUME_PARSE_MODEL=gemini-2.5-flash-lite
   GEMINI_ANALYSIS_MODEL=gemini-3-flash-preview
   GEMINI_INTERVIEW_MODEL=gemini-3-flash-preview
   ```
6. **创建Web Service** - 自动部署！

### 📋 部署后配置

1. **更新API地址**：在Vercel中设置正确的后端URL
2. **测试连接**：确保前后端通信正常
3. **配置域名**：可以设置自定义域名

### 🛠️ 本地部署

#### 前端构建
```bash
cd ai-resume-builder
npm run build
```

#### 后端本地运行
```bash
cd backend
pip install -r requirements.txt
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

### 🐳 Docker部署
```dockerfile
# Dockerfile示例
FROM node:18-alpine as frontend
WORKDIR /app
COPY ai-resume-builder/package*.json ./
RUN npm ci
COPY ai-resume-builder/ .
RUN npm run build

FROM python:3.9-slim as backend
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt
COPY backend/ .
EXPOSE 5000
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "app:app"]
```

## 🤝 贡献指南

我们欢迎所有形式的贡献！

### 开发流程
1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

### 代码规范
- 前端使用 TypeScript 和 ESLint
- 后端遵循 PEP 8 规范
- 提交信息使用约定式提交格式

## 📝 更新日志

### v1.2.0 (2026-02-12)
- 🤖 **模型升级**：全面支持 Gemini 3.0 系列模型，并引入细粒度模型控制：
  - `GEMINI_RESUME_PARSE_MODEL`: 专门用于高效率简历解析
  - `GEMINI_ANALYSIS_MODEL`: 驱动深度简历诊断
  - `GEMINI_INTERVIEW_MODEL`: 沉浸式模拟面试
- 🔍 **RAG 向量检索**：引入 Supabase `pgvector`，实现基于语义匹配的“行业对标”案例库
- 🛡️ **混合解析架构**：实现 (PyMuPDF -> PyPDF -> Gemini Vision OCR) 的三级降级 PDF 解析机制，大幅提升扫描件识别率
- 🧪 **调试增强**：新增 `PDF_PARSE_DEBUG` 模式，支持实时追踪解析链路详情
- 🧪 **数据同步工具**：新增 `seed_cases.py`，支持 3072 维向量的高质量语料上传

### v1.1.0 (2026-02-09)
- ✨ 新增 AI 模拟面试功能，提供实时对话练习
- 🖼️ 支持个人头像上传与裁剪
- 🎨 优化编辑器界面布局与交互体验
- 📄 改进 PDF 导出功能与按钮布局
- 🐛 修复了一些已知问题（如移动端导航遮挡、缩进错误等）

### v1.0.0 (2024-01-31)
- ✨ 初始版本发布
- 🤖 集成 Google Gemini AI 分析
- 📝 完整的简历编辑功能
- 🎨 多模板支持
- 📱 响应式设计
- 🔐 用户认证系统

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 🙏 致谢

- [React](https://reactjs.org/) - UI框架
- [Flask](https://flask.palletsprojects.com/) - 后端框架
- [Supabase](https://supabase.com/) - 数据库服务
- [Google Gemini](https://ai.google.dev/) - AI分析引擎
- [Tailwind CSS](https://tailwindcss.com/) - CSS框架

## 📞 联系我们

- 项目主页：[GitHub Repository](https://github.com/yourusername/Career-Hero)
- 问题反馈：[Issues](https://github.com/yourusername/Career-Hero/issues)
- 功能建议：[Discussions](https://github.com/yourusername/Career-Hero/discussions)

---

⭐ 如果这个项目对你有帮助，请给我们一个 Star！
