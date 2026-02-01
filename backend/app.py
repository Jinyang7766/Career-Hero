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
import weasyprint
from weasyprint import HTML, CSS
import google.generativeai as genai
from io import BytesIO
import logging
import traceback

app = Flask(__name__)

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

# Mock data storage for development
mock_users = {}
mock_resumes = {}

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            token = request.headers['Authorization'].split(" ")[1]
        
        if not token:
            return jsonify({'message': 'Token is missing!'}), 401
        
        try:
            data = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            current_user_id = data['user_id']
        except:
            return jsonify({'message': 'Token is invalid!'}), 401
        
        return f(current_user_id, *args, **kwargs)
    
    return decorated

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
        existing_user = supabase.table('users').select('*').eq('email', email).execute()
        if existing_user.data:
            return jsonify({'error': 'User already exists'}), 400
        
        # Create user
        hashed_password = generate_password_hash(password)
        user_data = {
            'id': str(uuid.uuid4()),
            'email': email,
            'password': hashed_password,
            'name': name,
            'created_at': datetime.utcnow().isoformat()
        }
        
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
        result = supabase.table('resumes').select('*').eq('user_id', current_user_id).order('created_at', desc=True).execute()
        
        resumes = []
        for resume in result.data:
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
        result = supabase.table('resumes').select('*').eq('id', resume_id).eq('user_id', current_user_id).execute()
        
        if not result.data:
            return jsonify({'error': 'Resume not found'}), 404
        
        return jsonify({'resume': result.data[0]}), 200
    
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
        result = supabase.table('users').select('id, email, name, created_at').eq('id', current_user_id).execute()
        
        if not result.data:
            return jsonify({'error': 'User not found'}), 404
        
        return jsonify({'user': result.data[0]}), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/user/profile', methods=['PUT'])
@token_required
def update_profile(current_user_id):
    try:
        data = request.get_json()
        name = data.get('name')
        
        if name:
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
        
        logger.info(f"Starting PDF generation")
        
        # 首先尝试简单的测试 PDF
        try:
            simple_html = "<h1>Hello World - PDF Test</h1><p>This is a test PDF to verify WeasyPrint is working.</p>"
            simple_css = "body { font-family: Arial; padding: 20px; }"
            
            html_doc = HTML(string=simple_html)
            css_doc = CSS(string=simple_css)
            
            pdf_buffer = BytesIO()
            html_doc.write_pdf(pdf_buffer, stylesheets=[css_doc])
            pdf_buffer.seek(0)
            
            logger.info("Simple test PDF generated successfully")
            
            return send_file(
                pdf_buffer,
                as_attachment=True,
                download_name="test.pdf",
                mimetype='application/pdf'
            )
            
        except Exception as test_error:
            logger.error(f"Simple PDF test failed: {str(test_error)}")
            logger.error(f"Test error traceback: {traceback.format_exc()}")
            
            # 如果简单测试失败，继续尝试完整简历
            logger.info("Attempting full resume PDF generation...")
        
        # Generate HTML for PDF
        html_content = generate_resume_html(resume_data)
        logger.info(f"Generated HTML content length: {len(html_content)}")
        
        # Create CSS for A4 styling
        css_content = """
        @page {
            size: A4;
            margin: 2cm;
        }
        
        body {
            font-family: 'Arial', sans-serif;
            font-size: 12px;
            line-height: 1.4;
            color: #333;
            margin: 0;
            padding: 0;
        }
        
        .resume-header {
            text-align: center;
            border-bottom: 2px solid #333;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        
        .resume-header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: bold;
        }
        
        .resume-header .contact {
            margin: 10px 0;
            font-size: 14px;
        }
        
        .section {
            margin-bottom: 25px;
        }
        
        .section h2 {
            font-size: 16px;
            font-weight: bold;
            border-bottom: 1px solid #ccc;
            padding-bottom: 5px;
            margin-bottom: 15px;
            color: #333;
        }
        
        .work-experience, .education, .projects {
            margin-bottom: 15px;
        }
        
        .work-experience h3, .education h3, .projects h3 {
            font-size: 14px;
            font-weight: bold;
            margin: 0 0 5px 0;
        }
        
        .work-experience .date, .education .date, .projects .date {
            font-size: 12px;
            color: #666;
            font-style: italic;
            margin-bottom: 5px;
        }
        
        .work-experience .description, .education .description, .projects .description {
            font-size: 12px;
            margin: 0;
            line-height: 1.4;
        }
        
        .skills {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
        }
        
        .skill-item {
            background-color: #f5f5f5;
            padding: 3px 8px;
            border-radius: 3px;
            font-size: 11px;
        }
        
        ul {
            margin: 5px 0;
            padding-left: 20px;
        }
        
        li {
            margin-bottom: 3px;
            font-size: 12px;
        }
        """
        
        logger.info("Creating WeasyPrint document...")
        # Generate PDF
        html_doc = HTML(string=html_content)
        css_doc = CSS(string=css_content)
        
        pdf_buffer = BytesIO()
        html_doc.write_pdf(pdf_buffer, stylesheets=[css_doc])
        pdf_buffer.seek(0)
        
        logger.info("PDF generated successfully")
        
        # Generate filename
        name = resume_data.get('personalInfo', {}).get('name', 'resume')
        filename = f"{name}_简历_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        
        return send_file(
            pdf_buffer,
            as_attachment=True,
            download_name=filename,
            mimetype='application/pdf'
        )
        
    except Exception as e:
        logger.error(f"PDF generation error: {str(e)}")
        logger.error(f"Full traceback: {traceback.format_exc()}")
        logger.error(f"Resume data received: {data}")
        return jsonify({'error': f'Failed to generate PDF: {str(e)}'}), 500

