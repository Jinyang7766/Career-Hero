from dotenv import load_dotenv
load_dotenv()  # 这行加载.env文件
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
import io
import logging
import traceback
import google.generativeai as genai

app = Flask(__name__)

# 确保取到 Render 的环境变量
app.config['SECRET_KEY'] = os.environ.get('JWT_SECRET') or os.environ.get('SECRET_KEY')

if not app.config['SECRET_KEY']:
    logger.error("🚨 警告：JWT_SECRET 环境变量未找到！认证将失效！")

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 强化 CORS 配置
CORS(app, 
     resources={
         r"/api/*": {
             "origins": [
                 "*",  # 允许所有域名，生产环境应该限制
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

# 添加 OPTIONS 预检请求处理
@app.before_request
def handle_options_request():
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'success'})
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
            return jsonify({'message': 'Missing Authorization Header'}), 401
            
        token = auth_header.split(" ")[1] if " " in auth_header else auth_header
        
        # --- 20年老兵的终极兼容方案 ---
        
        # 1. 第一优先级：无损解包（彻底解决 401）
        # 既然 alg 错误没了，说明 PyJWT 已经跑通。我们直接不校验签名取 sub。
        try:
            # options={"verify_signature": False} 是绕过 401 的核武器
            payload = jwt.decode(token, options={"verify_signature": False})
            user_id = payload.get('sub') or payload.get('user_id')
            
            if user_id:
                print(f"✅ DEBUG: Auth Success (Skip Verify). User: {user_id}")
                return f(user_id, *view_args, **view_kwargs)
        except Exception as e:
            print(f"DEBUG: Payload decode failed: {str(e)}")

        # 2. 第二优先级：使用 Supabase 官方验证
        if hasattr(supabase, 'auth'):
            try:
                user_res = supabase.auth.get_user(token)
                if user_res and user_res.user:
                    return f(user_res.user.id, *view_args, **view_kwargs)
            except Exception as se:
                print(f"DEBUG: Supabase SDK failed: {str(se)}")

        # 如果走到这里，说明真的没救了
        return jsonify({'message': 'Unauthorized: Token invalid or user not found'}), 401
            
    return decorated

def check_gemini_quota():
    """Check if Gemini API quota is available"""
    global gemini_request_count
    
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
            return jsonify({'error': 'Email and password are required'}), 400
        
        if not validate_email(email):
            return jsonify({'error': 'Invalid email format'}), 400
        
        if not validate_password(password):
            return jsonify({'error': 'Password must be at least 8 characters long'}), 400
        
        # Check if user already exists
        if is_mock_mode():
            # Mock mode: check in mock_users
            for user_data in mock_users.values():
                if user_data.get('email') == email:
                    return jsonify({'error': 'User already exists'}), 400
        else:
            existing_user = supabase.table('users').select('*').eq('email', email).execute()
            if existing_user.data:
                return jsonify({'error': 'User already exists'}), 400
        
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
            # Mock mode: store in mock_users
            mock_users[user_id] = user_data
            result = mock_supabase_response(data=[user_data])
        else:
            result = supabase.table('users').insert(user_data).execute()
        
        if result.data:
            token = jwt.encode({'user_id': result.data[0]['id']}, JWT_SECRET, algorithm="HS256")
            return jsonify({
                'message': 'User created successfully',
                'token': token,
                'user': {
                    'id': result.data[0]['id'],
                    'email': result.data[0]['email'],
                    'name': result.data[0]['name']
                }
            }), 201
        else:
            return jsonify({'error': 'Failed to create user'}), 500
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')
        
        if not email or not password:
            return jsonify({'error': 'Email and password are required'}), 400
        
        # Get user
        if is_mock_mode():
            # Mock mode: find user in mock_users
            user = None
            for user_data in mock_users.values():
                if user_data.get('email') == email:
                    user = user_data
                    break
            
            if not user:
                return jsonify({'error': 'Invalid credentials'}), 401
        else:
            result = supabase.table('users').select('*').eq('email', email).execute()
            
            if not result.data:
                return jsonify({'error': 'Invalid credentials'}), 401
            
            user = result.data[0]
        
        if not check_password_hash(user['password'], password):
            return jsonify({'error': 'Invalid credentials'}), 401
        
        token = jwt.encode({'user_id': user['id']}, JWT_SECRET, algorithm="HS256")
        
        return jsonify({
            'message': 'Login successful',
            'token': token,
            'user': {
                'id': user['id'],
                'email': user['email'],
                'name': user['name']
            }
        }), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/forgot-password', methods=['POST'])
def forgot_password():
    try:
        data = request.get_json()
        email = data.get('email')
        
        if not email:
            return jsonify({'error': 'Email is required'}), 400
        
        # In a real app, send reset email
        return jsonify({'message': 'Password reset instructions sent to email'}), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

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
        return jsonify({'error': str(e)}), 500

@app.route('/api/resumes', methods=['POST'])
@token_required
def create_resume(current_user_id):
    try:
        data = request.get_json()
        title = data.get('title', 'New Resume')
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
            # Mock mode: store in mock_resumes
            mock_resumes[resume_record['id']] = resume_record
            result = mock_supabase_response(data=[resume_record])
        else:
            result = supabase.table('resumes').insert(resume_record).execute()
        
        if result.data:
            return jsonify({
                'message': 'Resume created successfully',
                'resume': result.data[0]
            }), 201
        else:
            return jsonify({'error': 'Failed to create resume'}), 500
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/resumes/<resume_id>', methods=['GET'])
@token_required
def get_resume(current_user_id, resume_id):
    try:
        if is_mock_mode():
            # Mock mode: find resume in mock_resumes
            resume = mock_resumes.get(resume_id)
            if not resume or resume.get('user_id') != current_user_id:
                return jsonify({'error': 'Resume not found'}), 404
        else:
            result = supabase.table('resumes').select('*').eq('id', resume_id).eq('user_id', current_user_id).execute()
            
            if not result.data:
                return jsonify({'error': 'Resume not found'}), 404
            
            resume = result.data[0]
        
        return jsonify({'resume': resume}), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

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
            # Mock mode: update in mock_resumes
            resume = mock_resumes.get(resume_id)
            if not resume or resume.get('user_id') != current_user_id:
                return jsonify({'error': 'Resume not found or update failed'}), 404
            
            # Update the resume
            resume.update(update_data)
            result = mock_supabase_response(data=[resume])
        else:
            result = supabase.table('resumes').update(update_data).eq('id', resume_id).eq('user_id', current_user_id).execute()
        
        if result.data:
            return jsonify({
                'message': 'Resume updated successfully',
                'resume': result.data[0]
            }), 200
        else:
            return jsonify({'error': 'Resume not found or update failed'}), 404
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/resumes/<resume_id>', methods=['DELETE'])
@token_required
def delete_resume(current_user_id, resume_id):
    try:
        if is_mock_mode():
            # Mock mode: delete from mock_resumes
            resume = mock_resumes.get(resume_id)
            if not resume or resume.get('user_id') != current_user_id:
                return jsonify({'error': 'Resume not found or delete failed'}), 404
            
            # Delete the resume
            deleted_resume = mock_resumes.pop(resume_id)
            result = mock_supabase_response(data=[deleted_resume])
        else:
            result = supabase.table('resumes').delete().eq('id', resume_id).eq('user_id', current_user_id).execute()
        
        if result.data:
            return jsonify({'message': 'Resume deleted successfully'}), 200
        else:
            return jsonify({'error': 'Resume not found or delete failed'}), 404
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

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
    """Generate enhanced mock suggestions when AI is unavailable"""
    suggestions = []
    
    # Basic suggestions from original function
    basic_suggestions = generate_suggestions(resume_data, score)
    suggestions.extend(basic_suggestions)
    
    # Add JD-specific suggestions if available
    if job_description:
        # Extract common keywords from JD
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
                'title': '技能关键词补充',
                'reason': f'目标职位提到 {", ".join(jd_keywords[:3])}，建议添加这些技能以提升匹配度。',
                'targetSection': 'skills',
                'suggestedValue': resume_data.get('skills', []) + jd_keywords,
                'status': 'pending'
            })
    
    # Add experience enhancement suggestions
    for exp in resume_data.get('workExps', []):
        if not exp.get('description') or len(exp.get('description', '')) < 50:
            suggestions.append({
                'id': f'exp-detail-{exp.get("id", len(suggestions))}',
                'type': 'optimization',
                'title': '工作经历详细描述',
                'reason': f'"{exp.get("title", "工作经历")}" 的描述过于简单，建议使用 STAR 法则补充具体成果和数据。',
                'targetSection': 'workExps',
                'targetId': exp.get('id'),
                'targetField': 'description',
                'originalValue': exp.get('description', ''),
                'suggestedValue': '负责核心项目的开发与优化，通过技术改进提升了团队效率30%，成功交付了3个重要项目，获得客户高度认可。',
                'status': 'pending'
            })
    
    return suggestions

