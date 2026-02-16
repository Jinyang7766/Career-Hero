# -*- coding: utf-8 -*-
import logging

from google.genai import types

logger = logging.getLogger(__name__)
gemini_client = None
supabase = None
RAG_MATCH_THRESHOLD = 0.75


def configure_rag_service(*, logger_obj=None, gemini_client_obj=None, supabase_client=None, rag_match_threshold=0.75):
    global logger, gemini_client, supabase, RAG_MATCH_THRESHOLD
    if logger_obj is not None:
        logger = logger_obj
    gemini_client = gemini_client_obj
    supabase = supabase_client
    try:
        RAG_MATCH_THRESHOLD = float(rag_match_threshold)
    except Exception:
        RAG_MATCH_THRESHOLD = 0.75

def generate_embedding(text):
    """使用 Gemini 生成文本向量"""
    try:
        if not gemini_client:
            return None
        
        result = gemini_client.models.embed_content(
            model="models/gemini-embedding-001",
            contents=text,
            config=types.EmbedContentConfig(task_type="RETRIEVAL_QUERY")
        )
        return result.embeddings[0].values
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
                'match_threshold': RAG_MATCH_THRESHOLD,
                'match_count': limit,
                'filter_seniority': seniority_pool,
                'filter_is_ai_enhanced': ai_filter if ai_filter is not None else None
            }).execute()
            results = rpc_response.data
        except Exception as e:
            logger.error(f"RAG Retrieval failed: {e}")
            return []

        # 兜底：如果没结果，尝试不带 AI 过滤再次检索（阈值不降低）
        if not results and ai_filter is not None:
             rpc_response = supabase.rpc('match_master_cases', {
                'query_embedding': query_vector,
                'match_threshold': RAG_MATCH_THRESHOLD,
                'match_count': limit,
                'filter_seniority': seniority_pool,
                'filter_is_ai_enhanced': None
            }).execute()
             results = rpc_response.data

        if not results:
            return []

        def _get_similarity(row):
            for key in ('similarity', 'match_similarity', 'score'):
                val = row.get(key)
                if isinstance(val, (int, float)):
                    return float(val)
            return None

        strict_results = []
        for row in results:
            sim = _get_similarity(row)
            if sim is not None and sim <= RAG_MATCH_THRESHOLD:
                continue

            content = dict(row.get('content') or {})
            if sim is not None:
                content['similarity'] = sim
            strict_results.append(content)

        if not strict_results:
            logger.info(f"RAG skipped: no case similarity > {RAG_MATCH_THRESHOLD}")
            return []

        return strict_results
    except Exception as e:
        logger.error(f"find_relevant_cases_vector error: {e}")
        return []


def resolve_rag_strategy(resume_data, job_description, rag_flag_present: bool):
    """
    按行业路由 RAG 策略：
    - 硬技能导向（财务/审计、供应链、技术/架构）：强开启 RAG（术语/框架准确性收益更高）
    - 软技能/创意导向（电商运营、市场/内容）：弱开启或关闭 RAG（避免模板化痕迹）
    - 其他：默认策略
    """
    resume_data = resume_data or {}
    personal = resume_data.get('personalInfo', {}) or {}
    work_exps = resume_data.get('workExps', []) or []
    skills = resume_data.get('skills', []) or []
    if not isinstance(skills, list):
        skills = [str(skills)]

    text_chunks = [
        str(job_description or ""),
        str(resume_data.get('industry', '') or ''),
        str(personal.get('jobTitle', '') or ''),
        str(personal.get('title', '') or ''),
        str(personal.get('summary', '') or ''),
        " ".join(str(s) for s in skills)
    ]
    for exp in work_exps[:5]:
        text_chunks.append(str(exp.get('jobTitle', '') or ''))
        text_chunks.append(str(exp.get('company', '') or ''))
        text_chunks.append(str(exp.get('description', '') or ''))

    text = " ".join(text_chunks).lower()

    finance_audit_keywords = [
        '财务', '审计', '会计', '税务', '内控', '合规', '风控',
        'ifrs', 'gaap', 'cpa', 'acca', 'big4', '四大'
    ]
    supply_chain_keywords = [
        '供应链', '物流', '仓储', '采购', '计划', '库存', '补货', '预测', '排产',
        'wms', 'tms', 'erp', 'sap', 'scm'
    ]
    tech_keywords = [
        '架构', '架构师', '系统架构', '后端', '前端', '全栈', '算法', '数据工程', '数据分析', '数据科学',
        'ai', 'llm', 'rag', 'agent', 'python', 'java', 'golang', 'node', 'react',
        'architecture', 'architect', 'distributed', 'microservice', 'devops', 'kubernetes', 'k8s', 'grpc'
    ]
    soft_creative_keywords = [
        '电商', '运营', '电商运营', '市场', '营销', '品牌', '增长', '投放', 'campaign',
        '内容', '新媒体', '社群', '直播', '短视频', '达人', 'kol', 'koc', 'gmv'
    ]

    has_finance_audit = any(k in text for k in finance_audit_keywords)
    has_supply_chain = any(k in text for k in supply_chain_keywords)
    has_tech = any(k in text for k in tech_keywords)
    has_soft_creative = any(k in text for k in soft_creative_keywords)

    # Hard-skill domains: force-enable RAG (unless user explicitly turned it off via ragEnabled=false).
    if has_finance_audit or has_supply_chain or has_tech:
        hard_context = """
【行业策略：硬技能导向（术语/框架优先）】
允许使用 RAG 参考案例来提升术语准确性、框架完整性与表达结构，但必须严格遵守“只学风格不复用事实”的约束：
- 只参考叙事结构、动词表达、量化逻辑，不得复用具体公司/项目/数字。
- 必须把输出锚定到候选人真实经历；缺失事实只能用中性占位或提出“应补充的可验证指标/口径”。
"""
        return {
            'mode': 'hard_skill_strong_rag',
            'disable_case_rag': False,
            'force_case_rag_on': True,
            'enhance_case_rag': True,
            'case_limit': 5,
            'extra_context': hard_context
        }

    # Soft/creative domains: weak-enable or disable by default to avoid templated outputs.
    if has_soft_creative:
        soft_context = """
【行业策略：软技能/创意导向（避免模板化）】
本领域更看重“人的表达与灵气”。如启用 RAG，只允许弱引用（极少量示例），并且必须显著降低模板痕迹：
- 不要套用固定句式/套路化结构；优先输出更贴近个人风格的表达。
- 量化只用于“能被简历事实支持”的部分；不要为了好看硬造数据。
"""
        # Default behavior: if client didn't send ragEnabled, keep RAG off for soft domains.
        return {
            'mode': 'soft_creative_weak_rag',
            'disable_case_rag': (not rag_flag_present),
            'force_case_rag_on': False,
            'enhance_case_rag': False,
            'case_limit': 1,
            'extra_context': soft_context
        }

    return {
        'mode': 'default',
        'disable_case_rag': False,
        'force_case_rag_on': False,
        'enhance_case_rag': False,
        'case_limit': 3,
        'extra_context': ''
    }