def generate_resume_html(resume_data):
    """Generate HTML content for resume based on resume data"""
    
    # Personal Info - 使用数据防御
    personal_info = resume_data.get('personalInfo', {}) or {}
    name = personal_info.get('name', '') or '姓名'
    title = personal_info.get('title', '') or '职位'
    email = personal_info.get('email', '') or '邮箱'
    phone = personal_info.get('phone', '') or '电话'
    location = personal_info.get('location', '') or '地点'
    
    header_html = f"""
    <div class="resume-header">
        <h1>{name}</h1>
        <div class="contact">
            {title}<br>
            {email} | {phone} | {location}
        </div>
    </div>
    """
    
    # Work Experience - 使用数据防御
    work_exps = resume_data.get('workExps', []) or []
    work_html = '<div class="section"><h2>工作经验</h2>'
    for exp in work_exps or []:
        company = exp.get('company', '') or '公司名称'
        position = exp.get('position', '') or '职位'
        start_date = exp.get('startDate', '') or '开始时间'
        end_date = exp.get('endDate', '') or '结束时间'
        description = exp.get('description', '') or '工作描述'
        
        work_html += f"""
        <div class="work-experience">
            <h3>{position} - {company}</h3>
            <div class="date">{start_date} - {end_date}</div>
            <div class="description">{description}</div>
        </div>
        """
    work_html += '</div>'
    
    # Education - 使用数据防御
    educations = resume_data.get('educations', []) or []
    edu_html = '<div class="section"><h2>教育背景</h2>'
    for edu in educations or []:
        school = edu.get('school', '') or '学校名称'
        degree = edu.get('degree', '') or '学位'
        major = edu.get('major', '') or '专业'
        start_date = edu.get('startDate', '') or '开始时间'
        end_date = edu.get('endDate', '') or '结束时间'
        
        edu_html += f"""
        <div class="education">
            <h3>{school}</h3>
            <div class="date">{degree} {major} | {start_date} - {end_date}</div>
        </div>
        """
    edu_html += '</div>'
    
    # Projects - 使用数据防御
    projects = resume_data.get('projects', []) or []
    proj_html = '<div class="section"><h2>项目经验</h2>'
    for proj in projects or []:
        title = proj.get('title', '') or '项目名称'
        description = proj.get('description', '') or '项目描述'
        date = proj.get('date', '') or '项目时间'
        
        proj_html += f"""
        <div class="projects">
            <h3>{title}</h3>
            <div class="date">{date}</div>
            <div class="description">{description}</div>
        </div>
        """
    proj_html += '</div>'
    
    # Skills - 使用数据防御
    skills = resume_data.get('skills', []) or []
    skills_html = '<div class="section"><h2>技能专长</h2><div class="skills">'
    for skill in skills or []:
        skills_html += f'<span class="skill-item">{skill or "技能"}</span>'
    skills_html += '</div></div>'
    
    # Combine all sections
    full_html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>{name} - 简历</title>
    </head>
    <body>
        {header_html}
        {work_html if work_exps else ''}
        {edu_html if educations else ''}
        {proj_html if projects else ''}
        {skills_html if skills else ''}
    </body>
    </html>
    """
    
    return full_html

@app.route('/api/ai/analyze', methods=['POST'])
@token_required
def analyze_resume(current_user_id):
    try:
        data = request.get_json()
        resume_data = data.get('resumeData')
        job_description = data.get('jobDescription', '')
        
        if not resume_data:
            return jsonify({'error': 'Resume data is required'}), 400
        
        # Use Gemini AI if available, otherwise fall back to mock analysis
        if model and job_description:
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
                    'suggestions': ai_result.get('suggestions', []),
                    'strengths': ai_result.get('strengths', []),
                    'weaknesses': ai_result.get('weaknesses', []),
                    'missingKeywords': ai_result.get('missingKeywords', [])
                }), 200
                
            except Exception as ai_error:
                print(f"AI analysis failed: {ai_error}")
                # Fall back to mock analysis
        
        # Mock AI analysis - fallback
        score = calculate_resume_score(resume_data)
        suggestions = generate_suggestions(resume_data, score)
        
        return jsonify({
            'score': score,
            'suggestions': suggestions
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

if __name__ == '__main__':
    app.run(debug=True, port=5000)
