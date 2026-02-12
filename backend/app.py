# -*- coding: utf-8 -*-
from dotenv import load_dotenv
load_dotenv()  # 加载 .env 文件
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
# Clear proxy env vars before importing supabase to avoid proxy kw mismatch in some versions
for _key in ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']:
    os.environ.pop(_key, None)
from supabase import create_client, Client
import uuid
from datetime import datetime
from functools import wraps
import jwt
from werkzeug.security import generate_password_hash, check_password_hash
import re
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from pypdf import PdfReader
from docx import Document
import fitz  # PyMuPDF for PDF-to-image
import io
import base64
import traceback
import ipaddress
import socket
from playwright.sync_api import sync_playwright
from jinja2 import Environment, BaseLoader
from markupsafe import Markup
import logging
import traceback
import google.generativeai as genai

app = Flask(__name__)

# 获取端口配置，优先使用环境变量中的 PORT
# 这确保了在 Railway、Render 等平台上能正常监听正确的端口
PORT = int(os.environ.get('PORT', 5000))

# Debug: Log environment variable keys (NOT values) to verify injection
logger = logging.getLogger(__name__)
env_keys = list(os.environ.keys())
logger.info(f"Detected environment variable keys: {', '.join([k for k in env_keys if not k.startswith('_')])}")

# Ensure Render environment variables are loaded
app.config['SECRET_KEY'] = os.environ.get('JWT_SECRET') or os.environ.get('SECRET_KEY')

if not app.config['SECRET_KEY']:
    logging.getLogger(__name__).error("WARNING: JWT_SECRET env var is missing; auth will fail.")

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# CORS configuration
CORS(app, 
     resources={
         r"/api/*": {
             "origins": [
                 "*",  # Allow all origins; restrict in production
                 "http://localhost:5173",
                 "http://localhost:3000",
                 "http://localhost:5174",
                 "https://localhost:5173",
                 "https://localhost:3000"
             ],
             "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization", "X-Requested-With"]
         }
     },
     supports_credentials=True
)

