# Career Hero - AI Resume Builder

一个基于React和Flask的AI简历构建器，使用Supabase作为后端数据库。

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

## 功能特性

- 🔐 用户认证（注册、登录、密码重置）
- 📝 简历创建、编辑、删除
- 🤖 AI简历分析和建议
- 📊 简历完整性评分
- 🎨 多种简历模板
- 📱 响应式设计
- 💾 Supabase云数据库存储

## 技术栈

### 前端
- React 19.2.4
- TypeScript
- Vite
- Tailwind CSS

### 后端
- Flask 2.3.3
- Supabase
- JWT认证
- Flask-CORS

## 快速开始

### 1. 设置Supabase

1. 在[Supabase](https://supabase.com)创建新项目
2. 在SQL编辑器中执行`database/schema.sql`中的SQL语句
3. 获取项目的URL和API密钥

### 2. 配置后端

```bash
cd backend
cp .env.example .env
```

编辑`.env`文件，填入你的Supabase配置：

```env
SUPABASE_URL=your-supabase-url
SUPABASE_KEY=your-supabase-key
JWT_SECRET=your-jwt-secret-key
```

安装依赖并启动后端：

```bash
pip install -r requirements.txt
python app.py
```

后端将在 `http://localhost:5000` 启动

### 3. 启动前端

```bash
cd ai-resume-builder
npm install
npm run dev
```

前端将在 `http://localhost:5173` 启动

## API端点

### 认证
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/forgot-password` - 忘记密码

### 简历管理
- `GET /api/resumes` - 获取所有简历
- `POST /api/resumes` - 创建新简历
- `GET /api/resumes/{id}` - 获取特定简历
- `PUT /api/resumes/{id}` - 更新简历
- `DELETE /api/resumes/{id}` - 删除简历

### AI分析
- `POST /api/ai/analyze` - AI简历分析

### 用户管理
- `GET /api/user/profile` - 获取用户资料
- `PUT /api/user/profile` - 更新用户资料

### 模板
- `GET /api/templates` - 获取简历模板

## 数据库架构

### users表
- `id` - 用户ID (UUID)
- `email` - 邮箱地址
- `password` - 加密密码
- `name` - 用户姓名
- `created_at` - 创建时间
- `updated_at` - 更新时间

### resumes表
- `id` - 简历ID (UUID)
- `user_id` - 用户ID (外键)
- `title` - 简历标题
- `resume_data` - 简历数据 (JSONB)
- `score` - 简历评分
- `has_dot` - 是否有新更新标记
- `created_at` - 创建时间
- `updated_at` - 更新时间

## 开发说明

### 前端状态管理
前端使用React的useState和useEffect进行状态管理，主要状态包括：
- `isAuthenticated` - 认证状态
- `currentView` - 当前视图
- `resumeData` - 当前编辑的简历数据
- `allResumes` - 所有简历列表

### 后端认证
使用JWT进行用户认证，所有需要认证的端点都使用`@token_required`装饰器保护。

### 数据安全
- 密码使用Werkzeug进行哈希加密
- JWT token用于API认证
- Supabase RLS (Row Level Security) 保护数据访问

## 部署

### 前端部署
```bash
cd ai-resume-builder
npm run build
```

将`dist`文件夹部署到静态文件服务器。

### 后端部署
建议使用生产级WSGI服务器如Gunicorn：

```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

## 贡献

欢迎提交Issue和Pull Request！

## 许可证

MIT License
