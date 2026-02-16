import uuid
from datetime import datetime, timedelta


def _ensure_mock_user(mock_users, current_user_id):
    user = mock_users.get(current_user_id)
    if user:
        return user
    user = {
        'id': current_user_id,
        'email': 'mock_user@example.com',
        'name': 'Mock User',
        'deletion_pending_until': None,
    }
    mock_users[current_user_id] = user
    return user


def register_user(data, deps):
    email = data.get('email')
    password = data.get('password')
    name = data.get('name', '')

    if not email or not password:
        return {'error': '邮箱和密码为必填项'}, 400
    if not deps['validate_email'](email):
        return {'error': '邮箱格式不正确'}, 400
    if not deps['validate_password'](password):
        return {'error': '密码长度至少 8 位'}, 400

    if deps['is_mock_mode']():
        for user_data in deps['mock_users'].values():
            if user_data.get('email') == email:
                return {'error': '用户已存在'}, 400
    else:
        existing_user = deps['supabase'].table('users').select('*').eq('email', email).execute()
        if existing_user.data:
            return {'error': '用户已存在'}, 400

    hashed_password = deps['generate_password_hash'](password)
    user_id = str(uuid.uuid4())
    user_data = {
        'id': user_id,
        'email': email,
        'password': hashed_password,
        'name': name,
        'created_at': datetime.utcnow().isoformat(),
    }
    if deps['is_mock_mode']():
        deps['mock_users'][user_id] = user_data
        result = deps['mock_supabase_response'](data=[user_data])
    else:
        result = deps['supabase'].table('users').insert(user_data).execute()

    if not result.data:
        return {'error': '创建用户失败'}, 500
    if not deps['JWT_SECRET']:
        return {'error': 'JWT_SECRET 未配置'}, 500

    token = deps['jwt'].encode({'user_id': result.data[0]['id']}, deps['JWT_SECRET'], algorithm="HS256")
    return {
        'message': '注册成功',
        'token': token,
        'user': {
            'id': result.data[0]['id'],
            'email': result.data[0]['email'],
            'name': result.data[0]['name'],
        }
    }, 201


def login_user(data, deps):
    email = data.get('email')
    password = data.get('password')
    if not email or not password:
        return {'error': '邮箱和密码为必填项'}, 400

    if deps['is_mock_mode']():
        user = None
        for user_data in deps['mock_users'].values():
            if user_data.get('email') == email:
                user = user_data
                break
        if not user:
            return {'error': '账号或密码错误'}, 401
    else:
        result = deps['supabase'].table('users').select('*').eq('email', email).execute()
        if not result.data:
            return {'error': '账号或密码错误'}, 401
        user = result.data[0]

    if not deps['check_password_hash'](user['password'], password):
        return {'error': '账号或密码错误'}, 401
    if not deps['JWT_SECRET']:
        return {'error': 'JWT_SECRET 未配置'}, 500

    token = deps['jwt'].encode({'user_id': user['id']}, deps['JWT_SECRET'], algorithm="HS256")
    return {
        'message': '登录成功',
        'token': token,
        'user': {
            'id': user['id'],
            'email': user['email'],
            'name': user['name'],
            'deletion_pending_until': user.get('deletion_pending_until'),
        }
    }, 200


def forgot_password(data):
    email = data.get('email')
    if not email:
        return {'error': '邮箱为必填项'}, 400
    return {'message': '重置密码说明已发送至邮箱'}, 200


def get_profile(current_user_id, deps):
    if deps['is_mock_mode']():
        user = _ensure_mock_user(deps['mock_users'], current_user_id)
        return {
            'id': user.get('id'),
            'email': user.get('email'),
            'name': user.get('name'),
            'deletion_pending_until': user.get('deletion_pending_until')
        }, 200

    try:
        result = deps['supabase'].table('users').select('id,email,name,deletion_pending_until').eq('id', current_user_id).execute()
    except Exception as col_err:
        if deps['_is_missing_deletion_column_error'](col_err):
            result = deps['supabase'].table('users').select('id,email,name').eq('id', current_user_id).execute()
            if result.data:
                row = dict(result.data[0] or {})
                row['deletion_pending_until'] = None
                return row, 200
            return {'error': '用户不存在'}, 404
        raise

    if not result.data:
        return {'error': '用户不存在'}, 404
    return result.data[0], 200


