from backend.services.resume_parse_postprocess import (
    extract_skills_from_resume_text,
    fill_skills_if_missing,
)
from backend.services.skill_cleanup_service import (
    DEFAULT_SKILL_LIMIT,
    clean_skill_list,
    merge_resume_skills,
    sanitize_resume_skills,
)


def test_extract_skills_keeps_ab_test_and_splits_regular_slash_tokens():
    resume_text = """
张三
核心技能：
Python/SQL/A/B测试
数据建模
"""
    skills = extract_skills_from_resume_text(resume_text)

    assert "Python" in skills
    assert "SQL" in skills
    assert "A/B测试" in skills
    assert "数据建模" in skills


def test_extract_skills_reads_certificates_from_explicit_certificate_section():
    resume_text = """
李四
证书：PMP、CET-6
工作经历：负责报表开发
"""
    skills = extract_skills_from_resume_text(resume_text)

    assert "PMP" in skills
    assert "CET-6" in skills


def test_fill_skills_falls_back_to_existing_parser_skills_when_no_skill_block():
    parsed_data = {
        "skills": [{"name": "Python"}, {"技能": "PowerBI"}, "SQL", "Python"],
    }
    resume_text = """
王五
工作经历
负责数据分析和报表开发
"""
    filled = fill_skills_if_missing(parsed_data, resume_text)

    assert filled["skills"] == ["Python", "PowerBI", "SQL"]


def test_fill_skills_prioritizes_explicit_skill_section_without_merging_parser_skills():
    parsed_data = {"skills": ["SQL", "PowerBI", "React"]}
    resume_text = """
赵敏
专业技能：Python、SQL
工作经历：
负责使用 React 维护后台
"""
    filled = fill_skills_if_missing(parsed_data, resume_text)

    assert filled["skills"] == ["Python", "SQL"]


def test_fill_skills_removes_ab_fragments_when_ab_skill_exists():
    parsed_data = {"skills": ["A", "B测试", "A/B测试", "SQL"]}
    resume_text = """
周杰
核心技能：A/B测试、SQL
"""
    filled = fill_skills_if_missing(parsed_data, resume_text)

    assert "A/B测试" in filled["skills"]
    assert "A" not in filled["skills"]
    assert "B测试" not in filled["skills"]


def test_fill_skills_extracts_from_work_project_when_no_explicit_skill_section():
    parsed_data = {"skills": ["A", "B测试", "Python", "SQL"]}
    resume_text = """
李雷
工作经历：
负责广告投放分析，通过 A/B Testing 持续优化素材并提升 ROI。
项目经历：
使用 Python 和 SQL 构建分析看板。
"""
    filled = fill_skills_if_missing(parsed_data, resume_text)

    assert "A/B测试" in filled["skills"]
    assert "Python" in filled["skills"]
    assert "SQL" in filled["skills"]
    assert "A" not in filled["skills"]
    assert "B测试" not in filled["skills"]


def test_skill_cleanup_service_dedup_filters_and_caps():
    cleaned = clean_skill_list([
        "SQL",
        " sql ",
        "Power BI",
        "PowerBI",
        "A/B Test",
        "A/B Testing",
        "管理",
        "沟通能力",
        "Python",
        "Excel",
        "Tableau",
        "GA4",
        "LLM",
        "RAG",
        "Docker",
        "Linux",
    ])

    assert "SQL" in cleaned
    assert "A/B Test" in cleaned
    assert "管理" not in cleaned
    assert "沟通能力" not in cleaned
    assert len(cleaned) <= DEFAULT_SKILL_LIMIT


def test_skill_cleanup_service_merge_and_resume_guard():
    merged = merge_resume_skills(
        source_skills=["SQL", "Python", "Excel"],
        generated_skills=["sql", "Power BI", "LLM", "RAG", "Docker"],
        suggested_skills=["A/B Testing", "GA4", "PowerBI"],
    )

    assert merged[0] in ("SQL", "Python", "Excel")
    assert len(merged) <= DEFAULT_SKILL_LIMIT

    payload = {
        "summary": "x",
        "skills": ["SQL", " sql ", "策略", "Python"],
    }
    sanitized = sanitize_resume_skills(payload)
    assert sanitized["summary"] == "x"
    assert sanitized["skills"] == ["SQL", "Python"]
