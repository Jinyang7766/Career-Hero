from __future__ import annotations

import os
from abc import ABC
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone


def _parse_bool(value: Any) -> bool:
    return str(value or '').strip().lower() in ('1', 'true', 'yes', 'on')


def normalize_resume_id(value):
    return str(value or '').strip()


class BaseRepository(ABC):
    """Standard storage repository contract root."""

    mode: str = 'base'

    def is_mock(self) -> bool:
        return self.mode == 'mock'


class SupabaseRepository(BaseRepository):
    mode = 'supabase'

    def __init__(self, client):
        self.client = client


class MockRepository(BaseRepository):
    mode = 'mock'

    def __init__(self):
        self.users: Dict[str, Dict[str, Any]] = {}
        self.resumes: Dict[str, Dict[str, Dict[str, Any]]] = {}
        self.feedback: List[Dict[str, Any]] = []


@dataclass
class StorageContext:
    repository: BaseRepository
    logger: Any = None
    _empty_users: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    _empty_resumes: Dict[str, Dict[str, Dict[str, Any]]] = field(default_factory=dict)
    _empty_feedback: List[Dict[str, Any]] = field(default_factory=list)

    @property
    def mode(self) -> str:
        return getattr(self.repository, 'mode', 'base')

    def is_mock_mode(self) -> bool:
        return self.repository.is_mock()

    @property
    def supabase(self):
        if isinstance(self.repository, SupabaseRepository):
            return self.repository.client
        return None

    @property
    def mock_users(self):
        if isinstance(self.repository, MockRepository):
            return self.repository.users
        return self._empty_users

    @property
    def mock_resumes(self):
        if isinstance(self.repository, MockRepository):
            return self.repository.resumes
        return self._empty_resumes

    @property
    def mock_feedback(self):
        if isinstance(self.repository, MockRepository):
            return self.repository.feedback
        return self._empty_feedback

    def get_mock_resumes_for_user(self, user_id: str):
        if not self.is_mock_mode():
            return {}
        if user_id not in self.repository.resumes:
            self.repository.resumes[user_id] = {}
        return self.repository.resumes[user_id]

    def mock_supabase_response(self, data=None, error=None):
        class MockResponse:
            def __init__(self, data=None, error=None):
                self.data = data or []
                self.error = error

        return MockResponse(data, error)

    # ---- Resume repository operations ----
    def list_resumes(self, user_id: str, *, order_by: str = 'created_at', desc: bool = True):
        if self.is_mock_mode():
            items = list(self.get_mock_resumes_for_user(user_id).values())
            items.sort(key=lambda item: item.get(order_by, ''), reverse=desc)
            return items
        result = (
            self.supabase.table('resumes')
            .select('*')
            .eq('user_id', user_id)
            .order(order_by, desc=desc)
            .execute()
        )
        return result.data or []

    def get_resume(self, user_id: str, resume_id: str):
        if self.is_mock_mode():
            resume = self.get_mock_resumes_for_user(user_id).get(resume_id)
            if not resume or resume.get('user_id') != user_id:
                return None
            return resume
        result = (
            self.supabase.table('resumes')
            .select('*')
            .eq('id', resume_id)
            .eq('user_id', user_id)
            .execute()
        )
        rows = result.data or []
        return rows[0] if rows else None

    def insert_resume(self, record: Dict[str, Any]):
        if self.is_mock_mode():
            self.get_mock_resumes_for_user(record['user_id'])[record['id']] = record
            return record
        result = self.supabase.table('resumes').insert(record).execute()
        rows = result.data or []
        return rows[0] if rows else None

    def update_resume(self, user_id: str, resume_id: str, update_data: Dict[str, Any]):
        if self.is_mock_mode():
            resume = self.get_mock_resumes_for_user(user_id).get(resume_id)
            if not resume or resume.get('user_id') != user_id:
                return None
            resume.update(update_data)
            return resume
        result = (
            self.supabase.table('resumes')
            .update(update_data)
            .eq('id', resume_id)
            .eq('user_id', user_id)
            .execute()
        )
        rows = result.data or []
        return rows[0] if rows else None

    def delete_resume(self, user_id: str, resume_id: str):
        if self.is_mock_mode():
            resume = self.get_mock_resumes_for_user(user_id).get(resume_id)
            if not resume or resume.get('user_id') != user_id:
                return None
            return self.get_mock_resumes_for_user(user_id).pop(resume_id)
        result = (
            self.supabase.table('resumes')
            .delete()
            .eq('id', resume_id)
            .eq('user_id', user_id)
            .execute()
        )
        rows = result.data or []
        return rows[0] if rows else None

    # ---- User repository operations ----
    def list_users_by_email(self, email: str):
        if self.is_mock_mode():
            return [u for u in self.mock_users.values() if u.get('email') == email]
        result = self.supabase.table('users').select('*').eq('email', email).execute()
        return result.data or []

    def get_user_by_id(self, user_id: str, *, fields: Optional[str] = None):
        if self.is_mock_mode():
            return self.mock_users.get(user_id)
        selector = fields or '*'
        result = self.supabase.table('users').select(selector).eq('id', user_id).execute()
        rows = result.data or []
        return rows[0] if rows else None

    def insert_user(self, user_data: Dict[str, Any]):
        if self.is_mock_mode():
            self.mock_users[user_data['id']] = user_data
            return user_data
        result = self.supabase.table('users').insert(user_data).execute()
        rows = result.data or []
        return rows[0] if rows else None

    def update_user(self, user_id: str, updates: Dict[str, Any]):
        if self.is_mock_mode():
            user = self.mock_users.get(user_id)
            if not user:
                return None
            user.update(updates)
            return user
        result = self.supabase.table('users').update(updates).eq('id', user_id).execute()
        rows = result.data or []
        return rows[0] if rows else None

    def upsert_user(self, row: Dict[str, Any], *, on_conflict: str = 'id'):
        if self.is_mock_mode():
            user_id = str(row.get('id') or '').strip()
            if not user_id:
                return None
            existing = self.mock_users.get(user_id) or {}
            existing.update(row)
            self.mock_users[user_id] = existing
            return existing
        result = self.supabase.table('users').upsert(row, on_conflict=on_conflict).execute()
        rows = result.data or []
        return rows[0] if rows else None

    # ---- Feedback repository operations ----
    def insert_feedback(self, row: Dict[str, Any]):
        if self.is_mock_mode():
            self.mock_feedback.append(row)
            return row
        result = self.supabase.table('feedback').insert(row).execute()
        rows = result.data or []
        return rows[0] if rows else None

    # ---- Deletion / maintenance operations ----
    def delete_user_related_records(self, user_id: str, *, logger=None):
        if self.is_mock_mode():
            if user_id in self.mock_users:
                del self.mock_users[user_id]
            if user_id in self.mock_resumes:
                del self.mock_resumes[user_id]
            if self.mock_feedback:
                self.mock_feedback[:] = [f for f in self.mock_feedback if f.get('user_id') != user_id]
            return True

        dependent_tables = [
            ('ai_suggestion_feedback', 'user_id'),
            ('feedback', 'user_id'),
            ('resumes', 'user_id'),
        ]
        for table_name, user_col in dependent_tables:
            try:
                self.supabase.table(table_name).delete().eq(user_col, user_id).execute()
            except Exception as dep_err:
                if logger:
                    logger.warning("user cleanup warning table=%s user=%s: %s", table_name, user_id, dep_err)

        profile_deleted = False
        try:
            result = self.supabase.table('users').delete().eq('id', user_id).execute()
            profile_deleted = bool(result.data)
        except Exception as profile_err:
            if logger:
                logger.warning("user cleanup warning table=users user=%s: %s", user_id, profile_err)
        return profile_deleted

    def list_due_deletion_users(self, *, now_iso: str, limit: int):
        if self.is_mock_mode():
            due = []
            now_dt = datetime.now(timezone.utc)
            for uid, user in list(self.mock_users.items()):
                due_raw = str(user.get('deletion_pending_until') or '').strip()
                if not due_raw:
                    continue
                try:
                    text = due_raw[:-1] + '+00:00' if due_raw.endswith('Z') else due_raw
                    due_dt = datetime.fromisoformat(text)
                    if due_dt.tzinfo is None:
                        due_dt = due_dt.replace(tzinfo=timezone.utc)
                    if due_dt.astimezone(timezone.utc) <= now_dt:
                        due.append({'id': uid, 'deletion_pending_until': due_raw})
                except Exception:
                    continue
            return due[:max(1, limit)]

        result = (
            self.supabase.table('users')
            .select('id,deletion_pending_until')
            .lte('deletion_pending_until', now_iso)
            .limit(limit)
            .execute()
        )
        return result.data or []