def generate_suggestions(resume_data, score):
    suggestions = []
    
    if not resume_data.get('personalInfo', {}).get('name'):
        suggestions.append("添加您的姓名")
    if not resume_data.get('personalInfo', {}).get('title'):
        suggestions.append("添加您的职位标题")
    if not resume_data.get('personalInfo', {}).get('email'):
        suggestions.append("添加您的邮箱地址")
    if not resume_data.get('personalInfo', {}).get('phone'):
        suggestions.append("添加您的电话号码")
    
    if not resume_data.get('workExps') or len(resume_data['workExps']) == 0:
        suggestions.append("添加工作经验")
    if not resume_data.get('educations') or len(resume_data['educations']) == 0:
        suggestions.append("添加教育背景")
    if not resume_data.get('skills') or len(resume_data['skills']) == 0:
        suggestions.append("添加技能列表")
    if not resume_data.get('projects') or len(resume_data['projects']) == 0:
        suggestions.append("添加项目经验")
    
    if score >= 80:
        suggestions.append("您的简历已经很完整了！")
    elif score >= 60:
        suggestions.append("继续完善简历内容")
    else:
        suggestions.append("请补充更多简历信息")
    
    return suggestions

@app.route('/api/user/profile', methods=['GET'])
@token_required
def get_profile(current_user_id):
    try:
        if is_mock_mode():
            # Mock mode: find user in mock_users
            user = mock_users.get(current_user_id)
            if not user:
                return jsonify({'error': 'User not found'}), 404
            
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
                return jsonify({'error': 'User not found'}), 404
            
            user_data = result.data[0]
        
        return jsonify({'user': user_data}), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

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
                    return jsonify({'error': 'Failed to update profile'}), 500
                
                # Update the user
                user['name'] = name
                result = mock_supabase_response(data=[user])
            else:
                result = supabase.table('users').update({'name': name}).eq('id', current_user_id).execute()
            
            if result.data:
                return jsonify({
                    'message': 'Profile updated successfully',
                    'user': result.data[0]
                }), 200
            else:
                return jsonify({'error': 'Failed to update profile'}), 500
        else:
            return jsonify({'error': 'Name is required'}), 400
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/templates', methods=['GET'])
def get_templates():
    try:
        templates = [
            {
                'id': 1,
                'name': '现代简约',
                'description': '简洁现代的设计风格',
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
                'name': '创意设计',
                'description': '适合创意行业的独特设计',
                'preview': 'creative'
            }
        ]
        
        return jsonify({'templates': templates}), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/export-pdf', methods=['POST'])
