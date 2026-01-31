from dotenv import load_dotenv
load_dotenv()  # 这行加载.env文件
from flask import Flask, request, jsonify
from flask_cors import CORS
from supabase import create_client, Client
import os
import uuid
from datetime import datetime
from functools import wraps
import jwt
from werkzeug.security import generate_password_hash, check_password_hash
import re

app = Flask(__name__)
CORS(app)

# Supabase configuration
SUPABASE_URL = os.getenv('SUPABASE_URL', 'your-supabase-url')
SUPABASE_KEY = os.getenv('SUPABASE_KEY', 'your-supabase-key')
JWT_SECRET = os.getenv('JWT_SECRET', 'your-jwt-secret')

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

@app.route('/api/ai/analyze', methods=['POST'])
@token_required
def analyze_resume(current_user_id):
    try:
        data = request.get_json()
        resume_data = data.get('resumeData')
        
        if not resume_data:
            return jsonify({'error': 'Resume data is required'}), 400
        
        # Mock AI analysis - in real app, integrate with AI service
        score = calculate_resume_score(resume_data)
        suggestions = generate_suggestions(resume_data, score)
        
        return jsonify({
            'score': score,
            'suggestions': suggestions
        }), 200
    
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

if __name__ == '__main__':
    app.run(debug=True, port=5000)