def create_storage_context(*, supabase_client, logger):
    use_mock_storage = _parse_bool(os.getenv('USE_MOCK_STORAGE', '0'))

    if use_mock_storage:
        if logger is not None:
            logger.warning('USE_MOCK_STORAGE=true: running with in-memory MockRepository')
        return StorageContext(repository=MockRepository(), logger=logger)

    if supabase_client is None:
        raise RuntimeError(
            'Supabase client unavailable and USE_MOCK_STORAGE is not enabled. '
            'Set USE_MOCK_STORAGE=true explicitly for mock mode.'
        )

    return StorageContext(repository=SupabaseRepository(supabase_client), logger=logger)


def is_mock_mode(supabase_client=None, storage_context: Optional[StorageContext] = None):
    if storage_context is not None:
        return storage_context.is_mock_mode()
    return supabase_client is None


def mock_supabase_response(data=None, error=None, storage_context: Optional[StorageContext] = None):
    if storage_context is not None:
        return storage_context.mock_supabase_response(data=data, error=error)

    class MockResponse:
        def __init__(self, data=None, error=None):
            self.data = data or []
            self.error = error

    return MockResponse(data, error)


def get_mock_resumes_for_user(mock_resumes=None, user_id: str = '', storage_context: Optional[StorageContext] = None):
    if storage_context is not None:
        return storage_context.get_mock_resumes_for_user(user_id)

    if mock_resumes is None:
        mock_resumes = {}
    if user_id not in mock_resumes:
        mock_resumes[user_id] = {}
    return mock_resumes[user_id]


