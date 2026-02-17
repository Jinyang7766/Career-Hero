import json
import os
import re
import sys
import uuid


def _extract_score(text: str):
    value = str(text or "")
    patterns = [
        r"总分[:：]\s*(\d{1,3})\s*/\s*100",
        r"(\d{1,3})\s*/\s*100",
        r"总分[:：]\s*(\d{1,3})",
    ]
    for p in patterns:
        m = re.search(p, value)
        if not m:
            continue
        try:
            score = int(m.group(1))
            if 0 <= score <= 100:
                return score
        except Exception:
            pass
    return None


def _post_json(client, url: str, payload: dict, headers: dict):
    r = client.post(url, headers=headers, json=payload)
    body = r.get_json() or {}
    return r.status_code, body


def main() -> int:
    os.environ["USE_MOCK_STORAGE"] = "true"
    os.environ.setdefault("JWT_SECRET", "test-secret-32-bytes-minimum-key!!")
    os.environ.setdefault("PII_GUARD_MODE", "warn")

    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    sys.path.insert(0, os.path.join(repo_root, "backend"))
    import app as backend_app_module  # pylint: disable=import-error

    app = backend_app_module.app
    client = app.test_client()

    email = f"iv_{uuid.uuid4().hex[:8]}@example.com"
    password = "Passw0rd!123"
    jd = "岗位：运营经理。要求：数据分析、跨部门协作、活动复盘、项目推进。"
    interview_type = "general"

    resume_data = {
        "personalInfo": {
            "name": "李四",
            "title": "运营经理",
            "email": email,
            "phone": "13900001111",
            "location": "杭州",
            "summary": "5年运营经验，负责活动增长与流程优化。",
        },
        "workExps": [
            {
                "date": "2021-01 - 2025-01",
                "company": "示例互联网公司",
                "position": "运营经理",
                "description": "主导年度活动规划，推动跨部门协作并沉淀SOP。",
            }
        ],
        "educations": [
            {
                "date": "2015-09 - 2019-06",
                "school": "示例大学",
                "major": "工商管理",
                "degree": "本科",
            }
        ],
        "projects": [],
        "skills": ["SQL", "Excel", "项目管理"],
        "summary": "5年运营经验，负责活动增长与流程优化。",
        "optimizationStatus": "optimized",
        "optimizedFromId": str(uuid.uuid4()),
    }

    # auth
    r = client.post(
        "/api/auth/register",
        json={"username": "Interview E2E", "email": email, "password": password},
    )
    reg = r.get_json() or {}
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {reg}"

    r = client.post("/api/auth/login", json={"email": email, "password": password})
    login = r.get_json() or {}
    assert r.status_code == 200 and login.get("token"), f"login failed: {r.status_code} {login}"
    headers = {"Authorization": f"Bearer {login['token']}"}

    # create resume
    r = client.post(
        "/api/resumes",
        headers=headers,
        json={"title": "面试用简历", "resumeData": resume_data},
    )
    created = r.get_json() or {}
    assert r.status_code in (200, 201), f"create resume failed: {r.status_code} {created}"

    # plan
    status, plan = _post_json(
        client,
        "/api/ai/chat",
        {
            "message": "生成面试题库",
            "mode": "interview_plan",
            "resumeData": resume_data,
            "jobDescription": jd,
            "chatHistory": [],
            "interviewType": interview_type,
        },
        headers,
    )
    assert status == 200 and plan.get("success") is True, f"interview_plan failed: {status} {plan}"
    questions = plan.get("questions") or []
    assert len(questions) >= 1, f"empty plan questions: {plan}"

    # simulate chat history (phase 1: first 3 rounds)
    chat_history = [{"role": "model", "text": f"下一题：{questions[0]}"}]
    answers = [
        "我先做自我介绍：我有5年运营经验，负责从活动策略到复盘闭环，带过跨部门项目，重点看转化率和人群留存。",
        "在去年双11项目里，我把目标拆成周指标，联合商品和设计团队建立日看板，及时调整投放预算，最终活动GMV同比提升28%。",
        "跨部门冲突主要在资源排期，我通过优先级清单和里程碑机制对齐预期，并在每日站会里做风险前置，减少返工。",
        "复盘时我会按流量-转化-客单价拆解，先定位最大损耗环节，再给出下一周期的AB实验计划和负责人。",
        "如果要快速扩量，我会先验证可复制渠道，再设置ROI阈值与预算护栏，分阶段放量，确保增长和成本平衡。",
    ]

    round_responses = []
    for idx in range(3):
        status, body = _post_json(
            client,
            "/api/ai/chat",
            {
                "message": answers[idx],
                "mode": "interview",
                "resumeData": resume_data,
                "jobDescription": jd,
                "chatHistory": chat_history,
                "interviewType": interview_type,
            },
            headers,
        )
        assert status == 200 and isinstance(body.get("response"), str), f"chat round {idx+1} failed: {status} {body}"
        text = body["response"]
        round_responses.append(text)
        chat_history.append({"role": "user", "text": answers[idx]})
        chat_history.append({"role": "model", "text": text})

    # simulate interruption: persist + restore chat history
    persisted = json.loads(json.dumps(chat_history, ensure_ascii=False))
    restored_history = json.loads(json.dumps(persisted, ensure_ascii=False))

    # phase 2: continue 2 rounds on restored history
    for idx in range(3, 5):
        status, body = _post_json(
            client,
            "/api/ai/chat",
            {
                "message": answers[idx],
                "mode": "interview",
                "resumeData": resume_data,
                "jobDescription": jd,
                "chatHistory": restored_history,
                "interviewType": interview_type,
            },
            headers,
        )
        assert status == 200 and isinstance(body.get("response"), str), f"chat resume round {idx+1} failed: {status} {body}"
        text = body["response"]
        round_responses.append(text)
        restored_history.append({"role": "user", "text": answers[idx]})
        restored_history.append({"role": "model", "text": text})

    # summary
    status, summary = _post_json(
        client,
        "/api/ai/chat",
        {
            "message": "结束面试，请给出总结",
            "mode": "interview_summary",
            "resumeData": resume_data,
            "jobDescription": jd,
            "chatHistory": restored_history,
            "interviewType": interview_type,
        },
        headers,
    )
    assert status == 200 and isinstance(summary.get("response"), str), f"summary failed: {status} {summary}"
    summary_text = summary["response"]
    score = _extract_score(summary_text)
    assert score is not None, f"summary missing score: {summary_text[:300]}"

    result = {
        "result": "PASS",
        "interviewType": interview_type,
        "planQuestionCount": len(questions),
        "roundCount": len(round_responses),
        "interruptedAtRound": 3,
        "resumedRoundCount": 2,
        "summaryScore": score,
        "summarySnippet": summary_text[:180],
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