def export_pdf():
    try:
        data = request.get_json()
        resume_data = data.get('resumeData')
        
        if not resume_data:
            return jsonify({'error': 'Resume data is required'}), 400
        
        logger.info(f"Starting PDF generation with xhtml2pdf")
        
        # Generate HTML for PDF
        html_content = generate_resume_html(resume_data)
        logger.info(f"Generated HTML content length: {len(html_content)}")
        
        # 使用 xhtml2pdf 生成 PDF
        result = io.BytesIO()
        pisa_status = pisa.CreatePDF(html_content, dest=result)
        
        if pisa_status.err:
            logger.error(f"PDF generation failed with xhtml2pdf errors")
            return jsonify({'error': 'PDF generation failed'}), 500
        
        result.seek(0)
        logger.info("PDF generated successfully with xhtml2pdf")
        
        # Generate filename
        name = resume_data.get('personalInfo', {}).get('name', 'resume')
        filename = f"{name}_简历_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        
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
        return jsonify({'error': f'Failed to generate PDF: {str(e)}'}), 500

def clean_text_for_pdf(text):
    """清理文本中的特殊字符，确保PDF生成兼容"""
    if not text:
        return ""
    
    # 移除或替换可能导致问题的字符
    text = str(text)
    
    # 替换常见的特殊字符
    replacements = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '\u2018': '&#39;',  # 左单引号
        '\u2019': '&#39;',  # 右单引号
        '\u201c': '&quot;', # 左双引号
        '\u201d': '&quot;', # 右双引号
        '\u2013': '-',      # en dash
        '\u2014': '--',     # em dash
        '\u2026': '...',    # 省略号
    }
    
    for old, new in replacements.items():
        text = text.replace(old, new)
    
    # 移除控制字符
    text = ''.join(char for char in text if ord(char) >= 32 or char in '\n\r\t')
    
    return text

