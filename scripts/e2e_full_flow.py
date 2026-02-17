import json
import os
import sys
import uuid


def _pretty(title: str, data):
    print(f"\n=== {title} ===")
    print(json.dumps(data, ensure_ascii=False, indent=2))


def main() -> int:
    os.environ["USE_MOCK_STORAGE"] = "true"
    os.environ.setdefault("JWT_SECRET", "test-secret-32-bytes-minimum-key!!")
    os.environ.setdefault("PII_GUARD_MODE", "warn")

    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    sys.path.insert(0, os.path.join(repo_root, "backend"))

    import app as backend_app_module  # pylint: disable=import-error

    app = backend_app_module.app
    client = app.test_client()

    email = f"e2e_{uuid.uuid4().hex[:8]}@example.com"
    password = "Passw0rd!123"

    resume_data = {
        "personalInfo": {
            "name": "张三",
            "title": "运营专员",
            "email": email,
            "phone": "13800138000",
            "location": "上海",
            "summary": "3年电商运营经验，擅长数据分析与活动运营。",
        },
        "workExps": [
            {
                "date": "2022-01 - 2025-01",
                "company": "示例科技有限公司",
                "position": "运营专员",
                "description": "负责活动策划与投放，跟踪转化数据并优化。",
            }
        ],
        "educations": [
            {
                "date": "2018-09 - 2022-06",
                "school": "示例大学",
                "major": "市场营销",
                "degree": "本科",
            }
        ],
        "projects": [],
        "skills": ["Excel", "SQL", "CET-4", "CET-6"],
        "summary": "3年电商运营经验，擅长数据分析与活动运营。",
    }

    jd = "岗位：电商运营。要求：熟悉活动运营、数据分析、复盘优化、跨部门协作，能提升转化率和GMV。"

    # 1) register
    r = client.post(
        "/api/auth/register",
        json={"username": "E2E Tester", "email": email, "password": password},
    )
    reg = r.get_json() or {}
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {reg}"

    # 2) login
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    login = r.get_json() or {}
    assert r.status_code == 200, f"login failed: {r.status_code} {login}"
    token = login.get("token")
    assert token, f"missing token: {login}"
    headers = {"Authorization": f"Bearer {token}"}

    # 3) create original resume
    r = client.post(
        "/api/resumes",
        headers=headers,
        json={"title": "原始简历", "resumeData": resume_data},
    )
    created = r.get_json() or {}
    assert r.status_code in (200, 201), f"create failed: {r.status_code} {created}"
    original = created["resume"]
    original_id = original["id"]
    original_updated_at_before = original["updated_at"]

    # 4) analyze
    r = client.post(
        "/api/ai/analyze",
        headers=headers,
        json={
            "resumeData": resume_data,
            "jobDescription": jd,
            "targetCompany": "示例电商公司",
        },
    )
    analysis = r.get_json() or {}
    assert r.status_code == 200, f"analyze failed: {r.status_code} {analysis}"
    suggestions = analysis.get("suggestions") or []
    score = analysis.get("score", 0)

    # 5) generate optimized resume payload
    accepted = []
    for s in suggestions[:3]:
        sx = dict(s)
        sx["status"] = "accepted"
        accepted.append(sx)

    r = client.post(
        "/api/ai/generate-resume",
        headers=headers,
        json={
            "resumeData": resume_data,
            "chatHistory": [],
            "score": score,
            "suggestions": accepted,
        },
    )
    generated = r.get_json() or {}
    assert (
        r.status_code == 200 and isinstance(generated.get("resumeData"), dict)
    ), f"generate failed: {r.status_code} {generated}"

    optimized_data = generated["resumeData"]
    optimized_data["optimizationStatus"] = "optimized"
    optimized_data["optimizedFromId"] = original_id
    optimized_data["analysisSnapshot"] = {
        "score": score,
        "suggestions": suggestions,
        "report": analysis.get("report") or {},
        "jdText": jd,
        "targetCompany": analysis.get("targetCompany") or "示例电商公司",
    }

    # 6) adopt #1
    r = client.post(
        "/api/resumes",
        headers=headers,
        json={"title": "已分析-原始简历", "resumeData": optimized_data},
    )
    adopt1 = r.get_json() or {}
    assert r.status_code in (200, 201), f"adopt#1 failed: {r.status_code} {adopt1}"
    optimized_id_1 = adopt1["resume"]["id"]

    # 7) adopt #2 should update same resume
    optimized_data_2 = json.loads(json.dumps(optimized_data, ensure_ascii=False))
    skills = optimized_data_2.get("skills") or []
    if "Power BI" not in skills:
        skills.append("Power BI")
    optimized_data_2["skills"] = skills

    r = client.post(
        "/api/resumes",
        headers=headers,
        json={"title": "已分析-原始简历", "resumeData": optimized_data_2},
    )
    adopt2 = r.get_json() or {}
    assert r.status_code == 200, f"adopt#2 failed: {r.status_code} {adopt2}"
    optimized_id_2 = adopt2["resume"]["id"]

    # 8) verify only one optimized resume exists for this original
    r = client.get("/api/resumes", headers=headers)
    lst = r.get_json() or {}
    assert r.status_code == 200, f"list failed: {r.status_code} {lst}"
    ids = [x.get("id") for x in (lst.get("resumes") or [])]

    optimized_matches = []
    for rid in ids:
        rr = client.get(f"/api/resumes/{rid}", headers=headers)
        if rr.status_code != 200:
            continue
        row = (rr.get_json() or {}).get("resume") or {}
        rd = row.get("resume_data") or {}
        if (
            str(rd.get("optimizationStatus", "")).lower() == "optimized"
            and rd.get("optimizedFromId") == original_id
        ):
            optimized_matches.append(row)

    r = client.get(f"/api/resumes/{original_id}", headers=headers)
    original_detail = r.get_json() or {}
    assert r.status_code == 200, f"get original failed: {r.status_code} {original_detail}"
    original_updated_at_after = (original_detail.get("resume") or {}).get("updated_at")

    # 9) interview plan + one interview message
    r = client.post(
        "/api/ai/chat",
        headers=headers,
        json={
            "message": "请生成面试题库",
            "mode": "interview_plan",
            "resumeData": optimized_data_2,
            "jobDescription": jd,
            "chatHistory": [],
            "interviewType": "technical",
        },
    )
    plan = r.get_json() or {}
    assert r.status_code == 200, f"plan failed: {r.status_code} {plan}"

    r = client.post(
        "/api/ai/chat",
        headers=headers,
        json={
            "message": "我会SQL和Excel，也做过跨部门协作项目。",
            "mode": "interview",
            "resumeData": optimized_data_2,
            "jobDescription": jd,
            "chatHistory": [
                {"role": "assistant", "content": "请先做一个简短自我介绍。"},
                {"role": "user", "content": "我有3年电商运营经验，负责活动和数据复盘。"},
            ],
            "interviewType": "technical",
        },
    )
    chat = r.get_json() or {}
    assert (
        r.status_code == 200 and isinstance(chat.get("response"), str)
    ), f"interview failed: {r.status_code} {chat}"

    assert optimized_id_1 == optimized_id_2, "optimized resume recreated unexpectedly"
    assert len(optimized_matches) == 1, f"expected 1 optimized resume, got {len(optimized_matches)}"
    assert (
        original_updated_at_before == original_updated_at_after
    ), "original resume updated_at changed unexpectedly"

    _pretty(
        "E2E Summary",
        {
            "originalResumeId": original_id,
            "optimizedResumeIdFirstAdopt": optimized_id_1,
            "optimizedResumeIdSecondAdopt": optimized_id_2,
            "optimizedResumeCountForOriginal": len(optimized_matches),
            "originalUpdatedAtBefore": original_updated_at_before,
            "originalUpdatedAtAfter": original_updated_at_after,
            "analysisScore": score,
            "planQuestionCount": len(plan.get("questions") or []),
            "sampleInterviewReply": chat.get("response", "")[:120],
            "result": "PASS",
        },
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