# Handle OPTIONS preflight
@app.before_request
def handle_options_request():
    if request.method == 'OPTIONS':
        response = jsonify({'status': '成功'})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With')
        response.headers.add('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return response

# Supabase configuration
SUPABASE_URL = os.getenv('SUPABASE_URL', 'your-supabase-url')
SUPABASE_KEY = os.getenv('SUPABASE_KEY', 'your-supabase-key')
JWT_SECRET = os.getenv('JWT_SECRET', 'your-jwt-secret')

# Google Gemini AI configuration
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', 'your-gemini-api-key')
GEMINI_QUOTA_LIMIT = 20  # Free tier daily limit
gemini_request_count = 0  # Track daily usage

if GEMINI_API_KEY != 'your-gemini-api-key':
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-3-pro-preview')
else:
    model = None

# Initialize Supabase with error handling
def _clear_proxy_env():
    proxy_keys = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']
    removed = {}
    for key in proxy_keys:
        if key in os.environ:
            removed[key] = os.environ.pop(key)
    return removed

def _restore_proxy_env(removed):
    for key, value in removed.items():
        os.environ[key] = value

try:
    # Explicitly check for URL validity before connecting
    if not SUPABASE_URL or SUPABASE_URL == 'your-supabase-url' or not SUPABASE_URL.startswith('http'):
        print(f"WARNING: Invalid SUPABASE_URL detected: {SUPABASE_URL}")
        supabase = None
    else:
        # Supabase SDK sometimes tries to use proxy env vars (HTTP_PROXY) incorrectly in some versions.
        # If create_client fails with 'proxy' error, we attempt a clean init.
        try:
            removed_proxy_env = _clear_proxy_env()
            supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
            _restore_proxy_env(removed_proxy_env)
            print("Supabase connected successfully")
        except TypeError as e:
            _restore_proxy_env(removed_proxy_env)
            if "proxy" in str(e):
                print("Detected proxy argument mismatch, attempting simple Client initialization...")
                # Fallback to direct Client instantiation if create_client has issues
                removed_proxy_env = _clear_proxy_env()
                supabase = Client(supabase_url=SUPABASE_URL, supabase_key=SUPABASE_KEY)
                _restore_proxy_env(removed_proxy_env)
                print("Supabase connected successfully (manual fallback)")
            else:
                raise e
except Exception as e:
    print(f"Supabase connection failed: {e}")
    print("Using mock data storage for development")
    supabase = None

# Mock helper functions
def is_mock_mode():
    return supabase is None

def mock_supabase_response(data=None, error=None):
    """Create a mock response object that mimics Supabase response structure"""
    class MockResponse:
        def __init__(self, data=None, error=None):
            self.data = data or []
            self.error = error
    return MockResponse(data, error)

# Mock data storage for development
mock_users = {}
mock_resumes = {}  # user_id -> {resume_id: resume_record}
mock_feedback = []


def get_mock_resumes_for_user(user_id: str):
    if user_id not in mock_resumes:
        mock_resumes[user_id] = {}
    return mock_resumes[user_id]

def generate_embedding(text):
    """使用 Gemini 生成文本向量"""
    try:
        if not GEMINI_API_KEY or GEMINI_API_KEY == 'your-gemini-api-key':
            return None
        
        result = genai.embed_content(
            model="models/gemini-embedding-001",
            content=text,
            task_type="retrieval_query"
        )
        return result['embedding']
    except Exception as e:
        logger.error(f"Generate embedding failed: {e}")
        return None

def parse_seniority_refined(years, job_title=""):
    """多维职级判定逻辑"""
    senior_keywords = ['Director', 'VP', 'Head', 'Manager', 'Architect', 'Lead', '专家', '总监', '架构师', '主管']
    title_lower = job_title.lower()
    if any(kw.lower() in title_lower for kw in senior_keywords):
        return 'senior'
    
    try:
        y = float(years)
        if y < 3: return 'junior'
        if y <= 8: return 'mid'
        return 'senior'
    except:
        return 'mid'

def find_relevant_cases_vector(resume_data, limit=3):
    """三层降级向量检索调度逻辑"""
    try:
        personal = resume_data.get('personalInfo', {})
        job_role = personal.get('jobTitle', '') or (resume_data.get('workExps', [{}])[0].get('jobTitle', '') if resume_data.get('workExps') else '')
        industry = resume_data.get('industry', '其他')
        skills = resume_data.get('skills', [])
        summary = personal.get('summary', '')
        
        # 估算工龄 (实际生产中建议解析日期，此处做简化)
        years_exp = 0
        for exp in resume_data.get('workExps', []): years_exp += 2
        
        seniority = parse_seniority_refined(years_exp, job_role)
        
        # AI Persona 判定
        has_ai_skills = any(kw.lower() in (' '.join(skills)).lower() for kw in ['ai', 'llm', 'gpt', 'agent', 'prompt', 'automation', 'python'])
        is_modern_era = any('2024' in str(exp.get('date', '')) or '2025' in str(exp.get('date', '')) for exp in resume_data.get('workExps', []))
        
        ai_filter = None
        if has_ai_skills: ai_filter = True
        elif not is_modern_era: ai_filter = False
        
        query_text = f"{job_role} {industry} {' '.join(skills)} {summary}"
        query_vector = generate_embedding(query_text)
        if not query_vector: return []

        # 第一层及更高层逻辑合并 (RPC match_master_cases 已处理过滤)
        seniority_pool = ['senior'] if seniority == 'senior' else ['junior', 'mid']
        try:
            rpc_response = supabase.rpc('match_master_cases', {
                'query_embedding': query_vector,
                'match_threshold': 0.5, # 稍放宽一点初始阈值
                'match_count': limit,
                'filter_seniority': seniority_pool,
                'filter_is_ai_enhanced': ai_filter if ai_filter is not None else None
            }).execute()
            results = rpc_response.data
        except Exception as e:
            logger.error(f"RAG Retrieval failed: {e}")
            return []

        # 第三层兜底：如果没结果，尝试不带 AI 过滤再次检索
        if not results and ai_filter is not None:
             rpc_response = supabase.rpc('match_master_cases', {
                'query_embedding': query_vector,
                'match_threshold': 0.4,
                'match_count': limit,
                'filter_seniority': seniority_pool,
                'filter_is_ai_enhanced': None
            }).execute()
             results = rpc_response.data

        return [r['content'] for r in results] if results else []
    except Exception as e:
        logger.error(f"find_relevant_cases_vector error: {e}")
        return []

def token_required(f):
    @wraps(f)
    def decorated(*view_args, **view_kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return jsonify({'message': '缺少 Authorization 请求头'}), 401

        token = auth_header.split(" ")[1] if " " in auth_header else auth_header

        # --- 临时修复 ---
        # 1. 尝试直接解码而不验证签名
        try:
            payload = jwt.decode(token, options={"verify_signature": False})
            user_id = payload.get('sub') or payload.get('user_id')

            if user_id:
                print(f"DEBUG: Auth Success (Skip Verify). User: {user_id}")
                return f(user_id, *view_args, **view_kwargs)
        except Exception as e:
            print(f"DEBUG: Payload decode failed: {str(e)}")

        # 2. 调用 Supabase 验证用户
        if hasattr(supabase, 'auth'):
            try:
                user_res = supabase.auth.get_user(token)
                if user_res and user_res.user:
                    return f(user_res.user.id, *view_args, **view_kwargs)
            except Exception as se:
                print(f"DEBUG: Supabase SDK failed: {str(se)}")

        # 验证失败
        return jsonify({'message': 'Token 无效或已过期，请重新登录'}), 401

    return decorated

def check_gemini_quota():
    """Check if Gemini API quota is available"""
    global gemini_request_count
    
    # For development environment, disable quota check to avoid rate limiting issues
    # In production, this should be stored in database with daily reset
    if os.environ.get('FLASK_ENV') == 'development':
        return True
    
    # Simple quota check - in production, this should be stored in database
    if gemini_request_count >= GEMINI_QUOTA_LIMIT:
        return False
    
    gemini_request_count += 1
    print(f"Gemini API request count: {gemini_request_count}/{GEMINI_QUOTA_LIMIT}")
    return True

def validate_email(email):
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def validate_password(password):
    return len(password) >= 8

def clean_string(value, max_len=4000):
    if value is None:
        return ''
    if not isinstance(value, str):
        value = str(value)
    value = value.replace('', '').strip()
    return value[:max_len]

def clean_list_strings(values, max_items=200, max_len=200):
    if not isinstance(values, list):
        return []
    cleaned = []
    for item in values[:max_items]:
        if item is None:
            continue
        cleaned.append(clean_string(item, max_len=max_len))
    return cleaned

def clean_list_dicts(values, allowed_keys, max_items=100):
    if not isinstance(values, list):
        return []
    cleaned = []
    for item in values[:max_items]:
        if not isinstance(item, dict):
            continue
        entry = {}
        for key in allowed_keys:
            if key in item:
                if key == 'id':
                    entry[key] = item.get(key)
                else:
                    entry[key] = clean_string(item.get(key), max_len=2000)
        cleaned.append(entry)
    return cleaned

def clean_resume_payload(payload):
    if not isinstance(payload, dict):
        return None, '简历数据缺失'

    personal_info = payload.get('personalInfo', {})
    if not isinstance(personal_info, dict):
        personal_info = {}

    cleaned = {
        'personalInfo': {
            'name': clean_string(personal_info.get('name'), 200),
            'title': clean_string(personal_info.get('title'), 200),
            'email': clean_string(personal_info.get('email'), 200),
            'phone': clean_string(personal_info.get('phone'), 100),
            'location': clean_string(personal_info.get('location'), 200),
            'linkedin': clean_string(personal_info.get('linkedin'), 200),
            'website': clean_string(personal_info.get('website'), 200),
            'summary': clean_string(personal_info.get('summary'), 4000),
            'avatar': clean_string(personal_info.get('avatar'), 8000)
        },
        'workExps': clean_list_dicts(
            payload.get('workExps'),
            ['id', 'title', 'subtitle', 'date', 'description', 'company', 'position', 'startDate', 'endDate'],
            max_items=50
        ),
        'educations': clean_list_dicts(
            payload.get('educations'),
            ['id', 'title', 'subtitle', 'date', 'school', 'degree', 'major', 'startDate', 'endDate'],
            max_items=50
        ),
        'projects': clean_list_dicts(
            payload.get('projects'),
            ['id', 'title', 'subtitle', 'date', 'description', 'role', 'link'],
            max_items=50
        ),
        'skills': clean_list_strings(payload.get('skills'), max_items=200, max_len=100),
        'summary': clean_string(payload.get('summary'), 4000),
        'gender': clean_string(payload.get('gender'), 20),
        'templateId': clean_string(payload.get('templateId'), 50),
        'optimizationStatus': clean_string(payload.get('optimizationStatus'), 50),
        'lastJdText': clean_string(payload.get('lastJdText'), 8000),
    }

    interview_sessions = payload.get('interviewSessions')
    if isinstance(interview_sessions, dict):
        cleaned['interviewSessions'] = interview_sessions

    export_history = payload.get('exportHistory')
    if isinstance(export_history, list):
        cleaned['exportHistory'] = clean_list_dicts(
            export_history,
            ['filename', 'size', 'type', 'exportedAt'],
            max_items=200
        )

    return cleaned, None

@app.route('/api/auth/register', methods=['POST'])
def register():
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')
        name = data.get('name', '')

        if not email or not password:
            return jsonify({'error': '邮箱和密码为必填项'}), 400

        if not validate_email(email):
            return jsonify({'error': '邮箱格式不正确'}), 400

        if not validate_password(password):
            return jsonify({'error': '密码长度至少 8 位'}), 400

        # Check if user already exists
        if is_mock_mode():
            for user_data in mock_users.values():
                if user_data.get('email') == email:
                    return jsonify({'error': '用户已存在'}), 400
        else:
            existing_user = supabase.table('users').select('*').eq('email', email).execute()
            if existing_user.data:
                return jsonify({'error': '用户已存在'}), 400

        # Create user
        hashed_password = generate_password_hash(password)
        user_id = str(uuid.uuid4())
        user_data = {
            'id': user_id,
            'email': email,
            'password': hashed_password,
            'name': name,
            'created_at': datetime.utcnow().isoformat()
        }

        if is_mock_mode():
            mock_users[user_id] = user_data
            result = mock_supabase_response(data=[user_data])
        else:
            result = supabase.table('users').insert(user_data).execute()

        if result.data:
            if not JWT_SECRET:
                return jsonify({'error': 'JWT_SECRET 未配置'}), 500
            token = jwt.encode({'user_id': result.data[0]['id']}, JWT_SECRET, algorithm="HS256")
            return jsonify({
                'message': '注册成功',
                'token': token,
                'user': {
                    'id': result.data[0]['id'],
                    'email': result.data[0]['email'],
                    'name': result.data[0]['name']
                }
            }), 201
        else:
            return jsonify({'error': '创建用户失败'}), 500

    except Exception as e:
        return jsonify({'error': '服务器内部错误'}), 500

@app.route('/api/auth/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')

        if not email or not password:
            return jsonify({'error': '邮箱和密码为必填项'}), 400

        # Get user
        if is_mock_mode():
            user = None
            for user_data in mock_users.values():
                if user_data.get('email') == email:
                    user = user_data
                    break

            if not user:
                return jsonify({'error': '账号或密码错误'}), 401
        else:
            result = supabase.table('users').select('*').eq('email', email).execute()

            if not result.data:
                return jsonify({'error': '账号或密码错误'}), 401

            user = result.data[0]

        if not check_password_hash(user['password'], password):
            return jsonify({'error': '账号或密码错误'}), 401

        if not JWT_SECRET:
            return jsonify({'error': 'JWT_SECRET 未配置'}), 500
        token = jwt.encode({'user_id': user['id']}, JWT_SECRET, algorithm="HS256")
        
        # Check for pending deletion
        deletion_pending_until = user.get('deletion_pending_until')
        
        return jsonify({
            'message': '登录成功',
            'token': token,
            'user': {
                'id': user['id'],
                'email': user['email'],
                'name': user['name'],
                'deletion_pending_until': deletion_pending_until
            }
        }), 200

    except Exception as e:
        return jsonify({'error': '服务器内部错误'}), 500

@app.route('/api/auth/forgot-password', methods=['POST'])
def forgot_password():
    try:
        data = request.get_json()
        email = data.get('email')

        if not email:
            return jsonify({'error': '邮箱为必填项'}), 400

        # In a real app, send reset email
        return jsonify({'message': '重置密码说明已发送至邮箱'}), 200

    except Exception as e:
        return jsonify({'error': '服务器内部错误'}), 500

@app.route('/api/resumes', methods=['GET'])
@token_required
def get_resumes(current_user_id):
    try:
        if is_mock_mode():
            user_resumes = list(get_mock_resumes_for_user(current_user_id).values())
            # Sort by created_at descending
            user_resumes.sort(key=lambda x: x.get('created_at', ''), reverse=True)
        else:
            result = supabase.table('resumes').select('*').eq('user_id', current_user_id).order('created_at', desc=True).execute()
            user_resumes = result.data
        
        resumes = []
        for resume in user_resumes:
            resumes.append({
                'id': resume['id'],
                'title': resume['title'],
                'date': resume['updated_at'],
                'score': resume.get('score'),
                'hasDot': resume.get('hasDot', False)
            })
        
        return jsonify({'resumes': resumes}), 200
    
    except Exception as e:
        return jsonify({'error': '服务器内部错误'}), 500

@app.route('/api/resumes', methods=['POST'])
@token_required
def create_resume(current_user_id):
    try:
        data = request.get_json()
        title = data.get('title', '新简历')
        title = clean_string(title, 200)
        resume_data = data.get('resumeData', {})
        cleaned_resume_data, err = clean_resume_payload(resume_data)
        if err:
            return jsonify({'error': err}), 400

        resume_record = {
            'id': str(uuid.uuid4()),
            'user_id': current_user_id,
            'title': title,
            'resume_data': cleaned_resume_data,
            'created_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat()
        }

        if is_mock_mode():
            get_mock_resumes_for_user(current_user_id)[resume_record['id']] = resume_record
            result = mock_supabase_response(data=[resume_record])
        else:
            result = supabase.table('resumes').insert(resume_record).execute()

        if result.data:
            return jsonify({
                'message': '简历创建成功',
                'resume': result.data[0]
            }), 201
        else:
            return jsonify({'error': '创建简历失败'}), 500

    except Exception as e:
        return jsonify({'error': '服务器内部错误'}), 500

@app.route('/api/resumes/<resume_id>', methods=['GET'])
@token_required
def get_resume(current_user_id, resume_id):
    try:
        if is_mock_mode():
            resume = get_mock_resumes_for_user(current_user_id).get(resume_id)
            if not resume or resume.get('user_id') != current_user_id:
                return jsonify({'error': '未找到简历'}), 404
        else:
            result = supabase.table('resumes').select('*').eq('id', resume_id).eq('user_id', current_user_id).execute()

            if not result.data:
                return jsonify({'error': '未找到简历'}), 404

            resume = result.data[0]

        return jsonify({'resume': resume}), 200

    except Exception as e:
        return jsonify({'error': '服务器内部错误'}), 500

@app.route('/api/resumes/<resume_id>', methods=['PUT'])
@token_required
def update_resume(current_user_id, resume_id):
    try:
        data = request.get_json()
        title = data.get('title')
        resume_data = data.get('resumeData')
        score = data.get('score')

        update_data = {'updated_at': datetime.utcnow().isoformat()}

        if title is not None:
            update_data['title'] = title
        if resume_data is not None:
            cleaned_resume_data, err = clean_resume_payload(resume_data)
            if err:
                return jsonify({'error': err}), 400
            update_data['resume_data'] = cleaned_resume_data
        if score is not None:
            if not isinstance(score, (int, float)) or score < 0 or score > 100:
                return jsonify({'error': '分数必须在 0-100 之间'}), 400
            update_data['score'] = score

        if is_mock_mode():
            resume = get_mock_resumes_for_user(current_user_id).get(resume_id)
            if not resume or resume.get('user_id') != current_user_id:
                return jsonify({'error': '简历不存在或更新失败'}), 404

            resume.update(update_data)
            result = mock_supabase_response(data=[resume])
        else:
            result = supabase.table('resumes').update(update_data).eq('id', resume_id).eq('user_id', current_user_id).execute()

        if result.data:
            return jsonify({
                'message': '简历更新成功',
                'resume': result.data[0]
            }), 200
        else:
            return jsonify({'error': '简历不存在或更新失败'}), 404

    except Exception as e:
        return jsonify({'error': '服务器内部错误'}), 500

@app.route('/api/resumes/<resume_id>', methods=['DELETE'])
@token_required
def delete_resume(current_user_id, resume_id):
    try:
        if is_mock_mode():
            resume = get_mock_resumes_for_user(current_user_id).get(resume_id)
            if not resume or resume.get('user_id') != current_user_id:
                return jsonify({'error': '简历不存在或删除失败'}), 404

            deleted_resume = get_mock_resumes_for_user(current_user_id).pop(resume_id)
            result = mock_supabase_response(data=[deleted_resume])
        else:
            result = supabase.table('resumes').delete().eq('id', resume_id).eq('user_id', current_user_id).execute()

        if result.data:
            return jsonify({'message': '简历删除成功'}), 200
        else:
            return jsonify({'error': '简历不存在或删除失败'}), 404

    except Exception as e:
        return jsonify({'error': '服务器内部错误'}), 500

def calculate_resume_score(resume_data):
    score = 0
    
    # Personal info: 40 points
    if resume_data.get('personalInfo', {}).get('name'):
        score += 10
    if resume_data.get('personalInfo', {}).get('title'):
        score += 10
    if resume_data.get('personalInfo', {}).get('email'):
        score += 10
    if resume_data.get('personalInfo', {}).get('phone'):
        score += 10
    
    # Sections: 60 points
    if resume_data.get('workExps') and len(resume_data['workExps']) > 0:
        score += 20
    if resume_data.get('educations') and len(resume_data['educations']) > 0:
        score += 20
    if resume_data.get('skills') and len(resume_data['skills']) > 0:
        score += 10
    if resume_data.get('projects') and len(resume_data['projects']) > 0:
        score += 10
    
    return min(score, 100)

def generate_enhanced_suggestions(resume_data, score, job_description=""):
    """当 AI 不可用时生成增强建议"""
    suggestions = []

    # 基础建议
    basic_suggestions = generate_suggestions(resume_data, score)
    suggestions.extend(basic_suggestions)

    # JD 关键词建议
    if job_description:
        jd_keywords = []
        common_tech_keywords = ['python', 'javascript', 'react', 'node.js', 'sql', 'aws', 'docker', 'git', 'agile', 'scrum']
        jd_lower = job_description.lower()

        for keyword in common_tech_keywords:
            if keyword in jd_lower and keyword not in resume_data.get('skills', []):
                jd_keywords.append(keyword.title())

        if jd_keywords:
            suggestions.append({
                'id': f'jd-keywords-{len(suggestions)}',
                'type': 'missing',
                'title': '技能关键词补全',
                'reason': f'职位描述中提到 {", ".join(jd_keywords[:3])}，建议补充这些技能以提升匹配度。',
                'targetSection': 'skills',
                'suggestedValue': resume_data.get('skills', []) + jd_keywords,
                'status': 'pending'
            })

    # 工作经历描述增强
    for exp in resume_data.get('workExps', []):
        if not exp.get('description') or len(exp.get('description', '')) < 50:
            suggestions.append({
                'id': f'exp-detail-{exp.get("id", len(suggestions))}',
                'type': 'optimization',
                'title': '工作经历细化',
                'reason': f'“{exp.get("title", "工作经历")}”的描述过于简略，建议用 STAR 法则补充具体成果和数据。',
                'targetSection': 'workExps',
                'targetId': exp.get('id'),
                'targetField': 'description',
                'originalValue': exp.get('description', ''),
                'suggestedValue': '负责核心项目的开发与优化，提升团队效率 30%，成功交付 3 个关键里程碑并获得客户认可。',
                'status': 'pending'
            })

    return suggestions


def generate_suggestions(resume_data, score):
    suggestions = []

    if not resume_data.get('personalInfo', {}).get('name'):
        suggestions.append("添加姓名")
    if not resume_data.get('personalInfo', {}).get('title'):
        suggestions.append("添加职位标题")
    if not resume_data.get('personalInfo', {}).get('email'):
        suggestions.append("添加邮箱地址")
    if not resume_data.get('personalInfo', {}).get('phone'):
        suggestions.append("添加电话号码")

    if not resume_data.get('workExps') or len(resume_data['workExps']) == 0:
        suggestions.append("添加工作经验")
    if not resume_data.get('educations') or len(resume_data['educations']) == 0:
        suggestions.append("添加教育背景")
    if not resume_data.get('skills') or len(resume_data['skills']) == 0:
        suggestions.append("添加技能列表")
    if not resume_data.get('projects') or len(resume_data['projects']) == 0:
        suggestions.append("添加项目经历")

    if score >= 80:
        suggestions.append("简历完整度较高，可进一步打磨细节。")
    elif score >= 60:
        suggestions.append("继续完善简历内容。")
    else:
        suggestions.append("请补充更多简历信息。")

    return suggestions

@app.route('/api/user/profile', methods=['GET'])
@token_required
def get_profile(current_user_id):
    try:
        if is_mock_mode():
            # Mock mode: find user in mock_users
            user = mock_users.get(current_user_id)
            if not user:
                # auto-create mock user if token is valid but ID not in memory (e.g. server restart)
                user = {
                    'id': current_user_id,
                    'email': 'mock_user@example.com',
                    'name': 'Mock User',
                    'deletion_pending_until': None
                }
                mock_users[current_user_id] = user
            
            # Return only selected fields
            return jsonify({
                'id': user.get('id'),
                'email': user.get('email'),
                'name': user.get('name'),
                'deletion_pending_until': user.get('deletion_pending_until')
            }), 200
        else:
            result = supabase.table('users').select('id,email,name,deletion_pending_until').eq('id', current_user_id).execute()
            if not result.data:
                return jsonify({'error': '用户不存在'}), 404
            return jsonify(result.data[0]), 200
    except Exception as e:
        return jsonify({'error': '服务器内部错误'}), 500

@app.route('/api/user/request-deletion', methods=['POST'])
@token_required
def request_deletion(current_user_id):
    try:
        from datetime import timedelta
        # Default to 3 days grace period
        deletion_until = (datetime.utcnow() + timedelta(days=3)).isoformat()
        
        if is_mock_mode():
            user = mock_users.get(current_user_id)
            if not user:
                user = {
                    'id': current_user_id,
                    'email': 'mock_user@example.com',
                    'name': 'Mock User',
                    'deletion_pending_until': None
                }
                mock_users[current_user_id] = user
            user['deletion_pending_until'] = deletion_until
            result = mock_supabase_response(data=[user])
        else:
            result = supabase.table('users').update({'deletion_pending_until': deletion_until}).eq('id', current_user_id).execute()
            
        if result.data:
            return jsonify({'message': '已申请注销，账号进入3天冷静期', 'deletion_pending_until': deletion_until}), 200
        return jsonify({'error': '操作失败'}), 500
    except Exception as e:
        return jsonify({'error': '服务器内部错误'}), 500

@app.route('/api/user/cancel-deletion', methods=['POST'])
@token_required
def cancel_deletion(current_user_id):
    try:
        if is_mock_mode():
            user = mock_users.get(current_user_id)
            if not user:
                user = {
                    'id': current_user_id,
                    'email': 'mock_user@example.com',
                    'name': 'Mock User',
                    'deletion_pending_until': None
                }
                mock_users[current_user_id] = user
            user['deletion_pending_until'] = None
            result = mock_supabase_response(data=[user])
        else:
            result = supabase.table('users').update({'deletion_pending_until': None}).eq('id', current_user_id).execute()
            
        if result.data:
            return jsonify({'message': '已撤销注销申请'}), 200
        return jsonify({'error': '操作失败'}), 500
    except Exception as e:
        return jsonify({'error': '服务器内部错误'}), 500

@app.route('/api/user/delete-account-immediate', methods=['POST'])
@token_required
def delete_account_immediate(current_user_id):
    try:
        # Immediate deletion of all data
        if is_mock_mode():
            if current_user_id in mock_users: del mock_users[current_user_id]
            if current_user_id in mock_resumes: del mock_resumes[current_user_id]
            result = mock_supabase_response(data=[{'id': current_user_id}])
        else:
            # Delete resumes first (if not cascading)
            supabase.table('resumes').delete().eq('user_id', current_user_id).execute()
            # Delete user
            result = supabase.table('users').delete().eq('id', current_user_id).execute()
            
        if result.data:
            return jsonify({'message': '账号已立即永久注销'}), 200
        return jsonify({'error': '操作失败'}), 500
    except Exception as e:
        return jsonify({'error': '服务器内部错误'}), 500

@app.route('/api/user/profile', methods=['PUT'])
@token_required
def update_profile(current_user_id):
    try:
        data = request.get_json()
        name = data.get('name')
        
        if name:
            if is_mock_mode():
                # Mock mode: update in mock_users
                user = mock_users.get(current_user_id)
                if not user:
                    return jsonify({'error': '更新个人信息失败'}), 500
                
                # Update the user
                user['name'] = name
                result = mock_supabase_response(data=[user])
            else:
                result = supabase.table('users').update({'name': name}).eq('id', current_user_id).execute()
            
            if result.data:
                return jsonify({
                    'message': '个人信息更新成功',
                    'user': result.data[0]
                }), 200
            else:
                return jsonify({'error': '更新个人信息失败'}), 500
        else:
            return jsonify({'error': '姓名为必填项'}), 400
    
    except Exception as e:
        return jsonify({'error': '服务器内部错误'}), 500

@app.route('/api/templates', methods=['GET'])
def get_templates():
    try:
        templates = [
            {
                'id': 1,
                'name': '现代简约',
                'description': '清爽现代的排版风格',
                'preview': 'modern'
            },
            {
                'id': 2,
                'name': '专业经典',
                'description': '传统专业的简历模板',
                'preview': 'classic'
            },
            {
                'id': 3,
                'name': '极简风格',
                'description': '注重内容的极简设计',
                'preview': 'minimal'
            }
        ]
        return jsonify({'templates': templates}), 200
    
    except Exception as e:
        return jsonify({'error': '服务器内部错误'}), 500

@app.route('/api/feedback', methods=['POST'])
@token_required
def submit_feedback(current_user_id):
    try:
        data = request.get_json() or {}
        description = (data.get('description') or '').strip()
        images = data.get('images') or []

        if not description:
            return jsonify({'error': '问题描述不能为空'}), 400

        record = {
            'id': str(uuid.uuid4()),
            'user_id': current_user_id,
            'description': description,
            'images': images,
            'created_at': datetime.utcnow().isoformat()
        }

        if is_mock_mode():
            mock_feedback.append(record)
            result = mock_supabase_response(data=[record])
        else:
            result = supabase.table('feedback').insert(record).execute()

        if result.data:
            return jsonify({'message': '反馈已提交', 'feedback': result.data[0]}), 201
        return jsonify({'error': '提交失败'}), 500
    except Exception:
        return jsonify({'error': '服务器内部错误'}), 500

@app.route('/api/export-pdf', methods=['POST'])
def export_pdf():
    try:
        data = request.get_json() or {}
        resume_data = data.get('resumeData')
        jd_text = data.get('jdText', '')
        
        if not resume_data:
            return jsonify({'error': '需要提供简历数据'}), 400
        
        logger.info("Starting PDF generation with Playwright")
        
        # Generate HTML for PDF
        html_content = data.get('htmlContent')
        if not html_content:
            html_content = generate_resume_html(resume_data)
        else:
            html_content = inject_font_css_into_html(html_content)
        logger.info(f"Generated HTML content length: {len(html_content)}")
        
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page(viewport={"width": 794, "height": 1123})
                page.emulate_media(media="print")
                page.set_content(html_content, wait_until="networkidle")
                pdf_bytes = page.pdf(
                    print_background=True,
                    prefer_css_page_size=False,
                    format="A4",
                    margin={"top": "0cm", "bottom": "0cm", "left": "0cm", "right": "0cm"},
                    scale=1
                )
                browser.close()
            result = io.BytesIO(pdf_bytes)
            result.seek(0)
            logger.info("PDF generated successfully with Playwright")
        except Exception as pw_err:
            logger.error(f"Playwright PDF generation failed: {pw_err}")
            return jsonify({'error': 'PDF 生成失败'}), 500

        # 处理自定义文件名（来自前端的简历标题）
        custom_title = data.get('resumeTitle') or data.get('filename') or ''
        custom_title = str(custom_title).strip()
        if custom_title.lower().endswith('.pdf'):
            custom_title = custom_title[:-4].strip()
        safe_title = sanitize_filename_part(custom_title)
        if safe_title:
            filename = safe_title
            if not filename.lower().endswith('.pdf'):
                filename += '.pdf'
        else:
            # 如果没有自定义文件名，使用简历内容生成
            personal_info = resume_data.get('personalInfo', {}) or {}
            name = personal_info.get('name', '简历')
            direction = personal_info.get('title', '')
            company = extract_company_name_from_jd(jd_text)
            filename = build_pdf_filename(name=name, direction=direction, company=company)
        
        return send_file(
            result,
            as_attachment=True,
            download_name=filename,
            mimetype='application/pdf'
        )
        
    except Exception as e:
        logger.error(f"PDF generation error: {str(e)}")
        logger.error(f"Full traceback: {traceback.format_exc()}")
        logger.error(f"Resume data received: {data}")
        return jsonify({'error': '生成 PDF 失败'}), 500

def extract_company_name_from_jd(text: str) -> str:
    if not text:
        return ''
    patterns = [
        r'(?:公司|企业|Employer|Company)[:：\s]*([^\n]+)',
        r'招聘单位[:：\s]*([^\n]+)',
        r'^([^\n]+(?:公司|集团|有限公司|有限责任公司|Company|Group|Ltd|Inc|LLC))',
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match and match.group(1):
            return match.group(1).strip().rstrip()
    first_line = text.split('\n')[0].strip()
    return first_line if len(first_line) < 20 else ''

def build_pdf_filename(name: str, direction: str, company: str) -> str:
    safe_name = sanitize_filename_part(name)
    safe_direction = sanitize_filename_part(direction)
    safe_company = sanitize_filename_part(company)
    parts = [p for p in [safe_direction, safe_company, safe_name] if p]
    if not parts:
        parts = ['简历']
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    return f"{'_'.join(parts)}_{timestamp}.pdf"

def sanitize_filename_part(text: str) -> str:
    if not text:
        return ''
    text = re.sub(r'[\\/:*?"<>|]+', '', str(text))
    text = re.sub(r'\s+', ' ', text).strip()
    return text[:30]

def clean_text_for_pdf(text):
    """Clean text and escape special characters for PDF rendering."""
    if not text:
        return ""

    # Convert to string to avoid type errors
    text = str(text)

    replacements = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '‘': '&#39;',
        '’': '&#39;',
        '“': '&quot;',
        '”': '&quot;',
        '–': '-',
        '—': '--',
        '…': '...',
    }

    for old, new in replacements.items():
        text = text.replace(old, new)

    # Remove control chars
    text = ''.join(char for char in text if ord(char) >= 32 or char in '\n\r\t')

    return text


_PDF_FONT_FAMILY_CACHE = None


def get_pdf_font_family() -> str:
    """Return a font family name that can render CJK text in PDFs."""
    global _PDF_FONT_FAMILY_CACHE
    if _PDF_FONT_FAMILY_CACHE:
        return _PDF_FONT_FAMILY_CACHE

    # 1) Prefer user-provided font file for maximum compatibility
    font_path = os.getenv("PDF_FONT_PATH", "").strip()
    if font_path and os.path.exists(font_path):
        font_name = os.getenv("PDF_FONT_NAME", "").strip() or "CustomPDF"
        try:
            pdfmetrics.registerFont(TTFont(font_name, font_path))
            _PDF_FONT_FAMILY_CACHE = font_name
            return _PDF_FONT_FAMILY_CACHE
        except Exception as exc:
            logger.warning(f"Failed to register PDF font from {font_path}: {exc}")

    # 2) Fallback to built-in CID font for Chinese (ReportLab)
    try:
        pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
        _PDF_FONT_FAMILY_CACHE = 'STSong-Light'
        return _PDF_FONT_FAMILY_CACHE
    except Exception as exc:
        logger.warning(f"Failed to register CID font STSong-Light: {exc}")

    # 3) Last resort: standard PDF font (may not render CJK)
    _PDF_FONT_FAMILY_CACHE = 'Helvetica'
    return _PDF_FONT_FAMILY_CACHE


def get_pdf_font_url() -> str:
    """Return a file URL to the configured font if available."""
    font_path = os.getenv("PDF_FONT_PATH", "").strip()
    if not font_path:
        return ""
    if not os.path.isabs(font_path):
        font_path = os.path.abspath(font_path)
    # Use file:// URL so Playwright can load local font
    return f"file:///{font_path.replace(os.sep, '/')}"

def inject_font_css_into_html(html_content: str) -> str:
    if not html_content:
        return html_content
    if 'data-pdf-font' in html_content:
        return html_content

    font_url = get_pdf_font_url()
    if not font_url:
        return html_content

    font_name = os.getenv("PDF_FONT_NAME", "").strip() or "CustomPDF"
    font_css = f"""
    <style data-pdf-font="1">
      @font-face {{
        font-family: '{font_name}';
        src: url('{font_url}') format('truetype');
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }}
      html, body, #resume-root {{
        font-family: '{font_name}', 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif;
      }}
    </style>
    """

    if '</head>' in html_content:
        return html_content.replace('</head>', f'{font_css}</head>', 1)
    if '<body' in html_content:
        return html_content.replace('<body', f'{font_css}<body', 1)
    return f'{font_css}{html_content}'

def is_safe_external_url(url: str) -> bool:
    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ('http', 'https'):
            return False
        host = parsed.hostname
        if not host:
            return False
        # Block localhost and internal hostnames
        if host in ('localhost', '127.0.0.1', '::1'):
            return False
        # Resolve hostname and block private/loopback/link-local/reserved
        try:
            ip = ipaddress.ip_address(host)
            ips = [ip]
        except ValueError:
            try:
                infos = socket.getaddrinfo(host, None)
                ips = [ipaddress.ip_address(info[4][0]) for info in infos]
            except Exception:
                return False
        for ip in ips:
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                return False
        return True
    except Exception:
        return False

def normalize_avatar_data(avatar_url: str) -> str:
    if not avatar_url:
        return ''
    avatar_url = str(avatar_url).strip()
    if avatar_url.startswith('data:image/'):
        return avatar_url
    if avatar_url.startswith('http://') or avatar_url.startswith('https://'):
        if not is_safe_external_url(avatar_url):
            return ''
        try:
            with urllib.request.urlopen(avatar_url, timeout=3) as response:
                content_type = response.headers.get('Content-Type', 'image/png')
                data = response.read(2 * 1024 * 1024)
                encoded = base64.b64encode(data).decode('utf-8')
                return f"data:{content_type};base64,{encoded}"
        except Exception:
            return ''
    return ''

def format_multiline(text: str) -> Markup:
    safe_text = clean_text_for_pdf(text or '')
    return Markup(safe_text.replace('\n', '<br/>'))

def normalize_date_range(start_date: str, end_date: str) -> str:
    start = clean_text_for_pdf(start_date or '').strip()
    end = clean_text_for_pdf(end_date or '').strip()
    if start and end:
        return f"{start} - {end}"
    return start or end

def build_resume_context(resume_data):
    personal_info = resume_data.get('personalInfo', {}) or {}
    name = clean_text_for_pdf(personal_info.get('name', '') or '未填写姓名')
    # Robust title extraction
    title_raw = (
        personal_info.get('title') or 
        personal_info.get('position') or 
        personal_info.get('jobTitle') or 
        personal_info.get('job_title') or
        resume_data.get('title') # Root fallback
    )
    title = clean_text_for_pdf(title_raw or '求职意向')
    email = clean_text_for_pdf(personal_info.get('email', '') or 'email@example.com')
    phone = clean_text_for_pdf(personal_info.get('phone', '') or '+86 138 0000 0000')
    location = clean_text_for_pdf(personal_info.get('location', '') or '')
    avatar = normalize_avatar_data(personal_info.get('avatar', '') or '')
    avatar_initial = (name[:1] if name else '您')

    summary_text = resume_data.get('summary') or personal_info.get('summary') or ''
    summary = format_multiline(summary_text) if summary_text else ''

    work_exps = []
    for exp in resume_data.get('workExps', []) or []:
        # Robust title (Company)
        title_text = exp.get('company') or exp.get('title') or exp.get('school') or '未填写单位'
        # Robust subtitle (Job Title / Position)
        raw_subtitle = exp.get('position') or exp.get('jobTitle') or exp.get('subtitle') or '职位'
        
        # Clean subtitle: Take only the front part if it looks like a composite title
        subtitle_text = raw_subtitle
        if ' | ' in raw_subtitle or ' · ' in raw_subtitle:
             subtitle_text = raw_subtitle.split(' ')[0] # Basic split for distinctive separators
        elif ' ' in raw_subtitle:
             segments = raw_subtitle.split()
             if len(segments) > 1 and len(segments[0]) >= 2:
                 subtitle_text = segments[0]
        
        date_text = exp.get('date') or normalize_date_range(exp.get('startDate', ''), exp.get('endDate', '')) or '时间不详'
        work_exps.append({
            'title': clean_text_for_pdf(title_text),
            'subtitle': clean_text_for_pdf(subtitle_text),
            'date': clean_text_for_pdf(date_text),
            'description': format_multiline(exp.get('description') or '未填写描述')
        })

    educations = []
    for edu in resume_data.get('educations', []) or []:
        title_text = edu.get('school') or edu.get('title') or '未填写学校'
        
        # Combine degree and major (avoid duplication)
        deg = (edu.get('degree') or '').strip()
        maj = (edu.get('major') or '').strip()
        sub = (edu.get('subtitle') or '').strip()
        
        if deg and maj:
            if deg == maj:
                subtitle_text = deg
            else:
                subtitle_text = f"{deg} · {maj}"
        else:
            subtitle_text = deg or maj or sub or '未说明'
            
        date_text = edu.get('date') or normalize_date_range(edu.get('startDate', ''), edu.get('endDate', '')) or '时间不详'
        educations.append({
            'title': clean_text_for_pdf(title_text),
            'subtitle': clean_text_for_pdf(subtitle_text),
            'date': clean_text_for_pdf(date_text)
        })

    projects = []
    for proj in resume_data.get('projects', []) or []:
        title_text = proj.get('title') or '未填写项目名称'
        subtitle_text = proj.get('role') or proj.get('subtitle') or '项目角色'
        date_text = proj.get('date') or '时间不详'
        projects.append({
            'title': clean_text_for_pdf(title_text),
            'subtitle': clean_text_for_pdf(subtitle_text),
            'date': clean_text_for_pdf(date_text),
            'description': format_multiline(proj.get('description') or '未填写项目描述')
        })

    skills = [clean_text_for_pdf(skill) for skill in (resume_data.get('skills', []) or []) if skill]

    # Estimate content length to decide layout density
    def estimate_content_length() -> int:
        parts = []
        parts.append(summary_text or '')
        for exp in resume_data.get('workExps', []) or []:
            parts.extend([
                exp.get('title') or '',
                exp.get('subtitle') or exp.get('position') or '',
                exp.get('description') or ''
            ])
        for edu in resume_data.get('educations', []) or []:
            parts.extend([
                edu.get('title') or edu.get('school') or '',
                edu.get('subtitle') or edu.get('degree') or edu.get('major') or ''
            ])
        for proj in resume_data.get('projects', []) or []:
            parts.extend([
                proj.get('title') or '',
                proj.get('subtitle') or proj.get('role') or '',
                proj.get('description') or ''
            ])
        parts.extend(resume_data.get('skills', []) or [])
        return sum(len(str(p)) for p in parts if p)

    content_len = estimate_content_length()
    # Compact for typical one-page content, normal for very long resumes
    if content_len <= 2600:
        layout = {
            'page_margin': '0.9cm 1.2cm',
            'body_font_size': '9pt',
            'body_line_height': '1.35',
            'section_gap': '8px',
            'item_gap': '5px'
        }
    else:
        layout = {
            'page_margin': '1.2cm 1.5cm',
            'body_font_size': '10pt',
            'body_line_height': '1.45',
            'section_gap': '10px',
            'item_gap': '6px'
        }

    return {
        'name': name,
        'title': title,
        'email': email,
        'phone': phone,
        'location': location,
        'avatar': avatar,
        'avatar_initial': avatar_initial,
        'summary': summary,
        'work_exps': work_exps,
        'educations': educations,
        'projects': projects,
        'skills': skills,
        'template_id': (resume_data.get('templateId') or 'modern').lower(),
        'layout': layout
    }

def generate_resume_html(resume_data):
    """Generate HTML content for resume based on resume data and template selection"""
    context = build_resume_context(resume_data)
    context['pdf_font_family'] = get_pdf_font_family()
    context['pdf_font_url'] = get_pdf_font_url()
    template_id = context.get('template_id', 'modern')

    templates = {
        'modern': """
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>{{ name }} - 简历</title>
    <style>
      {% if pdf_font_url %}
      @font-face {
        font-family: 'CustomPDF';
        src: url('{{ pdf_font_url }}') format('truetype');
        font-weight: normal;
        font-style: normal;
      }
      {% endif %}
      {% if pdf_font_url %}
      @font-face {
        font-family: 'CustomPDF';
        src: url('{{ pdf_font_url }}') format('truetype');
        font-weight: normal;
        font-style: normal;
      }
      {% endif %}
      {% if pdf_font_url %}
      @font-face {
        font-family: 'CustomPDF';
        src: url('{{ pdf_font_url }}') format('truetype');
        font-weight: normal;
        font-style: normal;
      }
      {% endif %}
      @page { 
        size: A4; 
        margin: {{ layout.page_margin }}; 
      }
        body { 
          font-family: {% if pdf_font_url %}'CustomPDF',{% endif %} '{{ pdf_font_family }}', 'Microsoft YaHei', 'SimHei', Arial, sans-serif; 
          font-size: {{ layout.body_font_size }}; 
          line-height: {{ layout.body_line_height }}; 
          color: #1f2937; 
        margin: 0;
        padding: 0;
        width: 100%;
        word-break: break-all;
        word-wrap: break-word;
      }
      * {
        box-sizing: border-box;
      }
      .page {
        width: 100%;
        margin: 0;
      }
      .container {
        width: 100%;
      }
      table { 
        width: 100%; 
        border-collapse: collapse;
        table-layout: auto;
      }
      .page-table {
        width: 100%;
        border-collapse: collapse;
      }
      .page-table td {
        padding: 0;
      }
    td { 
      vertical-align: top; 
      padding: 0;
    }
      .header {
        width: 100%;
        border-bottom: 2px solid #e5e7eb; 
        padding-bottom: 10px; 
        margin-bottom: 12px; 
      }
      .header-top {
        width: 100%;
        text-align: left;
      }
      .avatar { 
        width: 96px; 
        height: 120px; 
        display: inline-block;
      }
      .avatar-placeholder { 
        width: 96px; 
        height: 120px; 
        background-color: #d1d5db; 
        border: 1px solid #9ca3af;
        border-radius: 10px;
        display: inline-block;
        position: relative;
      }
      .avatar-placeholder svg {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 56px;
        height: 56px;
        transform: translate(-50%, -50%);
        fill: #6b7280;
      }
    .header-name { 
      font-size: 16pt; 
      font-weight: bold; 
      margin: 0 0 4px 0; 
    }
    .header-title { 
      font-size: 11pt; 
      color: #4b5563; 
      margin: 0 0 4px 0; 
    }
      .header-contact { 
        font-size: 9pt; 
        color: #6b7280; 
        word-break: break-all;
        word-wrap: break-word;
      }
      .section { 
        margin-bottom: {{ layout.section_gap }}; 
      }
      .section-title { 
        display: block;
        width: 100%;
        font-size: 11pt; 
        font-weight: bold; 
        color: #1e40af; 
      border-bottom: 1px solid #dbeafe; 
      padding-bottom: 3px; 
      margin-bottom: 6px; 
    }
      .item { 
        margin-bottom: {{ layout.item_gap }}; 
      }
    .item-header {
      width: 100%;
    }
    .item-title { 
      font-size: 10pt; 
      font-weight: bold; 
      color: #111827; 
    }
    .item-subtitle { 
      font-size: 9pt; 
      color: #374151; 
      margin: 2px 0; 
    }
    .item-date { 
      font-size: 8pt; 
      color: #6b7280; 
    }
      .item-desc { 
        font-size: 9pt; 
        color: #4b5563; 
        margin-top: 2px;
        word-break: break-all;
        word-wrap: break-word;
      }
    .skills { 
      margin-top: 3px; 
    }
      .skill { 
        display: inline; 
        background-color: transparent; 
        color: #374151; 
        border: none; 
        padding: 0; 
        font-size: 8pt; 
        margin-right: 8px; 
      }
  </style>
</head>
<body>
  <div class="page">
  <div class="container">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td width="110" valign="top">
        {% if avatar %}
          <img class="avatar" src="{{ avatar }}" alt="avatar" />
        {% else %}
          <div class="avatar-placeholder">
            <svg viewBox="0 0 64 64" aria-hidden="true">
              <circle cx="32" cy="22" r="12"></circle>
              <path d="M10 58c4-12 16-20 22-20s18 8 22 20"></path>
            </svg>
          </div>
        {% endif %}
      </td>
      <td valign="top">
        <h1 class="header-name">{{ name }}</h1>
        <div class="header-title">{{ title }}</div>
        <div class="header-contact">{{ email }} | {{ phone }}{% if location %} | {{ location }}{% endif %}</div>
      </td>
    </tr>
  </table>

  {% if summary %}
    <div class="section">
      <div class="section-title">个人简介</div>
      <div class="item-desc">{{ summary }}</div>
    </div>
  {% endif %}

  {% if work_exps %}
    <div class="section">
      <div class="section-title">工作经历</div>
      {% for exp in work_exps %}
        <div class="item">
          <div class="item-title">{{ exp.title }}{% if exp.subtitle %} - {{ exp.subtitle }}{% endif %}</div>
          <div class="item-date">{{ exp.date }}</div>
          <div class="item-desc">{{ exp.description }}</div>
        </div>
      {% endfor %}
    </div>
  {% endif %}

  {% if educations %}
    <div class="section">
        <div class="section-title">教育背景</div>
      {% for edu in educations %}
        <div class="item">
          <div class="item-title">{{ edu.title }}</div>
          <div class="item-subtitle">{{ edu.subtitle }}</div>
          <div class="item-date">{{ edu.date }}</div>
        </div>
      {% endfor %}
    </div>
  {% endif %}

  {% if projects %}
    <div class="section">
      <div class="section-title">项目经历</div>
      {% for proj in projects %}
        <div class="item">
          <div class="item-title">{{ proj.title }}{% if proj.subtitle %} - {{ proj.subtitle }}{% endif %}</div>
          <div class="item-date">{{ proj.date }}</div>
          <div class="item-desc">{{ proj.description }}</div>
        </div>
      {% endfor %}
    </div>
  {% endif %}

    {% if skills %}
      <div class="section">
        <div class="section-title">技能</div>
        <div class="skills">
          {% for skill in skills %}
            <span class="skill">{{ skill }}</span>
          {% endfor %}
        </div>
      </div>
    {% endif %}
  </div>
  </div>
  </body>
  </html>
        """,
        'classic': """
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>{{ name }} - 简历</title>
  <style>
      @page { 
        size: A4; 
        margin: {{ layout.page_margin }}; 
      }
        body { 
          font-family: {% if pdf_font_url %}'CustomPDF',{% endif %} '{{ pdf_font_family }}', 'SimSun', 'Times New Roman', serif; 
          font-size: {{ layout.body_font_size }}; 
          line-height: {{ layout.body_line_height }}; 
          color: #111827;
        margin: 0;
        padding: 0;
        width: 100%;
        word-break: break-all;
        word-wrap: break-word;
      }
      * {
        box-sizing: border-box;
      }
      .header { 
        text-align: center; 
        border-bottom: 2px solid #111827; 
        padding-bottom: 10px; 
        margin-bottom: 14px; 
      }
      .page {
        width: 100%;
        margin: 0;
      }
      .avatar { 
        width: 96px; 
        height: 96px; 
        border-radius: 9999px;
      }
      .avatar-placeholder { 
        width: 96px; 
        height: 96px; 
        background-color: #d1d5db;
        border: 1px solid #111827;
        border-radius: 9999px;
        position: relative;
      }
      .avatar-placeholder svg {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 56px;
        height: 56px;
        transform: translate(-50%, -50%);
        fill: #4b5563;
      }
    .name { 
      font-size: 18pt; 
      font-weight: bold; 
    }
    .title { 
      font-size: 11pt; 
      font-style: italic; 
      margin-top: 4px; 
    }
      .contact { 
        font-size: 9pt; 
        color: #4b5563; 
        margin-top: 5px; 
        word-break: break-all;
        word-wrap: break-word;
      }
      .section { 
        margin-bottom: {{ layout.section_gap }}; 
      }
      .section-title { 
        display: block;
        width: 100%;
        font-size: 11pt; 
        font-weight: bold; 
        border-bottom: 1px solid #111827; 
      padding-bottom: 3px; 
      margin-bottom: 6px; 
      background-color: #f3f4f6; 
      padding-left: 5px; 
    }
      .item { 
        margin-bottom: {{ layout.item_gap }}; 
        padding-left: 5px; 
      }
    .item-title { 
      font-size: 10pt;
      font-weight: bold; 
    }
    .item-subtitle { 
      font-size: 9pt;
      font-style: italic; 
      color: #374151; 
    }
    .item-date { 
      font-size: 8pt; 
      color: #6b7280; 
    }
      .item-desc { 
        font-size: 9pt; 
        margin-top: 2px;
        word-break: break-all;
        word-wrap: break-word;
      }
  </style>
</head>
  <body>
  <div class="page">
    <div class="header">
    {% if avatar %}
      <img class="avatar" src="{{ avatar }}" alt="avatar" />
      {% else %}
        <div class="avatar-placeholder">
          <svg viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="22" r="12"></circle>
            <path d="M10 58c4-12 16-20 22-20s18 8 22 20"></path>
          </svg>
        </div>
      {% endif %}
    <div class="name">{{ name }}</div>
    <div class="title">{{ title }}</div>
    <div class="contact">{{ email }} | {{ phone }}{% if location %} | {{ location }}{% endif %}</div>
  </div>

  {% if summary %}
    <div class="section">
        <div class="section-title">个人简介</div>
      <div class="item-desc">{{ summary }}</div>
    </div>
  {% endif %}

  {% if work_exps %}
    <div class="section">
      <div class="section-title">工作经历</div>
      {% for exp in work_exps %}
        <div class="item">
          <div class="item-title">{{ exp.title }}</div>
          <div class="item-subtitle">{{ exp.subtitle }}</div>
          <div class="item-date">{{ exp.date }}</div>
          <div class="item-desc">{{ exp.description }}</div>
        </div>
      {% endfor %}
    </div>
  {% endif %}

  {% if educations %}
    <div class="section">
      <div class="section-title">教育背景</div>
      {% for edu in educations %}
        <div class="item">
          <div class="item-title">{{ edu.title }}</div>
          <div class="item-subtitle">{{ edu.subtitle }}</div>
          <div class="item-date">{{ edu.date }}</div>
        </div>
      {% endfor %}
    </div>
  {% endif %}

  {% if projects %}
    <div class="section">
      <div class="section-title">项目经历</div>
      {% for proj in projects %}
        <div class="item">
          <div class="item-title">{{ proj.title }}</div>
          <div class="item-subtitle">{{ proj.subtitle }}</div>
          <div class="item-date">{{ proj.date }}</div>
          <div class="item-desc">{{ proj.description }}</div>
        </div>
      {% endfor %}
    </div>
  {% endif %}

    {% if skills %}
      <div class="section">
        <div class="section-title">技能</div>
        <div class="item-desc">{{ skills | join(' | ') }}</div>
      </div>
    {% endif %}
  </div>
  </body>
  </html>
        """,
        'minimal': """
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>{{ name }} - 简历</title>
  <style>
      @page { 
        size: A4; 
        margin: {{ layout.page_margin }}; 
      }
        body { 
          font-family: {% if pdf_font_url %}'CustomPDF',{% endif %} '{{ pdf_font_family }}', 'Microsoft YaHei', Arial, sans-serif; 
          font-size: {{ layout.body_font_size }}; 
          line-height: {{ layout.body_line_height }}; 
          color: #111827;
        margin: 0;
        padding: 0;
        width: 100%;
        word-break: break-all;
        word-wrap: break-word;
      }
      * {
        box-sizing: border-box;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: auto;
      }
      .page {
        width: 100%;
        margin: 0;
      }
      td {
        vertical-align: top;
        padding: 0;
      }
    .header { 
      margin-bottom: 14px; 
    }
      .header-top { 
        width: 100%; 
      }
      .avatar { 
        width: 84px; 
        height: 84px; 
        display: inline-block;
        border-radius: 9999px;
      }
      .avatar-placeholder { 
        width: 84px; 
        height: 84px; 
        background-color: #d1d5db;
        border: 1px solid #cbd5f5;
        border-radius: 9999px;
        display: inline-block;
        position: relative;
      }
      .avatar-placeholder svg {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 48px;
        height: 48px;
        transform: translate(-50%, -50%);
        fill: #6b7280;
      }
    .name { 
      font-size: 20pt; 
      font-weight: bold; 
      margin: 0; 
    }
    .title { 
      font-size: 11pt; 
      color: #6b7280; 
      margin: 3px 0 6px 0; 
    }
      .contact { 
        font-size: 9pt; 
        color: #9ca3af; 
        word-break: break-all;
        word-wrap: break-word;
      }
      .section { 
        margin-bottom: {{ layout.section_gap }}; 
      }
      .section-title { 
        display: block;
        width: 100%;
        font-size: 9pt; 
        font-weight: bold; 
        color: #9ca3af; 
      margin-bottom: 5px; 
    }
      .item { 
        margin-bottom: {{ layout.item_gap }}; 
      }
    .item-title { 
      font-size: 10pt;
      font-weight: bold; 
    }
    .item-date { 
      font-size: 8pt; 
      color: #9ca3af; 
    }
      .item-desc { 
        font-size: 9pt; 
        color: #374151; 
        margin-top: 2px;
        word-break: break-all;
        word-wrap: break-word;
      }
      .skills span { 
        display: inline; 
        margin-right: 8px; 
        border-bottom: none; 
        padding-bottom: 0; 
        font-size: 9pt; 
      }
  </style>
</head>
  <body>
  <div class="page">
    <div class="header">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="110" valign="top">
            {% if avatar %}
              <img class="avatar" src="{{ avatar }}" alt="avatar" />
        {% else %}
          <div class="avatar-placeholder">
            <svg viewBox="0 0 64 64" aria-hidden="true">
              <circle cx="32" cy="22" r="12"></circle>
              <path d="M10 58c4-12 16-20 22-20s18 8 22 20"></path>
            </svg>
          </div>
        {% endif %}
          </td>
          <td valign="top">
            <div class="name">{{ name }}</div>
            <div class="title">{{ title }}</div>
            <div class="contact">{{ email }} | {{ phone }}{% if location %} | {{ location }}{% endif %}</div>
          </td>
        </tr>
      </table>
    </div>

  {% if summary %}
    <div class="section">
       <div class="section-title">个人简介</div>
      <div class="item-desc">{{ summary }}</div>
    </div>
  {% endif %}

  {% if work_exps %}
    <div class="section">
      <div class="section-title">工作经历</div>
      {% for exp in work_exps %}
        <div class="item">
          <div class="item-title">{{ exp.title }}</div>
          <div class="item-date">{{ exp.date }}</div>
          <div class="item-desc">{{ exp.subtitle }}</div>
          <div class="item-desc">{{ exp.description }}</div>
        </div>
      {% endfor %}
    </div>
  {% endif %}

  {% if educations %}
    <div class="section">
      <div class="section-title">教育背景</div>
      {% for edu in educations %}
        <div class="item">
          <div class="item-title">{{ edu.title }}</div>
          <div class="item-date">{{ edu.date }}</div>
          <div class="item-desc">{{ edu.subtitle }}</div>
        </div>
      {% endfor %}
    </div>
  {% endif %}

  {% if projects %}
    <div class="section">
      <div class="section-title">项目经历</div>
      {% for proj in projects %}
        <div class="item">
          <div class="item-title">{{ proj.title }}</div>
          <div class="item-date">{{ proj.date }}</div>
          <div class="item-desc">{{ proj.subtitle }}</div>
          <div class="item-desc">{{ proj.description }}</div>
        </div>
      {% endfor %}
    </div>
  {% endif %}

    {% if skills %}
      <div class="section">
        <div class="section-title">技能</div>
        <div class="skills">
          {% for skill in skills %}
            <span>{{ skill }}</span>
          {% endfor %}
        </div>
      </div>
    {% endif %}
  </div>
  </body>
  </html>
        """,
    }

    template_html = templates.get(template_id, templates['modern'])
    env = Environment(loader=BaseLoader(), autoescape=True)
    return env.from_string(template_html).render(**context)

def extract_text_from_pdf(file_bytes):
    """Extract text content from a PDF file (bytes)."""
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        pages_text = []
        for page in reader.pages:
            try:
                page_text = page.extract_text() or ""
            except Exception:
                page_text = ""
            if page_text:
                pages_text.append(page_text)
        
        text = "\n".join(pages_text).strip()
        # 如果提取出的文字太少（比如扫描件），判断为需要 OCR
        if len(text) < 50:
            logger.info("PDF text extraction result too short, switching to multimodal OCR.")
            return "[EXTERNAL_OCR_REQUIRED]"
        return text
    except Exception as e:
        logger.error(f"Error in extract_text_from_pdf: {e}")
        return "[EXTERNAL_OCR_REQUIRED]"

def extract_text_multimodal(file_bytes):
    """Use Gemini Vision to extract text from PDF pages converted to images."""
    try:
        logger.info("Starting multimodal resume parsing...")
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        images = []
        
        # 限制页数，防止超过 API 限制或过慢
        max_pages = min(len(doc), 5)
        for i in range(max_pages):
            page = doc.load_page(i)
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2)) # 2x zoom for better OCR
            img_bytes = pix.tobytes("png")
            images.append({
                "mime_type": "image/png",
                "data": base64.b64encode(img_bytes).decode("utf-8")
            })
        
        if not images:
            return ""

        genai.configure(api_key=GEMINI_API_KEY)
        # 使用 pro 模型，视觉能力更强
        vision_model = genai.GenerativeModel('gemini-3-pro-preview')
        
        prompt = "你是一位专业的简历解析专家。请阅读这张简历图片，并将其中所有的文字内容完整、准确地提取出来，保持原有的段落和逻辑结构。不需要返回 JSON，只需要提取出的原始文本。"
        
        # 构造内容列表 [prompt, img1, img2, ...]
        content = [prompt]
        for img in images:
            content.append(img)
            
        response = vision_model.generate_content(content)
        return response.text.strip()
    except Exception as e:
        logger.error(f"Multimodal extraction failed: {e}")
        logger.error(traceback.format_exc())
        return ""