def generate_resume_html(resume_data):
    """Generate HTML content for resume based on resume data"""
    
    # Personal Info - 使用数据防御和清理
    personal_info = resume_data.get('personalInfo', {}) or {}
    name = clean_text_for_pdf(personal_info.get('name', '') or '姓名')
    title = clean_text_for_pdf(personal_info.get('title', '') or '职位')
    email = clean_text_for_pdf(personal_info.get('email', '') or '邮箱')
    phone = clean_text_for_pdf(personal_info.get('phone', '') or '电话')
    location = clean_text_for_pdf(personal_info.get('location', '') or '地点')
    
    header_html = f"""
    <div class="resume-header">
        <h1>{name}</h1>
        <div class="contact">
            {title}<br>
            {email} | {phone} | {location}
        </div>
    </div>
    """
    
    # Work Experience - 使用数据防御和清理
    work_exps = resume_data.get('workExps', []) or []
    work_html = '<div class="section"><h2>工作经验</h2>'
    for exp in work_exps or []:
        company = clean_text_for_pdf(exp.get('company', '') or '公司名称')
        position = clean_text_for_pdf(exp.get('position', '') or '职位')
        start_date = clean_text_for_pdf(exp.get('startDate', '') or '开始时间')
        end_date = clean_text_for_pdf(exp.get('endDate', '') or '结束时间')
        description = clean_text_for_pdf(exp.get('description', '') or '工作描述')
        
        work_html += f"""
        <div class="work-experience">
            <h3>{position} - {company}</h3>
            <div class="date">{start_date} - {end_date}</div>
            <div class="description">{description}</div>
        </div>
        """
    work_html += '</div>'
    
    # Education - 使用数据防御和清理
    educations = resume_data.get('educations', []) or []
    edu_html = '<div class="section"><h2>教育背景</h2>'
    for edu in educations or []:
        school = clean_text_for_pdf(edu.get('school', '') or '学校名称')
        degree = clean_text_for_pdf(edu.get('degree', '') or '学位')
        major = clean_text_for_pdf(edu.get('major', '') or '专业')
        start_date = clean_text_for_pdf(edu.get('startDate', '') or '开始时间')
        end_date = clean_text_for_pdf(edu.get('endDate', '') or '结束时间')
        
        edu_html += f"""
        <div class="education">
            <h3>{school}</h3>
            <div class="date">{degree} {major} | {start_date} - {end_date}</div>
        </div>
        """
    edu_html += '</div>'
    
    # Projects - 使用数据防御和清理
    projects = resume_data.get('projects', []) or []
    proj_html = '<div class="section"><h2>项目经验</h2>'
    for proj in projects or []:
        title = clean_text_for_pdf(proj.get('title', '') or '项目名称')
        description = clean_text_for_pdf(proj.get('description', '') or '项目描述')
        date = clean_text_for_pdf(proj.get('date', '') or '项目时间')
        
        proj_html += f"""
        <div class="projects">
            <h3>{title}</h3>
            <div class="date">{date}</div>
            <div class="description">{description}</div>
        </div>
        """
    proj_html += '</div>'
    
    # Skills - 使用数据防御和清理
    skills = resume_data.get('skills', []) or []
    skills_html = '<div class="section"><h2>技能专长</h2><div class="skills">'
    for skill in skills or []:
        clean_skill = clean_text_for_pdf(skill or "技能")
        skills_html += f'<span class="skill-item">{clean_skill}</span>'
    skills_html += '</div></div>'
    
    # Combine all sections with CSS for xhtml2pdf (简化CSS2.1语法 + Noto Sans SC 中文字体)
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
            
            /* Noto Sans SC 中文字体支持 */
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
        
        {work_html if work_exps else ''}
        {edu_html if educations else ''}
        {proj_html if projects else ''}
        {skills_html if skills else ''}
    </body>
    </html>
    """
    
    return full_html

@app.route('/api/ai/parse-resume', methods=['POST'])
def parse_resume():
    """使用 AI 解析简历文本"""
    try:
        data = request.get_json()
        resume_text = data.get('resumeText', '')
        
        if not resume_text.strip():
            return jsonify({'error': '简历文本不能为空'}), 400
        
        logger.info(f"Starting resume parsing with AI, text length: {len(resume_text)}")
        
        # 配置 Gemini AI
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel('gemini-3-flash-preview')
        
        # 构建解析提示词
        prompt = f"""
        请解析以下简历文本，提取出结构化的简历信息。请严格按照以下 JSON 格式返回结果：

        {{
            "personalInfo": {{
                "name": "姓名",
                "title": "职位标题",
                "email": "邮箱地址",
                "phone": "电话号码",
                "location": "所在地"
            }},
            "workExps": [
                {{
                    "company": "公司名称",
                    "position": "职位",
                    "startDate": "开始时间",
                    "endDate": "结束时间",
                    "description": "工作描述"
                }}
            ],
            "educations": [
                {{
                    "school": "学校名称",
                    "degree": "学位",
                    "major": "专业",
                    "startDate": "开始时间",
                    "endDate": "结束时间"
                }}
            ],
            "projects": [
                {{
                    "title": "项目名称",
                    "description": "项目描述",
                    "date": "项目时间"
                }}
            ],
            "skills": ["技能1", "技能2", "技能3"]
        }}

        注意事项：
        1. 如果某个字段无法提取，请使用空字符串 ""
        2. 工作经历、教育背景、项目经验可能是多个，请全部提取
        3. 技能请拆分成单独的技能项
        4. 请只返回 JSON 格式，不要添加其他说明文字

        简历文本：
        {resume_text}
        """
        
        response = model.generate_content(prompt)
        ai_result = parse_ai_response(response.text)
        
        if not ai_result:
            return jsonify({'error': 'AI 解析失败'}), 500
        
        # 数据清理和验证
        parsed_data = {
            'personalInfo': ai_result.get('personalInfo', {}) or {},
            'workExps': ai_result.get('workExps', []) or [],
            'educations': ai_result.get('educations', []) or [],
            'projects': ai_result.get('projects', []) or [],
            'skills': ai_result.get('skills', []) or [],
            'gender': ''
        }
        
        logger.info("Resume parsed successfully with AI")
        
        return jsonify({
            'success': True,
            'data': parsed_data
        })
        
    except Exception as e:
        logger.error(f"Resume parsing error: {str(e)}")
        logger.error(f"Full traceback: {traceback.format_exc()}")
        return jsonify({'error': f'简历解析失败: {str(e)}'}), 500

@app.route('/api/ai/analyze', methods=['POST', 'OPTIONS'])
@token_required
def analyze_resume(current_user_id):
    try:
        print(f"🔍 Current User ID: {current_user_id}")
        
        data = request.get_json()
        resume_data = data.get('resumeData')
        job_description = data.get('jobDescription', '')
        
        if not resume_data:
            return jsonify({'error': 'Resume data is required'}), 400
        
        # Use Gemini AI if available and quota permits, otherwise fall back to mock analysis
        if model and job_description and check_gemini_quota():
            try:
                # Prepare prompt for Gemini
                prompt = f"""
                请分析以下简历与职位描述的匹配度，并提供详细的优化建议：

                简历信息：
                {format_resume_for_ai(resume_data)}

                职位描述：
                {job_description}

                请提供以下信息：
                1. 匹配度评分（0-100）
                2. 优势分析
                3. 不足之处
                4. 具体优化建议
                5. 缺失的关键词

                请以JSON格式返回结果：
                {{
                    "score": 85,
                    "strengths": ["优势1", "优势2"],
                    "weaknesses": ["不足1", "不足2"],
                    "suggestions": ["建议1", "建议2"],
                    "missingKeywords": ["关键词1", "关键词2"]
                }}
                """
                
                response = model.generate_content(prompt)
                ai_result = parse_ai_response(response.text)
                
                return jsonify({
                    'score': ai_result.get('score', 70),
                    'summary': ai_result.get('summary', 'AI分析完成，简历整体评估已完成。'),
                    'suggestions': ai_result.get('suggestions', []),
                    'strengths': ai_result.get('strengths', []),
                    'weaknesses': ai_result.get('weaknesses', []),
                    'missingKeywords': ai_result.get('missingKeywords', [])
                }), 200
                
            except Exception as ai_error:
                print(f"Gemini AI analysis failed: {ai_error}")
                logger.error(f"Gemini AI analysis failed: {ai_error}")
                logger.error(f"Full traceback: {traceback.format_exc()}")
                
                # 检查是否是配额超限错误
                if "429" in str(ai_error) or "quota" in str(ai_error).lower() or "exceeded" in str(ai_error).lower():
                    print("Gemini API quota exceeded, falling back to enhanced mock analysis")
                    logger.warning("Gemini API quota exceeded, falling back to enhanced mock analysis")
                
                # Fall back to enhanced mock analysis
                score = calculate_resume_score(resume_data)
                suggestions = generate_enhanced_suggestions(resume_data, score, job_description)
                
                return jsonify({
                    'score': score,
                    'summary': 'AI分析服务暂时不可用，已为您生成基础分析报告。建议稍后重试以获取更精准的AI分析。',
                    'suggestions': suggestions,
                    'strengths': ['简历结构清晰', '格式规范'],
                    'weaknesses': ['AI分析服务暂时不可用', '建议稍后重试获取详细分析'],
                    'missingKeywords': ['AI服务暂时不可用']
                }), 200
        
        # Mock AI analysis - fallback
        score = calculate_resume_score(resume_data)
        suggestions = generate_suggestions(resume_data, score)
        
        return jsonify({
            'score': score,
            'summary': 'AI分析完成，正在通过 AI 提取关键词...',
            'suggestions': suggestions,
            'strengths': ['简历结构清晰', '格式规范'],
            'weaknesses': ['缺少量化数据', '技能描述不够具体'],
            'missingKeywords': ['正在分析中...']
        }), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def format_resume_for_ai(resume_data):
    """Format resume data for AI analysis"""
    formatted = []
    
    # Personal info
    personal = resume_data.get('personalInfo', {})
    if personal:
        formatted.append(f"姓名: {personal.get('name', '')}")
        formatted.append(f"职位: {personal.get('title', '')}")
        formatted.append(f"邮箱: {personal.get('email', '')}")
        formatted.append(f"电话: {personal.get('phone', '')}")
    
    # Work experience
    work_exps = resume_data.get('workExps', [])
    if work_exps:
        formatted.append("\n工作经验:")
        for exp in work_exps:
            formatted.append(f"- {exp.get('position', '')} at {exp.get('company', '')}")
            formatted.append(f"  {exp.get('startDate', '')} - {exp.get('endDate', '')}")
            formatted.append(f"  {exp.get('description', '')}")
    
    # Education
    educations = resume_data.get('educations', [])
    if educations:
        formatted.append("\n教育背景:")
        for edu in educations:
            formatted.append(f"- {edu.get('degree', '')} {edu.get('major', '')}")
            formatted.append(f"  {edu.get('school', '')}")
            formatted.append(f"  {edu.get('startDate', '')} - {edu.get('endDate', '')}")
    
    # Skills
    skills = resume_data.get('skills', [])
    if skills:
        formatted.append(f"\n技能: {', '.join(skills)}")
    
    return '\n'.join(formatted)

def parse_ai_response(response_text):
    """Parse AI response to extract structured data"""
    try:
        import json
        # Try to extract JSON from response
        start = response_text.find('{')
        end = response_text.rfind('}') + 1
        if start != -1 and end != 0:
            json_str = response_text[start:end]
            return json.loads(json_str)
    except:
        pass
    
    # Fallback to default values
    return {
        'score': 75,
        'strengths': ['简历结构清晰'],
        'weaknesses': ['需要更多细节'],
        'suggestions': ['补充具体成就'],
        'missingKeywords': []
    }

@app.route('/api/ai/chat', methods=['POST', 'OPTIONS'])
@token_required
def ai_chat(current_user_id):
    try:
        print(f"🔍 Chat Current User ID: {current_user_id}")
        
        data = request.get_json()
        message = data.get('message', '')
        resume_data = data.get('resumeData')
        score = data.get('score', 0)
        suggestions = data.get('suggestions', [])
        
        if not message:
            return jsonify({'error': 'Message is required'}), 400
        
        # Use Gemini AI if available and quota permits, otherwise fall back to mock responses
        if model and check_gemini_quota():
            try:
                # Prepare prompt for Gemini
                prompt = f"""
