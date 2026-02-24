from backend.services.resume_parse_postprocess import (
    extract_skills_from_resume_text,
    fill_skills_if_missing,
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


def test_fill_skills_merges_strict_and_existing_without_duplicates():
    parsed_data = {"skills": ["SQL", "PowerBI"]}
    resume_text = """
赵敏
专业技能：Python、SQL
"""
    filled = fill_skills_if_missing(parsed_data, resume_text)

    assert filled["skills"] == ["Python", "SQL", "PowerBI"]


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