def extract_text_from_docx(file_bytes):
    """Extract text content from a DOCX file (bytes)."""
    doc = Document(io.BytesIO(file_bytes))
    paragraphs = [p.text for p in doc.paragraphs if p.text]
    return "\n".join(paragraphs).strip()

def parse_resume_text_with_ai(resume_text):
    """Parse resume text into structured data via AI."""
    if not resume_text.strip():
        raise ValueError('简历文本为空')

    logger.info(f"Starting resume parsing with AI, text length: {len(resume_text)}")

    genai.configure(api_key=GEMINI_API_KEY)
    ai_model = genai.GenerativeModel('gemini-3-pro-preview')

    prompt = f"""
    你是一位顶尖的简历解析专家。请分析以下简历文本，并将其转换为精确的结构化 JSON。
    
    **解析准则：**
    1. **语义优先**：理解标题含义。例如，“学业”、“教育经历”、“求学” -> `educations`；“实践”、“履历”、“工作背景”、“项目案例” -> `workExps` 或 `projects`。
    2. **贪婪提取**：无论是否有明确标题，都要尽力识别姓名、电话、邮箱、现居地。
    3. **关键词对标**：确保提取以下核心字段，即使简历中使用了同义词：
       - `company`: 公司全称/机构名称。
       - `position`: 职位/头衔。
       - `school`: 学校全称。
       - `major`: 专业名称。
    4. **个人总结**：查找“自我评价”、“Summary”、“个人简介”等，存入 `personalInfo.summary`。
    5. **日期规范**：统一为 YYYY-MM 格式。至今写为“至今”。
    6. **纯净输出**：仅返回 JSON 块，不要包含任何 Markdown 语法标记。

    **JSON 结构模板：**
    {{
        "personalInfo": {{
            "name": "",
            "title": "",
            "email": "",
            "phone": "",
            "location": "",
            "summary": ""
        }},
        "workExps": [
            {{
                "company": "",
                "position": "",
                "startDate": "YYYY-MM",
                "endDate": "YYYY-MM",
                "description": ""
            }}
        ],
        "educations": [
            {{
                "school": "",
                "degree": "本科/硕士/博士/等",
                "major": "",
                "startDate": "YYYY-MM",
                "endDate": "YYYY-MM"
            }}
        ],
        "projects": [
            {{
                "title": "",
                "description": "",
                "date": ""
            }}
        ],
        "skills": []
    }}

    **简历待解析文本内容：**
    ---
    {resume_text}
    ---
    """

    response = ai_model.generate_content(prompt)
    ai_result = parse_ai_response(response.text)

    if not ai_result:
        raise RuntimeError('AI parse failed')

    # 映射回系统内部格式
    parsed_data = {
        'personalInfo': ai_result.get('personalInfo', {}) or {},
        'workExps': ai_result.get('workExps', []) or [],
        'educations': ai_result.get('educations', []) or [],
        'projects': ai_result.get('projects', []) or [],
        'skills': ai_result.get('skills', []) or []
    }

    logger.info("Resume parsed successfully with AI")
    return parsed_data

