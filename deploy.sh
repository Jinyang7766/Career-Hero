#!/bin/bash

echo "🚀 Career Hero 部署脚本"

echo "📦 1. 构建前端..."
cd ai-resume-builder
npm run build

echo "📤 2. 提交更改..."
cd ..
git add .
git commit -m "Add deployment configuration for Vercel and Render"

echo "✅ 部署准备完成！"
echo ""
echo "📋 下一步操作："
echo "1. 将代码推送到GitHub: git push origin main"
echo "2. 在Vercel连接前端仓库: https://vercel.com"
echo "3. 在Render连接后端仓库: https://render.com"
echo "4. 配置环境变量"
echo ""
echo "🔧 环境变量配置："
echo "Vercel: VITE_GEMINI_API_KEY"
echo "Render: SUPABASE_URL, SUPABASE_KEY, JWT_SECRET"
