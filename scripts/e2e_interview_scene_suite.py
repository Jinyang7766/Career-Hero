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
    return r.status_code, (r.get_json() or {})


def _build_answers(interview_type: str):
    if interview_type == "technical":
        return [
            "我做过数据平台与运营分析系统，负责指标口径和查询性能优化。",
            "核心链路是埋点入仓、数仓建模、报表服务。我通过分区和物化视图把核心查询延迟从12秒降到2秒。",
            "一次稳定性问题来自高峰期锁竞争，我通过读写分离和批量写入削峰，错误率从1.8%降到0.2%。",
            "我在技术决策上会做成本和收益评估，优先选可迭代方案，并保留回滚机制。",
            "如果扩量，我会先压测和容量评估，再按SLO制定扩容阈值，逐步放量。",
        ]
    if interview_type == "hr":
        return [
            "我先自我介绍：5年运营与项目协同经验，擅长跨团队推进和复盘改进。",
            "面对冲突我先对齐目标和事实，再拆分责任边界，明确里程碑，通常能在两次沟通内达成共识。",
            "压力场景下我会先做优先级排序，确保关键路径按时交付，同时同步风险和备选方案。",
            "我选择岗位看三点：业务成长空间、团队协作方式、是否重视数据驱动。",
            "未来3个月我会先熟悉业务和关键指标，拿出一个可衡量的优化项目并完成闭环。",
        ]
    return [
        "我先做个自我介绍：5年运营经验，做过活动增长和流程优化。",
        "去年双11我把目标拆解到周，通过跨部门看板协同，GMV同比提升28%。",
        "复盘会按流量、转化、客单拆解，定位损耗点并安排下一轮AB测试。",
        "遇到资源冲突时我会用里程碑和优先级清单对齐，减少返工。",
        "如果需要扩量，我会设置ROI护栏并分阶段放量，兼顾增长与成本。",
    ]


def _run_scene(client, headers, interview_type: str):
    email = f"suite_{interview_type}_{uuid.uuid4().hex[:6]}@example.com"
    password = "Passw0rd!123"
    jd = "岗位：运营经理。要求：数据分析、跨部门协作、活动复盘、项目推进。"

    resume_data = {
        "personalInfo": {
            "name": "候选人A",
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
    }

    # register + login per scene (isolated user)
    r = client.post(
        "/api/auth/register",
        json={"username": f"Suite {interview_type}", "email": email, "password": password},
    )
    reg = r.get_json() or {}
    assert r.status_code in (200, 201), f"[{interview_type}] register failed: {r.status_code} {reg}"

    r = client.post("/api/auth/login", json={"email": email, "password": password})
    login = r.get_json() or {}
    assert r.status_code == 200 and login.get("token"), f"[{interview_type}] login failed: {r.status_code} {login}"
    local_headers = {"Authorization": f"Bearer {login['token']}"}

    r = client.post("/api/resumes", headers=local_headers, json={"title": f"面试简历-{interview_type}", "resumeData": resume_data})
    created = r.get_json() or {}
    assert r.status_code in (200, 201), f"[{interview_type}] create resume failed: {r.status_code} {created}"

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
        local_headers,
    )
    assert status == 200 and plan.get("success") is True, f"[{interview_type}] plan failed: {status} {plan}"
    questions = plan.get("questions") or []
    assert questions, f"[{interview_type}] empty questions"

    chat_history = [{"role": "model", "text": f"下一题：{questions[0]}"}]
    answers = _build_answers(interview_type)
    for i in range(3):
        status, body = _post_json(
            client,
            "/api/ai/chat",
            {
                "message": answers[i],
                "mode": "interview",
                "resumeData": resume_data,
                "jobDescription": jd,
                "chatHistory": chat_history,
                "interviewType": interview_type,
            },
            local_headers,
        )
        assert status == 200 and isinstance(body.get("response"), str), f"[{interview_type}] round {i+1} failed: {status} {body}"
        chat_history.append({"role": "user", "text": answers[i]})
        chat_history.append({"role": "model", "text": body["response"]})

    # interruption + resume
    restored_history = json.loads(json.dumps(chat_history, ensure_ascii=False))
    for i in range(3, 5):
        status, body = _post_json(
            client,
            "/api/ai/chat",
            {
                "message": answers[i],
                "mode": "interview",
                "resumeData": resume_data,
                "jobDescription": jd,
                "chatHistory": restored_history,
                "interviewType": interview_type,
            },
            local_headers,
        )
        assert status == 200 and isinstance(body.get("response"), str), f"[{interview_type}] resumed round {i+1} failed: {status} {body}"
        restored_history.append({"role": "user", "text": answers[i]})
        restored_history.append({"role": "model", "text": body["response"]})

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
        local_headers,
    )
    assert status == 200 and isinstance(summary.get("response"), str), f"[{interview_type}] summary failed: {status} {summary}"
    score = _extract_score(summary["response"])
    assert score is not None, f"[{interview_type}] summary missing score"

    return {
        "interviewType": interview_type,
        "planQuestionCount": len(questions),
        "roundCount": 5,
        "summaryScore": score,
        "summarySnippet": summary["response"][:120],
        "result": "PASS",
    }


def main() -> int:
    os.environ["USE_MOCK_STORAGE"] = "true"
    os.environ.setdefault("JWT_SECRET", "test-secret-32-bytes-minimum-key!!")
    os.environ.setdefault("PII_GUARD_MODE", "warn")

    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    sys.path.insert(0, os.path.join(repo_root, "backend"))
    import app as backend_app_module  # pylint: disable=import-error

    app = backend_app_module.app
    client = app.test_client()

    # global headers placeholder (scene creates its own user/token)
    headers = {}

    scenes = ["general", "hr", "technical"]
    results = []
    for scene in scenes:
        results.append(_run_scene(client, headers, scene))

    print(json.dumps({"result": "PASS", "scenes": results}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