@app.route('/api/ai/parse-resume', methods=['POST'])
def parse_resume():
    """使用 AI 解析简历文本"""
    try:
        data = request.get_json()
        resume_text = data.get('resumeText', '')
        parsed_data = parse_resume_text_with_ai(resume_text)
        return jsonify({'success': True, 'data': parsed_data})
    except Exception as e:
        logger.error(f"Resume parsing error: {str(e)}")
        logger.error(f"Full traceback: {traceback.format_exc()}")
        return jsonify({'error': '解析简历失败'}), 500

@app.route('/api/parse-pdf', methods=['POST'])
def parse_pdf():
    """解析 PDF/DOCX 简历并返回结构化数据"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': '未上传文件'}), 400
        file = request.files['file']
        if not file or not file.filename:
            return jsonify({'error': '文件名为空'}), 400
        filename = file.filename.lower()
        is_pdf = filename.endswith('.pdf')
        is_docx = filename.endswith('.docx')
        if not is_pdf and not is_docx:
            return jsonify({'error': '仅支持 PDF 或 DOCX 文件'}), 400
        file_bytes = file.read()
        if not file_bytes:
            return jsonify({'error': '文件内容为空'}), 400
        if is_pdf:
            resume_text = extract_text_from_pdf(file_bytes)
            # 如果判定为需要 OCR
            if resume_text == "[EXTERNAL_OCR_REQUIRED]":
                resume_text = extract_text_multimodal(file_bytes)
        else:
            resume_text = extract_text_from_docx(file_bytes)
            
        if not resume_text or len(resume_text.strip()) < 10:
            return jsonify({'error': '未能提取文本，且 OCR 识别失败。请上传内容清晰的 PDF/DOCX。'}), 400
            
        parsed_data = parse_resume_text_with_ai(resume_text)
        return jsonify({'success': True, 'data': parsed_data})
    except Exception as e:
        logger.error(f"PDF parsing error: {str(e)}")
        logger.error(f"Full traceback: {traceback.format_exc()}")
        return jsonify({'error': 'PDF 解析失败'}), 500

@app.route('/api/ai/analyze', methods=['POST', 'OPTIONS'])
@token_required
def analyze_resume(current_user_id):
    try:
        print(f"Current User ID: {current_user_id}")

        data = request.get_json()
        resume_data = data.get('resumeData')
        job_description = data.get('jobDescription', '')

        if not resume_data:
            return jsonify({'error': '需要提供简历数据'}), 400

        if model and check_gemini_quota():
            try:
                # --- RAG 检索逻辑开始 ---
                relevant_cases = find_relevant_cases_vector(resume_data)
                formatted_cases = ""
                if relevant_cases:
                    for i, case in enumerate(relevant_cases):
                        formatted_cases += f"案例 {i+1}：{case.get('job_role')} ({case.get('industry')})\n"
                        star = case.get('star', {})
                        formatted_cases += f"- 情况: {star.get('situation')}\n"
                        formatted_cases += f"- 任务: {star.get('task')}\n"
                        formatted_cases += f"- 行动: {star.get('action')}\n"
                        formatted_cases += f"- 结果: {star.get('result')}\n\n"
                
                rag_context = ""
                if formatted_cases:
                    rag_context = f"\n【参考案例】\n以下是该领域的优秀简历案例（STAR法则与Bullet Points示范），请参考其分析深度与用词风格：\n{formatted_cases}\n请注意：以上参考案例仅用于辅助你理解该领域的动作深度（Action Depth）和结果量化方式（Result Quantification）。请根据用户真实的经历进行优化，严禁生搬硬套案例中的具体业务内容，确保优化后的简历具有真实性。\n"
                # --- RAG 检索逻辑结束 ---

                format_requirements = f"""
