import uuid
from datetime import datetime, timedelta


def _ensure_mock_user(storage_context, current_user_id):
    user = storage_context.get_user_by_id(current_user_id)
    if user:
        return user
    user = {
        'id': current_user_id,
        'email': 'mock_user@example.com',
        'name': 'Mock User',
        'deletion_pending_until': None,
    }
    storage_context.insert_user(user)
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

    existing_users = deps['storage_context'].list_users_by_email(email)
    if existing_users:
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

    created = deps['storage_context'].insert_user(user_data)
    if not created:
        return {'error': '创建用户失败'}, 500
    if not deps['JWT_SECRET']:
        return {'error': 'JWT_SECRET 未配置'}, 500

    token = deps['jwt'].encode({'user_id': created['id']}, deps['JWT_SECRET'], algorithm='HS256')
    return {
        'message': '注册成功',
        'token': token,
        'user': {
            'id': created['id'],
            'email': created['email'],
            'name': created['name'],
        }
    }, 201


def login_user(data, deps):
    email = data.get('email')
    password = data.get('password')
    if not email or not password:
        return {'error': '邮箱和密码为必填项'}, 400

    users = deps['storage_context'].list_users_by_email(email)
    if not users:
        return {'error': '账号或密码错误'}, 401
    user = users[0]

    if not deps['check_password_hash'](user['password'], password):
        return {'error': '账号或密码错误'}, 401
    if not deps['JWT_SECRET']:
        return {'error': 'JWT_SECRET 未配置'}, 500

    token = deps['jwt'].encode({'user_id': user['id']}, deps['JWT_SECRET'], algorithm='HS256')
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
    storage_context = deps['storage_context']
    if storage_context.is_mock_mode():
        user = _ensure_mock_user(storage_context, current_user_id)
        return {
            'id': user.get('id'),
            'email': user.get('email'),
            'name': user.get('name'),
            'phone': user.get('phone'),
            'deletion_pending_until': user.get('deletion_pending_until')
        }, 200

    try:
        row = storage_context.get_user_by_id(current_user_id, fields='id,email,name,phone,deletion_pending_until')
    except Exception as col_err:
        if deps['_is_missing_deletion_column_error'](col_err):
            row = storage_context.get_user_by_id(current_user_id, fields='id,email,name')
            if row:
                row = dict(row)
                row['deletion_pending_until'] = None
                return row, 200
            return {'error': '用户不存在'}, 404
        raise

    if not row:
        return {'error': '用户不存在'}, 404
    return row, 200


def request_deletion(current_user_id, deps):
    storage_context = deps['storage_context']
    deletion_until = (datetime.utcnow() + timedelta(days=3)).isoformat()
    update_payload = {'deletion_pending_until': deletion_until, 'updated_at': datetime.utcnow().isoformat()}

    updated = storage_context.update_user(current_user_id, update_payload)
    if not updated:
        updated = storage_context.upsert_user({'id': current_user_id, **update_payload}, on_conflict='id')

    if updated:
        return {'message': '已申请注销，账号将在3天后清除', 'deletion_pending_until': deletion_until}, 200
    return {'error': '操作失败'}, 500


def cancel_deletion(current_user_id, deps):
    storage_context = deps['storage_context']
    update_payload = {'deletion_pending_until': None, 'updated_at': datetime.utcnow().isoformat()}

    updated = storage_context.update_user(current_user_id, update_payload)
    if not updated:
        updated = storage_context.upsert_user({'id': current_user_id, **update_payload}, on_conflict='id')

    if updated:
        return {'message': '已撤销注销申请'}, 200
    return {'error': '操作失败'}, 500


def delete_account_immediate(current_user_id, deps):
    deps['_delete_user_everywhere'](current_user_id, delete_auth=True)
    return {'message': '账号已立即永久注销'}, 200


def update_profile(current_user_id, data, deps):
    name = data.get('name')
    phone = data.get('phone')

    updates = {}
    if name is not None:
        cleaned_name = str(name).strip()
        if not cleaned_name:
            return {'error': '姓名不能为空'}, 400
        updates['name'] = cleaned_name

    if phone is not None:
        cleaned_phone = str(phone).strip().replace(' ', '')
        if cleaned_phone:
            if len(cleaned_phone) > 24:
                return {'error': '手机号长度超出限制'}, 400
            updates['phone'] = cleaned_phone
        else:
            updates['phone'] = None

    if not updates:
        return {'error': '至少提供一个可更新字段'}, 400

    updated = deps['storage_context'].update_user(current_user_id, updates)
    if updated:
        return {'message': '个人信息更新成功', 'user': updated}, 200
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

    created = deps['storage_context'].insert_feedback(record)
    if created:
        return {'message': '反馈已提交', 'feedback': created}, 201
    return {'error': '提交失败'}, 500