def find_existing_optimized_resume(
    current_user_id: str,
    optimized_from_id: str,
    *,
    storage_context: Optional[StorageContext] = None,
    supabase_client=None,
    mock_mode=None,
    get_mock_resumes_for_user_fn=None,
    logger=None,
):
    target_id = normalize_resume_id(optimized_from_id)
    if not target_id:
        return None

    if storage_context is not None:
        use_mock = storage_context.is_mock_mode()
        if use_mock:
            for resume in storage_context.get_mock_resumes_for_user(current_user_id).values():
                resume_data = resume.get('resume_data') or {}
                status = str(resume_data.get('optimizationStatus') or '').strip().lower()
                from_id = normalize_resume_id(resume_data.get('optimizedFromId'))
                if status == 'optimized' and from_id == target_id:
                    return resume
            return None

        try:
            result = (
                storage_context.supabase.table('resumes')
                .select('*')
                .eq('user_id', current_user_id)
                .order('updated_at', desc=True)
                .execute()
            )
            for resume in (result.data or []):
                resume_data = resume.get('resume_data') or {}
                status = str(resume_data.get('optimizationStatus') or '').strip().lower()
                from_id = normalize_resume_id(resume_data.get('optimizedFromId'))
                if status == 'optimized' and from_id == target_id:
                    return resume
        except Exception as exc:
            if logger:
                logger.warning('find existing optimized resume failed: %s', exc)
        return None

    if mock_mode:
        for resume in get_mock_resumes_for_user_fn(current_user_id).values():
            resume_data = resume.get('resume_data') or {}
            status = str(resume_data.get('optimizationStatus') or '').strip().lower()
            from_id = normalize_resume_id(resume_data.get('optimizedFromId'))
            if status == 'optimized' and from_id == target_id:
                return resume
        return None

    try:
        result = (
            supabase_client.table('resumes')
            .select('*')
            .eq('user_id', current_user_id)
            .order('updated_at', desc=True)
            .execute()
        )
        for resume in (result.data or []):
            resume_data = resume.get('resume_data') or {}
            status = str(resume_data.get('optimizationStatus') or '').strip().lower()
            from_id = normalize_resume_id(resume_data.get('optimizedFromId'))
            if status == 'optimized' and from_id == target_id:
                return resume
    except Exception as exc:
        if logger:
            logger.warning('find existing optimized resume failed: %s', exc)
    return None
