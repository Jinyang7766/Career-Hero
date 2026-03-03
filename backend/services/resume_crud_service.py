import uuid
from datetime import datetime

from .resume_storage_policy import is_resume_eligible_for_library


def _resume_not_persistable_error():
    return {
        'error': '该简历尚未完成诊断/优化，当前不允许写入简历库',
        'code': 'resume_not_persistable',
    }, 422


def list_resumes(*, current_user_id, storage_context):
    user_resumes = storage_context.list_resumes(current_user_id, order_by='created_at', desc=True)

    resumes = []
    for resume in user_resumes:
        if not is_resume_eligible_for_library(resume.get('resume_data') or {}):
            continue
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
    storage_context,
    logger=None,
):
    title = data.get('title', '新简历')
    title = clean_string(title, 200)
    resume_data = data.get('resumeData', {})
    cleaned_resume_data, err = clean_resume_payload(
        resume_data,
        logger=logger,
    )
    if err:
        return {'error': err}, 400
    if not is_resume_eligible_for_library(cleaned_resume_data):
        return _resume_not_persistable_error()

    now_iso = datetime.utcnow().isoformat()
    optimization_status = str(cleaned_resume_data.get('optimizationStatus') or '').strip().lower()
    optimized_from_id = normalize_resume_id(cleaned_resume_data.get('optimizedFromId'))

    if optimization_status == 'optimized' and optimized_from_id:
        existing_resume = find_existing_optimized_resume(current_user_id, optimized_from_id)
        if existing_resume:
            updated = storage_context.update_resume(
                current_user_id,
                existing_resume.get('id'),
                {'title': title, 'resume_data': cleaned_resume_data, 'updated_at': now_iso},
            )
            if updated:
                return {'message': '优化简历已存在，已更新', 'resume': updated}, 200

    resume_record = {
        'id': str(uuid.uuid4()),
        'user_id': current_user_id,
        'title': title,
        'resume_data': cleaned_resume_data,
        'created_at': now_iso,
        'updated_at': now_iso,
    }

    created = storage_context.insert_resume(resume_record)
    if created:
        return {'message': '简历创建成功', 'resume': created}, 201
    return {'error': '创建简历失败'}, 500


def get_resume_detail(*, current_user_id, resume_id, storage_context):
    resume = storage_context.get_resume(current_user_id, resume_id)
    if not resume:
        return {'error': '未找到简历'}, 404
    return {'resume': resume}, 200


def update_resume_record(
    *,
    current_user_id,
    resume_id,
    data,
    clean_resume_payload,
    storage_context,
    logger=None,
):
    title = data.get('title')
    resume_data = data.get('resumeData')
    score = data.get('score')

    update_data = {'updated_at': datetime.utcnow().isoformat()}
    if title is not None:
        update_data['title'] = title
    if resume_data is not None:
        existing_resume = storage_context.get_resume(current_user_id, resume_id)
        existing_resume_data = (
            (existing_resume or {}).get('resume_data')
            if isinstance(existing_resume, dict)
            else None
        )
        cleaned_resume_data, err = clean_resume_payload(
            resume_data,
            existing_resume_data=existing_resume_data,
            logger=logger,
        )
        if err:
            return {'error': err}, 400
        if not is_resume_eligible_for_library(cleaned_resume_data):
            return _resume_not_persistable_error()
        update_data['resume_data'] = cleaned_resume_data
    if score is not None:
        if not isinstance(score, (int, float)) or score < 0 or score > 100:
            return {'error': '分数必须在 0-100 之间'}, 400
        update_data['score'] = score

    updated = storage_context.update_resume(current_user_id, resume_id, update_data)
    if updated:
        return {'message': '简历更新成功', 'resume': updated}, 200
    return {'error': '简历不存在或更新失败'}, 404


def delete_resume_record(*, current_user_id, resume_id, storage_context):
    deleted = storage_context.delete_resume(current_user_id, resume_id)
    if deleted:
        return {'message': '简历删除成功'}, 200
    return {'error': '简历不存在或删除失败'}, 404