重要格式要求（必须严格遵守）：
1. 诊断总结（summary）必须简练，禁止在总结中罗列具体的优化建议或技能点。
2. 技能建议必须通过 suggestions 数组给出，且 targetSection 设为 "skills"。
3. 技能建议的 suggestedValue 必须是一个个独立的技能关键词组成的数组。
4. **核心要求**：所有优化建议的 suggestedValue 必须是**直接可用的简历原文**，禁止包含“建议修改为”、“比如”、“示例”、“描述示例”等指导性词语。用户会直接复制此内容。
   - 错误："建议描述：负责后端开发..."
   - 正确："负责后端核心模块开发，通过重构代码将响应速度提升 50%。"
5. **严格匹配要求**：必须逐条对照 JD 的职责/要求，给出“缺口型建议”，明确指出缺失点并给出可直接写入简历的内容。
6. **数量要求**：suggestions 至少 8 条；若 JD 较复杂，建议 12-15 条。
7. 确保 JSON 格式正确，所有字段值使用中文（除技术术语外）。
{rag_context}
"""

                if job_description:
                    prompt = f"""
请扮演**严格的招聘面试官**，以“通过初筛”为目标，**严格对照 JD 与简历逐条核对**，输出**更多、更具体**的优化建议（**至少 8 条**，若差距明显可给出 12-15 条）。
请使用中文输出，字段值必须为中文。

