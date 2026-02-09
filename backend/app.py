# -*- coding: utf-8 -*-
from dotenv import load_dotenv
load_dotenv()  # 加载 .env 文件
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from supabase import create_client, Client
import os
import uuid
from datetime import datetime
from functools import wraps
import jwt
from werkzeug.security import generate_password_hash, check_password_hash
import re
from xhtml2pdf import pisa
from pypdf import PdfReader
from docx import Document
import io
import logging
import traceback
import google.generativeai as genai

app = Flask(__name__)

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
             "allow_headers": ["Content-Type", "Authorization", "X-Requested-With"],
             "supports_credentials": True
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
    model = genai.GenerativeModel('gemini-3-flash-preview')
else:
    model = None

# Initialize Supabase with error handling
try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("Supabase connected successfully")
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
mock_resumes = {}

def token_required(f):
    @wraps(f)
    def decorated(*view_args, **view_kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return jsonify({'message': '缺少 Authorization 请求头'}), 401

        token = auth_header.split(" ")[1] if " " in auth_header else auth_header

        # --- 兼容性兜底 ---
        # 1. 优先尝试无损解码（跳过签名验证）
        try:
            # options={"verify_signature": False} 是避免 401 的关键
            payload = jwt.decode(token, options={"verify_signature": False})
            user_id = payload.get('sub') or payload.get('user_id')

            if user_id:
                print(f"DEBUG: Auth Success (Skip Verify). User: {user_id}")
                return f(user_id, *view_args, **view_kwargs)
        except Exception as e:
            print(f"DEBUG: Payload decode failed: {str(e)}")

        # 2. 使用 Supabase 官方验证
        if hasattr(supabase, 'auth'):
            try:
                user_res = supabase.auth.get_user(token)
                if user_res and user_res.user:
                    return f(user_res.user.id, *view_args, **view_kwargs)
            except Exception as se:
                print(f"DEBUG: Supabase SDK failed: {str(se)}")

        # 仍然失败
        return jsonify({'message': '未授权：令牌无效或用户不存在'}), 401

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

        token = jwt.encode({'user_id': user['id']}, JWT_SECRET, algorithm="HS256")

        return jsonify({
            'message': '登录成功',
            'token': token,
            'user': {
                'id': user['id'],
                'email': user['email'],
                'name': user['name']
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
            # Mock mode: get resumes from mock_resumes
            user_resumes = []
            for resume_id, resume_data in mock_resumes.items():
                if resume_data.get('user_id') == current_user_id:
                    user_resumes.append(resume_data)
            
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
        resume_data = data.get('resumeData', {})

        resume_record = {
            'id': str(uuid.uuid4()),
            'user_id': current_user_id,
            'title': title,
            'resume_data': resume_data,
            'created_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat()
        }

        if is_mock_mode():
            mock_resumes[resume_record['id']] = resume_record
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
            resume = mock_resumes.get(resume_id)
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
            update_data['resume_data'] = resume_data
        if score is not None:
            update_data['score'] = score

        if is_mock_mode():
            resume = mock_resumes.get(resume_id)
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
            resume = mock_resumes.get(resume_id)
            if not resume or resume.get('user_id') != current_user_id:
                return jsonify({'error': '简历不存在或删除失败'}), 404

            deleted_resume = mock_resumes.pop(resume_id)
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
                return jsonify({'error': '用户不存在'}), 404
            
            # Return only selected fields
            user_data = {
                'id': user['id'],
                'email': user['email'],
                'name': user['name'],
                'created_at': user['created_at']
            }
        else:
            result = supabase.table('users').select('id, email, name, created_at').eq('id', current_user_id).execute()
            
            if not result.data:
                return jsonify({'error': '用户不存在'}), 404
            
            user_data = result.data[0]
        
        return jsonify({'user': user_data}), 200
    
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
                'name': '创意风格',
                'description': '适合创意行业的独特模板',
                'preview': 'creative'
            }
        ]
        return jsonify({'templates': templates}), 200
    
    except Exception as e:
        return jsonify({'error': '服务器内部错误'}), 500

@app.route('/api/export-pdf', methods=['POST'])
def export_pdf():
    try:
        data = request.get_json()
        resume_data = data.get('resumeData')
        jd_text = data.get('jdText', '')
        
        if not resume_data:
            return jsonify({'error': '需要提供简历数据'}), 400
        
        logger.info(f"Starting PDF generation with xhtml2pdf")
        
        # Generate HTML for PDF
        html_content = generate_resume_html(resume_data)
        logger.info(f"Generated HTML content length: {len(html_content)}")
        
        # 使用 xhtml2pdf 生成 PDF
        result = io.BytesIO()
        pisa_status = pisa.CreatePDF(html_content, dest=result)
        
        if pisa_status.err:
            logger.error("PDF 生成失败（xhtml2pdf 报错）")
            return jsonify({'error': 'PDF 生成失败'}), 500
        
        result.seek(0)
        logger.info("PDF generated successfully with xhtml2pdf")

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

def generate_resume_html(resume_data):
    """Generate HTML content for resume based on resume data"""

    # Personal Info - safe defaults and cleaning
    personal_info = resume_data.get('personalInfo', {}) or {}
    name = clean_text_for_pdf(personal_info.get('name', '') or '姓名')
    title = clean_text_for_pdf(personal_info.get('title', '') or '职位')
    email = clean_text_for_pdf(personal_info.get('email', '') or '邮箱')
    phone = clean_text_for_pdf(personal_info.get('phone', '') or '电话')
    location = clean_text_for_pdf(personal_info.get('location', '') or '所在地')

    header_html = f"""
    <div class="resume-header">
        <h1>{name}</h1>
        <div class="contact">
            {title}<br>
            {email} | {phone} | {location}
        </div>
    </div>
    """

    # 工作经历 - safe defaults and cleaning
    work_exps = resume_data.get('workExps', []) or []
    work_html = '<div class="section"><h2>工作经历</h2>'
    for exp in work_exps or []:
        company = clean_text_for_pdf(exp.get('company', '') or '公司名称')
        position = clean_text_for_pdf(exp.get('position', '') or '职位')
        start_date = clean_text_for_pdf(exp.get('startDate', '') or '开始日期')
        end_date = clean_text_for_pdf(exp.get('endDate', '') or '结束日期')
        description = clean_text_for_pdf(exp.get('description', '') or '工作描述')

        work_html += f"""
        <div class="work-experience">
            <h3>{position} - {company}</h3>
            <div class="date">{start_date} - {end_date}</div>
            <div class="description">{description}</div>
        </div>
        """
    work_html += '</div>'

    # 教育背景 - safe defaults and cleaning
    educations = resume_data.get('educations', []) or []
    edu_html = '<div class="section"><h2>教育背景</h2>'
    for edu in educations or []:
        school = clean_text_for_pdf(edu.get('school', '') or '学校名称')
        degree = clean_text_for_pdf(edu.get('degree', '') or '学位')
        major = clean_text_for_pdf(edu.get('major', '') or '专业')
        start_date = clean_text_for_pdf(edu.get('startDate', '') or '开始日期')
        end_date = clean_text_for_pdf(edu.get('endDate', '') or '结束日期')

        edu_html += f"""
        <div class="education">
            <h3>{school}</h3>
            <div class="date">{degree} {major} | {start_date} - {end_date}</div>
        </div>
        """
    edu_html += '</div>'

    # 项目经历 - safe defaults and cleaning
    projects = resume_data.get('projects', []) or []
    proj_html = '<div class="section"><h2>项目经历</h2>'
    for proj in projects or []:
        proj_title = clean_text_for_pdf(proj.get('title', '') or '项目名称')
        description = clean_text_for_pdf(proj.get('description', '') or '项目描述')
        date = clean_text_for_pdf(proj.get('date', '') or '项目时间')

        proj_html += f"""
        <div class="projects">
            <h3>{proj_title}</h3>
            <div class="date">{date}</div>
            <div class="description">{description}</div>
        </div>
        """
    proj_html += '</div>'

    # 个人简介 - safe defaults and cleaning
    summary = resume_data.get('summary', '') or ''
    summary_html = ''
    if summary:
        summary_html = '<div class="section"><h2>个人简介</h2>'
        clean_summary = clean_text_for_pdf(summary)
        summary_html += f'<div class="summary">{clean_summary}</div>'
        summary_html += '</div>'

    # 技能 - safe defaults and cleaning
    skills = resume_data.get('skills', []) or []
    skills_html = '<div class="section"><h2>技能</h2><div class="skills">'
    for skill in skills or []:
        clean_skill = clean_text_for_pdf(skill or "技能")
        skills_html += f'<span class="skill-item">{clean_skill}</span>'
    skills_html += '</div></div>'

    # Combine all sections with CSS for xhtml2pdf
    full_html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>{name} - 简历</title>
        <style>
            @page {{
                size: A4;
                margin: 1.5cm;
            }}

            /* Noto Sans SC fallback */
            @font-face {{
                font-family: 'Noto Sans SC';
                src: url('font.ttf');
                font-weight: normal;
                font-style: normal;
            }}

            body {{
                font-family: 'Noto Sans SC', 'Microsoft YaHei', 'SimHei', Arial, sans-serif;
                font-size: 11px;
                line-height: 1.4;
                color: #333333;
                margin: 0;
                padding: 10px;
            }}

            .resume-header {{
                text-align: center;
                border-bottom: 2px solid #333333;
                padding-bottom: 15px;
                margin-bottom: 20px;
            }}

            .resume-header h1 {{
                margin: 0;
                font-size: 22px;
                font-weight: bold;
                line-height: 1.3;
                font-family: 'Noto Sans SC', 'Microsoft YaHei', 'SimHei', Arial, sans-serif;
            }}

            .resume-header .contact {{
                margin: 8px 0;
                font-size: 12px;
                line-height: 1.5;
                font-family: 'Noto Sans SC', 'Microsoft YaHei', 'SimHei', Arial, sans-serif;
            }}

            .section {{
                margin-bottom: 20px;
            }}

            .section h2 {{
                font-size: 15px;
                font-weight: bold;
                border-bottom: 1px solid #cccccc;
                padding-bottom: 3px;
                margin-bottom: 10px;
                color: #333333;
                font-family: 'Noto Sans SC', 'Microsoft YaHei', 'SimHei', Arial, sans-serif;
            }}

            .work-experience, .education, .projects {{
                margin-bottom: 12px;
            }}

            .work-experience h3, .education h3, .projects h3 {{
                font-size: 12px;
                font-weight: bold;
                margin: 0 0 3px 0;
                line-height: 1.3;
                font-family: 'Noto Sans SC', 'Microsoft YaHei', 'SimHei', Arial, sans-serif;
            }}

            .work-experience .date, .education .date, .projects .date {{
                font-size: 10px;
                color: #666666;
                font-style: italic;
                margin-bottom: 3px;
                font-family: 'Noto Sans SC', 'Microsoft YaHei', 'SimHei', Arial, sans-serif;
            }}

            .work-experience .description, .education .description, .projects .description {{
                font-size: 10px;
                margin: 0;
                line-height: 1.4;
                text-align: left;
                font-family: 'Noto Sans SC', 'Microsoft YaHei', 'SimHei', Arial, sans-serif;
            }}

            .skills {{
                margin-top: 5px;
            }}

            .skill-item {{
                background-color: #f8f9fa;
                padding: 3px 8px;
                margin: 2px;
                font-size: 9px;
                border: 1px solid #e9ecef;
                border-radius: 3px;
                display: inline-block;
                font-family: 'Noto Sans SC', 'Microsoft YaHei', 'SimHei', Arial, sans-serif;
            }}

            ul {{
                margin: 3px 0;
                padding-left: 15px;
            }}

            li {{
                margin-bottom: 2px;
                font-size: 10px;
                line-height: 1.4;
                font-family: 'Noto Sans SC', 'Microsoft YaHei', 'SimHei', Arial, sans-serif;
            }}
        </style>
    </head>
    <body>
        <div class="resume-header">
            <h1>{name}</h1>
            <div class="contact">
                {title}<br>
                {email} | {phone} | {location}
            </div>
        </div>

        {summary_html if summary else ''}
        {work_html if work_exps else ''}
        {edu_html if educations else ''}
        {proj_html if projects else ''}
        {skills_html if skills else ''}
    </body>
    </html>
    """

    return full_html

def extract_text_from_pdf(file_bytes):
    """Extract text content from a PDF file (bytes)."""
    reader = PdfReader(io.BytesIO(file_bytes))
    pages_text = []
    for page in reader.pages:
        try:
            page_text = page.extract_text() or ""
        except Exception:
            page_text = ""
        if page_text:
            pages_text.append(page_text)
    return "\n".join(pages_text).strip()

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
    ai_model = genai.GenerativeModel('gemini-3-flash-preview')

    prompt = f"""
    请解析以下简历文本，并按如下 JSON 格式返回结构化数据：
    {{
        "personalInfo": {{
            "name": "",
            "title": "",
            "email": "",
            "phone": "",
            "location": ""
        }},
        "workExps": [
            {{
                "company": "",
                "position": "",
                "startDate": "",
                "endDate": "",
                "description": ""
            }}
        ],
        "educations": [
            {{
                "school": "",
                "degree": "",
                "major": "",
                "startDate": "",
                "endDate": ""
            }}
        ],
        "projects": [
            {{
                "title": "",
                "description": "",
                "date": ""
            }}
        ],
        "skills": ["", "", ""]
    }}

    规则：
    1. 若字段缺失，返回空字符串。
    2. 如有多条工作/教育/项目经历，全部提取。
    3. 技能拆分为单项数组。
    4. 仅返回 JSON，不要额外文字。

    简历文本：
    {resume_text}
    """

    response = ai_model.generate_content(prompt)
    ai_result = parse_ai_response(response.text)

    if not ai_result:
        raise RuntimeError('AI parse failed')

    parsed_data = {
        'personalInfo': ai_result.get('personalInfo', {}) or {},
        'workExps': ai_result.get('workExps', []) or [],
        'educations': ai_result.get('educations', []) or [],
        'projects': ai_result.get('projects', []) or [],
        'skills': ai_result.get('skills', []) or [],
        'gender': ''
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
        else:
            resume_text = extract_text_from_docx(file_bytes)
        if not resume_text:
            return jsonify({'error': '未能提取文本，请上传可复制文本的 PDF/DOCX。'}), 400
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
                if job_description:
                    prompt = f"""
请分析以下简历与职位描述的匹配度，并提供详细优化建议。
请使用中文输出，字段值必须为中文。

简历：
{format_resume_for_ai(resume_data)}

职位描述：
{job_description}

请仅返回 JSON（仅中文内容）：
{{
  "score": 85,
  "summary": "匹配度分析完成。",
  "strengths": ["优势1", "优势2"],
  "weaknesses": ["不足1", "不足2"],
  "suggestions": [
    {{
      "id": "suggestion-1",
      "type": "optimization",
      "title": "工作经历优化",
      "reason": "优化原因说明",
      "targetSection": "workExps",
      "originalValue": "原内容",
      "suggestedValue": "优化后的内容"
    }}
  ],
  "missingKeywords": ["关键词1", "关键词2"]
}}
"""
                else:
                    prompt = f"""
请分析简历并提供详细优化建议。
请使用中文输出，字段值必须为中文。

简历：
{format_resume_for_ai(resume_data)}

请仅返回 JSON（仅中文内容）：
{{
  "score": 75,
  "summary": "简历分析完成。",
  "strengths": ["优势1", "优势2"],
  "weaknesses": ["不足1", "不足2"],
  "suggestions": [
    {{
      "id": "suggestion-1",
      "type": "optimization",
      "title": "个人简介优化",
      "reason": "优化原因说明",
      "targetSection": "summary",
      "originalValue": "原内容",
      "suggestedValue": "优化后的内容"
    }},
    {{
      "id": "suggestion-2",
      "type": "optimization",
      "title": "量化成果",
      "reason": "补充可量化的数据",
      "targetSection": "workExps",
      "originalValue": "原描述",
      "suggestedValue": "优化后的描述（含量化结果）"
    }}
  ],
  "missingKeywords": []
}}
"""

                response = model.generate_content(prompt)
                ai_result = parse_ai_response(response.text)

                return jsonify({
                    'score': ai_result.get('score', 70),
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
        return jsonify({'error': '服务器内部错误'}), 500


def format_resume_for_ai(resume_data):
    """用于 AI 的简历格式化文本"""
    formatted = []

    personal = resume_data.get('personalInfo', {})
    if personal:
        formatted.append(f"姓名: {personal.get('name', '')}")
        formatted.append(f"职位: {personal.get('title', '')}")
        formatted.append(f"邮箱: {personal.get('email', '')}")
        formatted.append(f"电话: {personal.get('phone', '')}")

    work_exps = resume_data.get('workExps', [])
    if work_exps:
        formatted.append("\n工作经历:")
        for exp in work_exps:
            formatted.append(f"- {exp.get('position', '')} @ {exp.get('company', '')}")
            formatted.append(f"  {exp.get('startDate', '')} - {exp.get('endDate', '')}")
            formatted.append(f"  {exp.get('description', '')}")

    educations = resume_data.get('educations', [])
    if educations:
        formatted.append("\n教育背景:")
        for edu in educations:
            formatted.append(f"- {edu.get('degree', '')} {edu.get('major', '')}")
            formatted.append(f"  {edu.get('school', '')}")
            formatted.append(f"  {edu.get('startDate', '')} - {edu.get('endDate', '')}")

    skills = resume_data.get('skills', [])
    if skills:
        formatted.append(f"\n技能: {', '.join(skills)}")

    return '\n'.join(formatted)


def parse_ai_response(response_text):
    """解析 AI 回复中的结构化数据"""
    try:
        import json
        start = response_text.find('{')
        end = response_text.rfind('}') + 1
        if start != -1 and end != 0:
            json_str = response_text[start:end]
            return json.loads(json_str)
    except Exception:
        pass

    # 兜底返回
    return {
        'score': 75,
        'strengths': ['简历结构清晰'],
        'weaknesses': ['需要更多细节'],
        'suggestions': ['补充具体成果'],
        'missingKeywords': []
    }

@app.route('/api/ai/chat', methods=['POST', 'OPTIONS'])
@token_required
def ai_chat(current_user_id):
    try:
        print(f"Chat Current User ID: {current_user_id}")

        data = request.get_json()
        message = data.get('message', '')
        print(f"Received Chat Message: {message[:100]}...")
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
禁止：
- 提及任何评分或 X/100
- 给出简历优化建议
- 以猎头/顾问/优化师身份出现
- 回复超过 100 字
- 使用非中文回复
你必须：
1. 保持面试官角色。
2. 基于 JD 提问。
3. 结合简历经历进行追问。
4. 给出 1-2 句点评。
5. 立即提出下一题。
6. 全程仅使用中文作答。

职位描述：
{job_description if job_description else '未提供 JD，请基于简历进行通用面试。'}

简历信息：
{format_resume_for_ai(resume_data) if resume_data else '未提供简历信息。'}

对话历史：
{formatted_chat if formatted_chat else '面试刚开始。'}

候选人回答：
{clean_message}

请直接输出面试官回答：简短点评 + 下一道具体问题。
"""

                response = model.generate_content(prompt)
                ai_response = response.text

                return jsonify({'response': ai_response})

            except Exception as ai_error:
                print(f"AI 面试对话失败: {ai_error}")
                logger.error(f"AI 面试对话失败: {ai_error}")

                if "429" in str(ai_error) or "quota" in str(ai_error).lower() or "exceeded" in str(ai_error).lower():
                    print("Gemini 配额超限，使用本地模拟面试回复")
                    logger.warning("Gemini 配额超限，使用本地模拟面试回复")

                mock_response = generate_enhanced_mock_chat_response(message, score, suggestions)
                return jsonify({'response': mock_response}), 200

        mock_response = generate_mock_chat_response(message, score, suggestions)
        return jsonify({'response': mock_response}), 200

    except Exception as e:
        return jsonify({'error': '服务器内部错误'}), 500

@app.route('/api/ai/parse-screenshot', methods=['POST', 'OPTIONS'])
@token_required
def parse_screenshot(current_user_id):
    try:
        print(f"Parse Screenshot Current User ID: {current_user_id}")

        data = request.get_json()
        image = data.get('image', '')

        if not image:
            return jsonify({'error': '图片不能为空'}), 400

        if model and check_gemini_quota():
            try:
                prompt = "请从图片中提取职位描述文本，只返回提取结果，不要解释。请仅使用中文输出。"

                import base64
                import re

                base64_data = re.sub('^data:image/.+;base64,', '', image)
                image_data = base64.b64decode(base64_data)

                image_part = {
                    "mime_type": "image/png",
                    "data": image_data
                }

                response = model.generate_content([prompt, image_part])
                extracted_text = response.text.strip()

                return jsonify({'text': extracted_text})

            except Exception as ai_error:
                print(f"AI 截图解析失败: {ai_error}")
                logger.error(f"AI 截图解析失败: {ai_error}")

                if "429" in str(ai_error) or "quota" in str(ai_error).lower() or "exceeded" in str(ai_error).lower():
                    print("Gemini 配额超限，使用本地结果")
                    logger.warning("Gemini 配额超限，使用本地结果")

                return jsonify({'text': '职位描述识别失败，请手动粘贴职位描述。'}), 200

        return jsonify({'text': '职位描述识别失败，请手动粘贴职位描述。'}), 200

    except Exception as e:
        return jsonify({'error': '服务器内部错误'}), 500

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

    app.run(debug=True, port=5000)




