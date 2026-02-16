import uuid
from datetime import datetime


def list_resumes(*, current_user_id, is_mock_mode, get_mock_resumes_for_user, supabase):
    if is_mock_mode():
        user_resumes = list(get_mock_resumes_for_user(current_user_id).values())
        user_resumes.sort(key=lambda item: item.get('created_at', ''), reverse=True)
    else:
        result = (
            supabase.table('resumes')
            .select('*')
            .eq('user_id', current_user_id)
            .order('created_at', desc=True)
            .execute()
        )
        user_resumes = result.data

    resumes = []
    for resume in user_resumes:
        resumes.append({
            'id': resume['id'],
            'title': resume['title'],
            'date': resume['updated_at'],
            'score': resume.get('score'),
            'hasDot': resume.get('hasDot', False),
        })
    return {'resumes': resumes}, 200


def create_resume_record(
    *,
    current_user_id,
    data,
    clean_string,
    clean_resume_payload,
    normalize_resume_id,
    find_existing_optimized_resume,
    is_mock_mode,
    get_mock_resumes_for_user,
    mock_supabase_response,
    supabase,
):
    title = data.get('title', '新简历')
    title = clean_string(title, 200)
    resume_data = data.get('resumeData', {})
    cleaned_resume_data, err = clean_resume_payload(resume_data)
    if err:
        return {'error': err}, 400

    now_iso = datetime.utcnow().isoformat()
    optimization_status = str(cleaned_resume_data.get('optimizationStatus') or '').strip().lower()
    optimized_from_id = normalize_resume_id(cleaned_resume_data.get('optimizedFromId'))
    if optimization_status == 'optimized' and optimized_from_id:
        existing_resume = find_existing_optimized_resume(current_user_id, optimized_from_id)
        if existing_resume:
            update_data = {'title': title, 'resume_data': cleaned_resume_data, 'updated_at': now_iso}
            if is_mock_mode():
                existing_resume.update(update_data)
                result = mock_supabase_response(data=[existing_resume])
            else:
                result = (
                    supabase.table('resumes')
                    .update(update_data)
                    .eq('id', existing_resume.get('id'))
                    .eq('user_id', current_user_id)
                    .execute()
                )

            if result.data:
                return {'message': '优化简历已存在，已更新', 'resume': result.data[0]}, 200

    resume_record = {
        'id': str(uuid.uuid4()),
        'user_id': current_user_id,
        'title': title,
        'resume_data': cleaned_resume_data,
        'created_at': now_iso,
        'updated_at': now_iso,
    }
    if is_mock_mode():
        get_mock_resumes_for_user(current_user_id)[resume_record['id']] = resume_record
        result = mock_supabase_response(data=[resume_record])
    else:
        result = supabase.table('resumes').insert(resume_record).execute()

    if result.data:
        return {'message': '简历创建成功', 'resume': result.data[0]}, 201
    return {'error': '创建简历失败'}, 500


def get_resume_detail(*, current_user_id, resume_id, is_mock_mode, get_mock_resumes_for_user, supabase):
    if is_mock_mode():
        resume = get_mock_resumes_for_user(current_user_id).get(resume_id)
        if not resume or resume.get('user_id') != current_user_id:
            return {'error': '未找到简历'}, 404
    else:
        result = supabase.table('resumes').select('*').eq('id', resume_id).eq('user_id', current_user_id).execute()
        if not result.data:
            return {'error': '未找到简历'}, 404
        resume = result.data[0]
    return {'resume': resume}, 200


def update_resume_record(
    *,
    current_user_id,
    resume_id,
    data,
    clean_resume_payload,
    is_mock_mode,
    get_mock_resumes_for_user,
    mock_supabase_response,
    supabase,
):
    title = data.get('title')
    resume_data = data.get('resumeData')
    score = data.get('score')

    update_data = {'updated_at': datetime.utcnow().isoformat()}
    if title is not None:
        update_data['title'] = title
    if resume_data is not None:
        cleaned_resume_data, err = clean_resume_payload(resume_data)
        if err:
            return {'error': err}, 400
        update_data['resume_data'] = cleaned_resume_data
    if score is not None:
        if not isinstance(score, (int, float)) or score < 0 or score > 100:
            return {'error': '分数必须在 0-100 之间'}, 400
        update_data['score'] = score

    if is_mock_mode():
        resume = get_mock_resumes_for_user(current_user_id).get(resume_id)
        if not resume or resume.get('user_id') != current_user_id:
            return {'error': '简历不存在或更新失败'}, 404
        resume.update(update_data)
        result = mock_supabase_response(data=[resume])
    else:
        result = supabase.table('resumes').update(update_data).eq('id', resume_id).eq('user_id', current_user_id).execute()

    if result.data:
        return {'message': '简历更新成功', 'resume': result.data[0]}, 200
    return {'error': '简历不存在或更新失败'}, 404


def delete_resume_record(*, current_user_id, resume_id, is_mock_mode, get_mock_resumes_for_user, mock_supabase_response, supabase):
    if is_mock_mode():
        resume = get_mock_resumes_for_user(current_user_id).get(resume_id)
        if not resume or resume.get('user_id') != current_user_id:
            return {'error': '简历不存在或删除失败'}, 404
        deleted_resume = get_mock_resumes_for_user(current_user_id).pop(resume_id)
        result = mock_supabase_response(data=[deleted_resume])
    else:
        result = supabase.table('resumes').delete().eq('id', resume_id).eq('user_id', current_user_id).execute()

    if result.data:
        return {'message': '简历删除成功'}, 200
    return {'error': '简历不存在或删除失败'}, 404