评分标准（总分100）：
- 经历匹配（40分）：工作经历与JD职责的重合度、项目经验的含金量。
- 技能匹配（30分）：硬技能（编程语言、工具）和软技能的覆盖率。
- 格式规范（30分）：简历排版整洁度、关键信息的易读性、是否有错别字。

简历：
{format_resume_for_ai(resume_data)}

职位描述：
{job_description}

请仅返回 JSON（仅中文内容）：
{{
  "score": 85,
  "scoreBreakdown": {{
    "experience": 35,
    "skills": 25,
    "format": 25
  }},
  "summary": "简历整体评估简述（控制在50字以内）。",
  "strengths": ["优势1", "优势2"],
  "weaknesses": ["不足1", "不足2"],
  "suggestions": [
    {{
      "id": "suggestion-1",
      "type": "optimization",
      "title": "工作经历优化",
      "reason": "建议补充更多可量化的业绩指标。",
      "targetSection": "workExps",
      "originalValue": "原内容",
      "suggestedValue": "在XX项目中通过优化算法，将系统响应速度提升了30%。"
    }},
    {{
      "id": "suggestion-skills",
      "type": "missing",
      "title": "核心技能补全",
      "reason": "JD对AI工程能力有很高要求，建议补齐相关技能。",
      "targetSection": "skills",
      "suggestedValue": ["Prompt Engineering", "RAG", "Agent 设计", "Vector DB"]
    }}
  ],
  "missingKeywords": ["关键词1", "关键词2"]
}}