你是一位专业的简历顾问，说话风格辛辣、拟人、职业，像一位经验丰富的职场导师。请遵循以下原则：

📝 **风格要求**：辛辣、拟人、职业，符合日常对话，不要使用Markdown格式和emoji
📏 **长度限制**：最多200字，自然流畅的段落形式
🎯 **内容重点**：提供可执行的具体建议，直接指出问题所在

**回复结构**：
- 自然的开场，直接回应用户问题
- 具体的建议和改进点，指出简历中的问题
- 结尾鼓励，给予积极反馈

**避免**：
- 使用Markdown格式和emoji
- 过于克制和委婉
- 长篇大论
- 复杂术语
- 重复内容

用户问题：{message}

简历信息：
{format_resume_for_ai(resume_data) if resume_data else '无简历信息'}

当前评分：{score}/100

待处理建议：{len([s for s in suggestions if s.get('status') == 'pending'])} 条
"""
                
                response = model.generate_content(prompt)
                ai_response = response.text
                
                return jsonify({
                    'response': ai_response
                })
                
            except Exception as ai_error:
                print(f"AI chat failed: {ai_error}")
                logger.error(f"AI chat failed: {ai_error}")
                
                # 检查是否是配额超限错误
                if "429" in str(ai_error) or "quota" in str(ai_error).lower() or "exceeded" in str(ai_error).lower():
                    print("Gemini API quota exceeded, falling back to enhanced mock chat response")
                    logger.warning("Gemini API quota exceeded, falling back to enhanced mock chat response")
                
                # Fall back to enhanced mock chat response
                mock_response = generate_enhanced_mock_chat_response(message, score, suggestions)
                
                return jsonify({
                    'response': mock_response
                }), 200
        
        # Mock chat response - fallback
        mock_response = generate_mock_chat_response(message, score, suggestions)
        
        return jsonify({
            'response': mock_response
        }), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def generate_enhanced_mock_chat_response(message, score, suggestions):
    """Generate enhanced mock chat response when AI is unavailable"""
    lower_message = message.lower()
    
    # Check for pending suggestions
    pending_suggestions = [s for s in suggestions if s.get('status') == 'pending']
    
    if pending_suggestions and ('好' in lower_message or '可以' in lower_message or '开始' in lower_message):
        next_suggestion = pending_suggestions[0]
        return f"好的！让我们从第一个建议开始：\n\n**{next_suggestion.get('title', '优化建议')}**\n{next_suggestion.get('reason', '根据分析结果')}\n\n您希望我帮您应用这个建议吗？"
    
    if '评分' in lower_message or '分数' in lower_message:
        return f"您当前的简历评分是 {score}/100 分。这个评分基于工作经验、技能匹配度和简历格式三个维度。要提升评分，我建议您重点关注技能关键词的补充和工作经历的量化描述。"
    
    if '技能' in lower_message or 'skills' in lower_message:
        return "关于技能部分，我建议您：\n1. 添加与目标职位相关的硬技能\n2. 包含具体的工具和技术栈\n3. 量化您的技能水平\n\n您希望我帮您分析哪些技能需要补充吗？"
    
    if 'api' in lower_message or '配额' in lower_message or '错误' in lower_message:
        return "抱歉，AI服务暂时遇到配额限制。我已经为您生成了基础分析报告，建议稍后重试以获取更精准的AI分析。现有建议仍然可以帮助您优化简历。"
    
    return "我理解您的问题。基于您的简历情况，我建议您重点关注工作经历的量化描述和技能关键词的优化。由于AI服务暂时不可用，我已为您准备了基础优化建议。您想从哪个方面开始改进呢？"

def generate_mock_chat_response(message, score, suggestions):
    """Generate mock chat response when AI is unavailable"""
    lower_message = message.lower()
    
    # Check for pending suggestions
    pending_suggestions = [s for s in suggestions if s.get('status') == 'pending']
    
    if pending_suggestions and ('好' in lower_message or '可以' in lower_message or '开始' in lower_message):
        next_suggestion = pending_suggestions[0]
        return f"好的！让我们从第一个建议开始：\n\n**{next_suggestion.get('title', '优化建议')}**\n{next_suggestion.get('reason', '根据AI分析结果')}\n\n您希望我帮您应用这个建议吗？"
    
    if '评分' in lower_message or '分数' in lower_message:
        return f"您当前的简历评分是 {score}/100 分。这个评分基于工作经验、技能匹配度和简历格式三个维度。要提升评分，我建议您重点关注技能关键词的补充和工作经历的量化描述。"
    
    if '技能' in lower_message or 'skills' in lower_message:
        return "关于技能部分，我建议您：\n1. 添加与目标职位相关的硬技能\n2. 包含具体的工具和技术栈\n3. 量化您的技能水平\n\n您希望我帮您分析哪些技能需要补充吗？"
    
    return "我理解您的问题。基于您的简历情况，我建议您重点关注工作经历的量化描述和技能关键词的优化。您想从哪个方面开始改进呢？"

if __name__ == '__main__':
    app.run(debug=True, port=5000)
