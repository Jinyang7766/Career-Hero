# 使用微软官方提供的 Playwright Python 镜像 (基于 Ubuntu Jammy)
# 该镜像已预装 Python 3.10+ 和 Chromium 运行环境，体积适中且稳定性极高
FROM mcr.microsoft.com/playwright/python:v1.43.0-jammy

WORKDIR /app

# 设置环境变量
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_ROOT_USER_ACTION=ignore

# 复制依赖文件
COPY backend/requirements.txt .

# 安装 Python 依赖
# 注意：官方镜像已经预装了 playwright，pip install 会自动处理
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# 复制后端代码
COPY backend/ .

# 创建非 root 用户并授权
RUN useradd -m app && chown -R app:app /app
USER app

# 暴露端口
EXPOSE 5000

# 健康检查
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/api/templates || exit 1

# 启动命令
# 使用环境变量 PORT，确保在 Railway/Render 等云平台上正常运行
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-5000} --workers 1 --timeout 120 app:app"]