{format_requirements}
"""
                else:
                    prompt = f"""
请扮演**严格的招聘面试官**，以“通过初筛”为目标，输出**更多、更具体**的优化建议（**至少 8 条**，必要时 12-15 条）。
请使用中文输出，字段值必须为中文。

评分标准（总分100）：
- 经历质量（40分）：工作内容的具体程度、是否有量化成果（使用STAR法则）。
- 技能概况（30分）：技能栈是否完整、是否突出了核心竞争力。
- 格式规范（30分）：结构是否清晰、排版是否专业、语言是否精炼。

简历：
{format_resume_for_ai(resume_data)}

请仅返回 JSON（仅中文内容）：
{{
  "score": 75,
  "scoreBreakdown": {{
    "experience": 30,
    "skills": 20,
    "format": 25
  }},
  "summary": "简历整体评估简述（控制在50字以内）。",
  "strengths": ["优势1", "优势2"],
  "weaknesses": ["不足1", "不足2"],
  "suggestions": [
    {{
      "id": "suggestion-1",
      "type": "optimization",
      "title": "个人简介优化",
      "reason": "建议突出核心竞争力，让招聘方一眼看到你的价值。",
      "targetSection": "summary",
      "originalValue": "原内容",
      "suggestedValue": "具有5年Java开发经验，精通Spring Boot框架，曾主导千万级高并发系统设计..."
    }},
    {{
      "id": "suggestion-skills",
      "type": "missing",
      "title": "技能栈补全",
      "reason": "当前技能列表较单薄，建议补充与目标职位相关的专业技能。",
      "targetSection": "skills",
      "suggestedValue": ["Python", "数据可视化", "SQL", "项目管理"]
    }}
  ],
  "missingKeywords": []
}}