def request_deletion(current_user_id, deps):
    deletion_until = (datetime.utcnow() + timedelta(days=3)).isoformat()
    if deps['is_mock_mode']():
        user = _ensure_mock_user(deps['mock_users'], current_user_id)
        user['deletion_pending_until'] = deletion_until
        result = deps['mock_supabase_response'](data=[user])
    else:
        update_payload = {'deletion_pending_until': deletion_until, 'updated_at': datetime.utcnow().isoformat()}
        result = deps['supabase'].table('users').update(update_payload).eq('id', current_user_id).execute()
        if not result.data:
            result = deps['supabase'].table('users').upsert({'id': current_user_id, **update_payload}, on_conflict='id').execute()

    if result.data:
        return {'message': '已申请注销，账号将在3天后清除', 'deletion_pending_until': deletion_until}, 200
    return {'error': '操作失败'}, 500


def cancel_deletion(current_user_id, deps):
    if deps['is_mock_mode']():
        user = _ensure_mock_user(deps['mock_users'], current_user_id)
        user['deletion_pending_until'] = None
        result = deps['mock_supabase_response'](data=[user])
    else:
        update_payload = {'deletion_pending_until': None, 'updated_at': datetime.utcnow().isoformat()}
        result = deps['supabase'].table('users').update(update_payload).eq('id', current_user_id).execute()
        if not result.data:
            result = deps['supabase'].table('users').upsert({'id': current_user_id, **update_payload}, on_conflict='id').execute()

    if result.data:
        return {'message': '已撤销注销申请'}, 200
    return {'error': '操作失败'}, 500


def delete_account_immediate(current_user_id, deps):
    deps['_delete_user_everywhere'](current_user_id, delete_auth=True)
    return {'message': '账号已立即永久注销'}, 200


def update_profile(current_user_id, data, deps):
    name = data.get('name')
    if not name:
        return {'error': '姓名为必填项'}, 400

    if deps['is_mock_mode']():
        user = deps['mock_users'].get(current_user_id)
        if not user:
            return {'error': '更新个人信息失败'}, 500
        user['name'] = name
        result = deps['mock_supabase_response'](data=[user])
    else:
        result = deps['supabase'].table('users').update({'name': name}).eq('id', current_user_id).execute()

    if result.data:
        return {'message': '个人信息更新成功', 'user': result.data[0]}, 200
    return {'error': '更新个人信息失败'}, 500


def get_templates():
    templates = [
        {'id': 1, 'name': '现代简约', 'description': '清爽现代的排版风格', 'preview': 'modern'},
        {'id': 2, 'name': '专业经典', 'description': '传统专业的简历模板', 'preview': 'classic'},
        {'id': 3, 'name': '极简风格', 'description': '注重内容的极简设计', 'preview': 'minimal'},
    ]
    return {'templates': templates}, 200


def submit_feedback(current_user_id, data, deps):
    description = (data.get('description') or '').strip()
    images = data.get('images') or []
    if not description:
        return {'error': '问题描述不能为空'}, 400

    record = {
        'id': str(uuid.uuid4()),
        'user_id': current_user_id,
        'description': description,
        'images': images,
        'created_at': datetime.utcnow().isoformat(),
    }
    if deps['is_mock_mode']():
        deps['mock_feedback'].append(record)
        result = deps['mock_supabase_response'](data=[record])
    else:
        result = deps['supabase'].table('feedback').insert(record).execute()

    if result.data:
        return {'message': '反馈已提交', 'feedback': result.data[0]}, 201
    return {'error': '提交失败'}, 500
