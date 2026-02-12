# -*- coding: utf-8 -*-
import os
import json
import time
from dotenv import load_dotenv
import google.generativeai as genai
from supabase import create_client, Client
import logging

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# 加载环境变量
load_dotenv()

# 推荐做法：从 .env 文件读取（已确认您的 .env 中包含这些 Key）
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')

# 初始化并配置 Google SDK
if GEMINI_API_KEY:
    os.environ['GOOGLE_API_KEY'] = GEMINI_API_KEY
    genai.configure(api_key=GEMINI_API_KEY)

if not all([SUPABASE_URL, SUPABASE_KEY, GEMINI_API_KEY]):
    logger.error("环境变量缺失，请检查 .env 文件 (SUPABASE_URL, SUPABASE_KEY, GEMINI_API_KEY)")
    exit(1)

import requests

def get_embedding(text):
    """使用 Gemini 生成向量"""
    try:
        # 使用用户指定的 gemini-embedding-001
        result = genai.embed_content(
            model="models/gemini-embedding-001",
            content=text,
            task_type="retrieval_document"
        )
        return result['embedding']
    except Exception as e:
        logger.error(f"生成向量失败: {e}")
        return None

def preprocess_and_upload():
    # 1. 加载数据
    data_path = 'master_cases.json'
    if not os.path.exists(data_path):
        logger.error(f"未找到数据文件: {data_path}")
        return

    with open(data_path, 'r', encoding='utf-8') as f:
        cases = json.load(f)

    logger.info(f"开始处理 {len(cases)} 条语料内容...")

    success_count = 0
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }
    url = f"{SUPABASE_URL}/rest/v1/master_cases"

    for case in cases:
        # 2. 构建核心文本用于生成向量
        embedding_content = f"{case.get('job_role', '')} {case.get('industry', '')} " \
                            f"{' '.join(case.get('skills', []))} " \
                            f"{case.get('star', {}).get('situation', '')} {case.get('star', {}).get('task', '')}"
        
        # 3. 生成向量
        embedding = get_embedding(embedding_content)
        if not embedding:
            logger.warning(f"跳过案例 {case.get('id')}: 向量生成失败")
            continue

        # 4. 构建存储对象
        metadata = {
            "seniority": case.get('seniority'),
            "is_ai_enhanced": case.get('is_ai_enhanced'),
            "industry": case.get('industry'),
            "job_role": case.get('job_role')
        }

        record = {
            "id": case.get('id'),
            "content": case,
            "embedding": embedding,
            "metadata": metadata
        }

        # 5. 直接通过 REST API 上传
        try:
            # 使用 Post 进行 upsert (依靠 Prefer: resolution=merge-duplicates)
            response = requests.post(url, headers=headers, json=record)
            if response.status_code in [200, 201]:
                success_count += 1
                logger.info(f"已上传 [{success_count}/{len(cases)}]: {case.get('id')}")
            else:
                logger.error(f"上传案例 {case.get('id')} 失败: {response.text}")
        except Exception as e:
            logger.error(f"请求失败 {case.get('id')}: {e}")

        time.sleep(1)

    logger.info(f"上传完成！成功: {success_count}, 失败: {len(cases) - success_count}")

if __name__ == "__main__":
    """
    运行前请确保已经在 Supabase SQL Editor 执行了以下 SQL：

    create extension if not exists vector;

    create table if not exists master_cases (
      id text primary key,
      content jsonb,
      embedding vector(768),
      metadata jsonb
    );
    """
    preprocess_and_upload()