{format_requirements}
"""

                response = model.generate_content(prompt)
                ai_result = parse_ai_response(response.text)

                return jsonify({
                    'score': ai_result.get('score', 70),
                    'scoreBreakdown': ai_result.get('scoreBreakdown', {'experience': 0, 'skills': 0, 'format': 0}),
                    'summary': ai_result.get('summary', '智能分析完成，简历整体评估已生成。'),
                    'suggestions': ai_result.get('suggestions', []),
                    'strengths': ai_result.get('strengths', []),
                    'weaknesses': ai_result.get('weaknesses', []),
                    'missingKeywords': ai_result.get('missingKeywords', [])
                }), 200

            except Exception as ai_error:
                print(f"Gemini AI analysis failed: {ai_error}")
                logger.error(f"Gemini AI analysis failed: {ai_error}")
                logger.error(f"Full traceback: {traceback.format_exc()}")

                if "429" in str(ai_error) or "quota" in str(ai_error).lower() or "exceeded" in str(ai_error).lower():
                    print("Gemini API quota exceeded, falling back to enhanced mock analysis")
                    logger.warning("Gemini API quota exceeded, falling back to enhanced mock analysis")

                score = calculate_resume_score(resume_data)
                suggestions = generate_enhanced_suggestions(resume_data, score, job_description)

                return jsonify({
                    'score': score,
                    'summary': '智能分析暂时不可用，已生成基础分析报告，建议稍后再试。',
                    'suggestions': suggestions,
                    'strengths': ['结构清晰', '格式规范'],
                    'weaknesses': ['智能分析暂不可用', '请稍后重试以获取更详细分析'],
                    'missingKeywords': [] if not job_description else ['智能分析暂不可用']
                }), 200

        score = calculate_resume_score(resume_data)
        suggestions = generate_suggestions(resume_data, score)

        return jsonify({
            'score': score,
            'summary': '简历分析完成，请查看优化建议。',
            'suggestions': suggestions,
            'strengths': ['结构清晰', '格式规范'],
            'weaknesses': ['缺少量化结果', '技能描述过于笼统'],
            'missingKeywords': [] if not job_description else ['正在分析关键词...']
        }), 200

    except Exception as e:
        logger.error(f"简历分析出错: {traceback.format_exc()}")
        return jsonify({'error': '服务器内部错误'}), 500

@app.route('/api/ai/parse-screenshot', methods=['POST', 'OPTIONS'])
@token_required
def parse_screenshot(current_user_id):
    try:
        data = request.get_json()
        image = data.get('image', '')
        if not image:
            return jsonify({'error': '图片不能为空'}), 400

        if model and check_gemini_quota():
            try:
                prompt = "请从图片中提取职位描述文本，只返回提取结果，不要解释。请仅使用中文输出。"
                from base64 import b64decode
                import re
                base64_data = re.sub('^data:image/.+;base64,', '', image)
                image_data = b64decode(base64_data)
                image_part = {"mime_type": "image/png", "data": image_data}
                response = model.generate_content([prompt, image_part])
                return jsonify({'text': response.text.strip()})
            except Exception as ai_error:
                logger.error(f"AI 截图解析失败: {ai_error}")
                return jsonify({'text': '职位描述识别失败，请手动粘贴。'}), 200
        return jsonify({'text': '职位描述识别失败，请手动粘贴。'}), 200
    except Exception as e:
        return jsonify({'error': '服务器内部错误'}), 500

@app.route('/api/ai/chat', methods=['POST', 'OPTIONS'])
@token_required
def ai_chat(current_user_id):
    try:
        data = request.get_json()
        message = data.get('message', '')
        resume_data = data.get('resumeData')
        job_description = data.get('jobDescription', '')
        chat_history = data.get('chatHistory', [])
        score = data.get('score', 0)
        suggestions = data.get('suggestions', [])

        if not message:
            return jsonify({'error': '消息内容不能为空'}), 400

        clean_message = message.replace('[INTERVIEW_MODE]', '').strip()

        if model and check_gemini_quota():
            try:
                formatted_chat = ""
                for msg in chat_history:
                    role = "候选人" if msg.get('role') == 'user' else "面试官"
                    msg_text = msg.get('text', '').replace('[INTERVIEW_MODE]', '').strip()
                    if msg_text and not msg_text.startswith('SYSTEM_'):
                        formatted_chat += f"{role}: {msg_text}\n"

                prompt = f"""
【严格角色】你是专业 AI 面试官，基于职位描述和候选人简历进行模拟面试。
禁止提及任何评分，禁止给出建议，保持面试官角色。
职位描述：{job_description if job_description else '未提供'}
简历信息：{format_resume_for_ai(resume_data) if resume_data else '未提供'}
对话历史：{formatted_chat if formatted_chat else '面试刚开始'}
候选人回答：{clean_message}
请直接输出面试官回答：简短点评 + 下一道具体问题。
"""
                response = model.generate_content(prompt)
                return jsonify({'response': response.text})
            except Exception as ai_error:
                logger.error(f"AI 面试失败: {ai_error}")
                return jsonify({'response': '面试官暂时开小差了，请稍后再试。'}), 200
        return jsonify({'response': '面试官暂时开小差了。'}), 200
    except Exception as e:
        return jsonify({'error': '服务器内部错误'}), 500

def format_resume_for_ai(resume_data):
    """用于 AI 的简历格式化文本"""
    formatted = []
    personal = resume_data.get('personalInfo', {})
    if personal:
        formatted.append(f"姓名: {personal.get('name', '')}")
        formatted.append(f"职位: {personal.get('title', '')}")
    
    summary = resume_data.get('summary') or personal.get('summary', '')
    if summary: formatted.append(f"个人简介: {summary}")

    work_exps = resume_data.get('workExps', [])
    if work_exps:
        formatted.append("\n工作经历:")
        for exp in work_exps:
            formatted.append(f"- {exp.get('position', '')} @ {exp.get('company', '')}: {exp.get('description', '')}")

    educations = resume_data.get('educations', [])
    if educations:
        formatted.append("\n教育背景:")
        for edu in educations:
             formatted.append(f"- {edu.get('degree', '')} {edu.get('major', '')} @ {edu.get('school', '')}")

    skills = resume_data.get('skills', [])
    if skills: formatted.append(f"\n技能: {', '.join(skills)}")
    return '\n'.join(formatted)

def parse_ai_response(response_text):
    """解析 AI 回复中的结构化数据"""
    try:
        import json
        start = response_text.find('{')
        end = response_text.rfind('}') + 1
        if start != -1 and end != 0:
            return json.loads(response_text[start:end])
    except: pass
    return {'score': 75, 'strengths': [], 'weaknesses': [], 'suggestions': [], 'missingKeywords': []}

@app.route('/api/ai/generate-resume', methods=['POST', 'OPTIONS'])
@token_required
def generate_resume(current_user_id):
    try:
        print(f"Generate Resume Current User ID: {current_user_id}")

        data = request.get_json()
        message = data.get('message', '')
        resume_data = data.get('resumeData')
        chat_history = data.get('chatHistory', [])
        score = data.get('score', 0)
        suggestions = data.get('suggestions', [])

        if not resume_data:
            return jsonify({'error': '需要提供简历数据'}), 400

        if model and check_gemini_quota():
            try:
                formatted_chat = ""
                for msg in chat_history:
                    role = "用户" if msg.get('role') == 'user' else "顾问"
                    formatted_chat += f"{role}: {msg.get('text', '')}\n"

                accepted_suggestions = []
                for s in suggestions:
                    if s.get('status') == 'accepted':
                        accepted_suggestions.append(s.get('title', '建议'))

                accepted_suggestions_str = ', '.join(accepted_suggestions) if accepted_suggestions else '无'

                resume_info = format_resume_for_ai(resume_data)
                chat_info = formatted_chat if formatted_chat else '无对话历史'

                prompt = f"""
请根据以下信息生成一份完整且优化后的简历。
请仅使用中文输出，所有字段值必须为中文。
不要包含任何 AI 优化说明或标记。

**输入信息**
1. 原始简历数据：
{resume_info}

2. 对话历史：
{chat_info}

3. 当前评分：
{score}/100

4. 已采纳建议：
{accepted_suggestions_str}

**输出要求**
1. 仅返回 JSON（不要附加额外文本）。
2. 内容需结合原始数据、对话上下文和已采纳建议。
3. 所有字段需完整合理，不得留空。

**输出格式**
{{
  "resumeData": {{
    "personalInfo": {{
      "name": "姓名",
      "title": "职位标题",
      "email": "邮箱地址",
      "phone": "电话号码",
      "location": "所在地"
    }},
    "workExps": [
      {{
        "id": 1,
        "company": "公司名称",
        "position": "职位",
        "startDate": "开始日期",
        "endDate": "结束日期",
        "description": "详细工作描述（包含量化结果）"
      }}
    ],
    "educations": [
      {{
        "id": 1,
        "school": "学校名称",
        "degree": "学位",
        "major": "专业",
        "startDate": "开始日期",
        "endDate": "结束日期"
      }}
    ],
    "projects": [
      {{
        "id": 1,
        "title": "项目名称",
        "description": "详细项目描述",
        "date": "项目时间"
      }}
    ],
    "skills": ["技能1", "技能2", "技能3"],
    "summary": "专业简介"
  }}
}}
"""

                response = model.generate_content(prompt)
                ai_result = parse_ai_response(response.text)

                if ai_result and ai_result.get('resumeData'):
                    generated_resume = {
                        'personalInfo': ai_result['resumeData'].get('personalInfo', {}) or {},
                        'workExps': ai_result['resumeData'].get('workExps', []) or [],
                        'educations': ai_result['resumeData'].get('educations', []) or [],
                        'projects': ai_result['resumeData'].get('projects', []) or [],
                        'skills': ai_result['resumeData'].get('skills', []) or [],
                        'summary': ai_result['resumeData'].get('summary', '') or ''
                    }

                    return jsonify({'resumeData': generated_resume})
                else:
                    enhanced_resume = {
                        'personalInfo': resume_data.get('personalInfo', {}) or {},
                        'workExps': resume_data.get('workExps', []) or [],
                        'educations': resume_data.get('educations', []) or [],
                        'projects': resume_data.get('projects', []) or [],
                        'skills': resume_data.get('skills', []) or [],
                        'summary': resume_data.get('summary', '') or ''
                    }

                    return jsonify({'resumeData': enhanced_resume})

            except Exception as ai_error:
                print(f"AI 生成简历失败: {ai_error}")
                logger.error(f"AI 生成简历失败: {ai_error}")

                if "429" in str(ai_error) or "quota" in str(ai_error).lower() or "exceeded" in str(ai_error).lower():
                    print("Gemini 配额超限，回退为本地简历生成")
                    logger.warning("Gemini 配额超限，回退为本地简历生成")

                enhanced_resume = {
                    'personalInfo': resume_data.get('personalInfo', {}) or {},
                    'workExps': resume_data.get('workExps', []) or [],
                    'educations': resume_data.get('educations', []) or [],
                    'projects': resume_data.get('projects', []) or [],
                    'skills': resume_data.get('skills', []) or [],
                    'summary': resume_data.get('summary', '') or ''
                }

                return jsonify({'resumeData': enhanced_resume}), 200

        mock_resume = {
            'personalInfo': resume_data.get('personalInfo', {}) or {},
            'workExps': resume_data.get('workExps', []) or [],
            'educations': resume_data.get('educations', []) or [],
            'projects': resume_data.get('projects', []) or [],
            'skills': resume_data.get('skills', []) or [],
            'summary': resume_data.get('summary', '') or ''
        }

        return jsonify({'resumeData': mock_resume}), 200

    except Exception as e:
        return jsonify({'error': '服务器内部错误'}), 500


def generate_enhanced_mock_chat_response(message, score, suggestions):
    """当 AI 不可用时的增强版面试回复"""
    if 'SYSTEM_START_INTERVIEW' in message or 'INTERVIEW_MODE' in message:
        return "我是你的智能面试官，现在开始：请用 1 分钟介绍自己，并说明目标岗位方向。"

    return "点评：表达清晰，但缺少量化结果。改进：补充指标数据。参考：我在 X 项目中将 Y 提升 Z%。下一题：请举例说明你解决关键问题的项目及结果。"


def generate_mock_chat_response(message, score, suggestions):
    """当 AI 不可用时的基础面试回复"""
    if 'SYSTEM_START_INTERVIEW' in message or 'INTERVIEW_MODE' in message:
        return "我是你的智能面试官，现在开始：请简要介绍自己，并说明为何适合该岗位。"

    return "点评：结构尚可，但缺少背景与结果。改进：补充场景和成果。参考：当时……我……最终达成……。下一题：描述一次你处理冲突或分歧的经历，以及你如何推动结果。"

if __name__ == '__main__':
    # 使用配置的端口
    app.run(host='0.0.0.0', port=PORT)
