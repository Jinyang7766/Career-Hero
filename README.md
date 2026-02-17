# Career Hero - AI Resume Builder 🚀

一个基于 React 和 Flask 的高生产力智能简历构建器，集成了 **Google Gemini 3.0** 顶尖模型、**Vector RAG** 行业增强、实时 **AI 面试模拟** 以及高保真 **PDF 导出** 引擎。

## ✨ 核心功能

- 🤖 **AI 深度分析** - 基于 **Gemini 3.0 Pro** 的简历多维度评估与智能润色建议。
- 🔍 **Vector RAG 增强** - 集成 Supabase `pgvector` 与语义检索，针对 **技术/财务/供应链** 等硬核行业实现定制化深度优化。
- 🎙️ **沉浸式 AI 面试** - 模拟真实 HR 提问，支持**流式文本**与**多模态语音**输入，提供针对性实时反馈。
- 💭 **极致响应体验** - 优化的渲染架构与 **AI 思考指示器**，确保交互链路无缝顺畅。
- 📊 **高保真 PDF 导出** - 采用 **Playwright** 后端渲染引擎，生成 100% 还原样式的 ATS 友好型简历。
- 🎯 **猎头级策略** - 根据 JD (职位描述) 自动提取关键技能，实现精准的“人岗匹配”策略指导。
- 🎨 **多模板预览** - 提供 Modern, Classic 及 Minimal 风格，实时切换，所见即所得。
- 🔐 **企业级安全** - 完善的 JWT 认证及 **PII (个人隐私信息) 脱敏保护** 机制。

---

## 🏗️ 项目架构

项目采用前后端分离的现代化架构，所有核心逻辑均已模块化解耦，具备高度的可扩展性。

### 技术栈
| 领域 | 技术方案 |
| :--- | :--- |
| **前端** | React 18 / TypeScript / Vite / Tailwind CSS / Zustand / Framer Motion |
| **后端** | Python 3.12 / Flask 3.0 / Gunicorn (Async Gevent) / Playwright |
| **AI 引擎** | Google Gemini 3.0 (Pro/Flash/Vision/Transcribe/Embedding) |
| **数据/认证** | Supabase (PostgreSQL + Auth + Storage) |
| **语义搜索** | pgvector (Vector Similarity Search) |

### 模块结构
```text
Career-Hero/
├── ai-resume-builder/          # React 前端 (TypeScript + Tailwind)
│   ├── src/                    # 核心逻辑与 API 服务
│   ├── components/             # UI 组件库 (Screens, Templates, UI Kit)
│   └── hooks/                  # 处理 AI Chat, 语音, 状态管理的自定义 Hook
├── backend/                    # Flask 后端
│   ├── app.py                  # API 路由网关
│   ├── services/               # 核心业务服务 (AI, Auth, PDF, RAG, Resume CRUD)
│   └── requirements.txt        # 生产环境依赖
├── database/                   # 数据库模式与 SQL 脚本
└── C4-Documentation/           # 详尽的 C4 模型架构文档 (Context, Container, Component, Code)
```

> 💡 **深度技术参考**：如需深入了解代码实现和详细组件图，请查阅 [C4 架构文档](./C4-Documentation/README.md)。

---

## 🚀 快速开始

### 1. 基础环境
- **Node.js 18+** & **Python 3.12+**
- **Supabase** 账号及项目

### 2. 数据库部署
在 Supabase SQL Editor 中执行 `database/schema.sql`，确保 `pgvector` 扩展已开启。

### 3. 环境配置

#### 后端 (`backend/.env`)
```env
SUPABASE_URL=your_url
SUPABASE_KEY=your_key
JWT_SECRET=your_secret
GEMINI_API_KEY=your_gemini_key

# 细粒度模型控制
GEMINI_RESUME_PARSE_MODEL=gemini-3-flash-preview
GEMINI_ANALYSIS_MODEL=gemini-3-pro-preview
GEMINI_INTERVIEW_MODEL=gemini-3-pro-preview
GEMINI_TRANSCRIBE_MODEL=gemini-2.5-flash-lite

# RAG 配置
RAG_ENABLED=1
RAG_MATCH_THRESHOLD=0.75
```

#### 前端 (`ai-resume-builder/.env`)
```env
VITE_API_BASE_URL=http://localhost:5000
```

### 4. 运行
```bash
# 后端启动
cd backend && pip install -r requirements.txt && python app.py

# 前端启动
cd ai-resume-builder && npm install && npm run dev
```

---

## 📋 API 文档概览

### 认证端点
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录  
- `POST /api/auth/forgot-password` - 忘记密码

### 简历管理
- `GET /api/resumes` - 获取用户所有简历
- `POST /api/resumes` - 创建新简历
- `PUT /api/resumes/{id}` - 更新简历
- `DELETE /api/resumes/{id}` - 删除简历

### AI 分析与导出
- `POST /api/ai/analyze` - AI 简历深度分析
- `POST /api/ai/chat` - AI 模拟面试
- `GET /api/export-pdf` - 导出 PDF 简历

---

## 📝 更新日志

### v1.3.0 (2026-02-17) - 架构升级与 UX 飞跃 🌟
- **UI/UX 优化**：
  - 🚀 **全新 AI 思考指示器**：移除传统的聊天气泡式“思考中”，改为更简约、动态的灰色点状指示器，优化交互节奏。
  - 🎨 **面试体验增强**：优化了 AI 发送第一条消息的加载逻辑，减少等待焦虑。
- **架构重构**：
  - �️ **Service 模块解耦**：后端逻辑由 `app.py` 彻底迁移至 `services/` 目录，实现了 Auth、AI、PDF、RAG 等业务的完全解耦。
  - 📄 **C4 文档体系**：引入了从 Context 到 Code 的全链路架构文档，极大提升了项目的技术透明度。
- **RAG 行业策略**：
  - 🎯 **自适应检索逻辑**：针对不同行业背景动态调整 RAG 检索深度和 Prompt 策略（由 `rag_service.py` 驱动）。
- **流程规范化**：
  - 🛡️ 深度清理了 `.gitignore` 与工程缓存文件，标准化了 Git 提交工作流。

### v1.2.0 (2026-02-12)
- 🤖 全面支持 **Gemini 3.0** 系列模型，细化解析、分析与面试模型配置。
- 🔍 引入 **Supabase pgvector**，实现高质量语料库向量检索。
- 🛡️ 完善 **PII 隐私保护**，服务端防御性脱敏机制上线。

---

## 📄 许可证
本项目采用 [MIT 许可证](LICENSE)。

---

⭐ 如果 Career Hero 对您有帮助，请在 GitHub 上给我们一个 Star！
