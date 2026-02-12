#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LLM-as-judge A/B test for RAG ON vs OFF on /api/ai/analyze.

Example:
  python backend/ab_judge_rag.py ^
    --payload backend/payload.json ^
    --runs 5 ^
    --url https://career-hero-backend-production-a634.up.railway.app/api/ai/analyze ^
    --token <JWT> ^
    --gemini-api-key <GEMINI_API_KEY>
"""

import argparse
import json
import os
import random
import statistics
import time
from typing import Any, Dict, List, Optional, Tuple

import requests
from requests.exceptions import RequestException
import google.genai as genai
from google.genai import types


def load_payload(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if "resumeData" in data:
        return {"resumeData": data.get("resumeData"), "jobDescription": data.get("jobDescription", "")}
    return {"resumeData": data, "jobDescription": ""}


def post_analyze(
    url: str,
    token: str,
    payload: Dict[str, Any],
    rag_enabled: bool,
    timeout: int = 90,
    retries: int = 2,
) -> Dict[str, Any]:
    req = dict(payload)
    req["ragEnabled"] = rag_enabled
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token.strip()}"

    t0 = time.time()
    session = requests.Session()
    session.trust_env = False
    last_exc = None
    resp = None
    for _ in range(max(1, retries + 1)):
        try:
            resp = session.post(
                url,
                headers=headers,
                data=json.dumps(req, ensure_ascii=False).encode("utf-8"),
                timeout=timeout,
            )
            last_exc = None
            break
        except RequestException as e:
            last_exc = e
            time.sleep(0.5)
    elapsed_ms = round((time.time() - t0) * 1000, 2)
    if resp is None:
        return {"ok": False, "status": 0, "elapsed_ms": elapsed_ms, "error": str(last_exc), "json": None}
    try:
        body = resp.json()
    except Exception:
        body = None
    return {"ok": resp.ok, "status": resp.status_code, "elapsed_ms": elapsed_ms, "error": None, "json": body}


def compact_for_judge(body: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(body, dict):
        return {}
    return {
        "score": body.get("score"),
        "summary": body.get("summary"),
        "suggestions": body.get("suggestions", []),
        "missingKeywords": body.get("missingKeywords", []),
    }


def safe_json_loads(text: str) -> Optional[Dict[str, Any]]:
    try:
        return json.loads(text)
    except Exception:
        pass
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except Exception:
            return None
    return None


def judge_pair(
    client: genai.Client,
    model: str,
    resume_data: Dict[str, Any],
    jd_text: str,
    off_body: Dict[str, Any],
    on_body: Dict[str, Any],
) -> Dict[str, Any]:
    left_is_on = random.random() < 0.5
    left = on_body if left_is_on else off_body
    right = off_body if left_is_on else on_body

    prompt = f"""
你是一位严格的简历优化评审官。请盲评两个候选分析结果，不要偏向任一侧。

评审输入：
- 原始简历数据（resumeData）：
{json.dumps(resume_data, ensure_ascii=False)}

- JD：
{jd_text}

- 候选 LEFT：
{json.dumps(compact_for_judge(left), ensure_ascii=False)}

- 候选 RIGHT：
{json.dumps(compact_for_judge(right), ensure_ascii=False)}

请按以下维度对 LEFT 和 RIGHT 分别 1-5 分打分：
1) jd_relevance（与JD匹配度）
2) actionability（建议可直接采纳程度）
3) factuality（是否编造、是否基于简历事实）
4) skill_precision（技能是否是硬技能名词，是否避免泛词）
5) writing_quality（表达清晰、无噪声）

输出严格 JSON（不要解释）：
{{
  "winner": "left|right|tie",
  "left": {{
    "jd_relevance": 1,
    "actionability": 1,
    "factuality": 1,
    "skill_precision": 1,
    "writing_quality": 1,
    "overall": 1.0
  }},
  "right": {{
    "jd_relevance": 1,
    "actionability": 1,
    "factuality": 1,
    "skill_precision": 1,
    "writing_quality": 1,
    "overall": 1.0
  }},
  "reason": "一句话说明胜负依据"
}}
"""

    resp = client.models.generate_content(
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(response_mime_type="application/json")
    )
    text = (resp.text or "").strip()
    data = safe_json_loads(text)
    if not data:
        raise RuntimeError(f"judge parse failed: {text[:400]}")

    winner = data.get("winner", "tie")
    if winner == "left":
        winner_real = "on" if left_is_on else "off"
    elif winner == "right":
        winner_real = "off" if left_is_on else "on"
    else:
        winner_real = "tie"

    left_score = data.get("left", {})
    right_score = data.get("right", {})
    on_score = left_score if left_is_on else right_score
    off_score = right_score if left_is_on else left_score

    return {
        "winner_real": winner_real,
        "reason": data.get("reason", ""),
        "on": on_score,
        "off": off_score,
        "raw": data,
    }


def avg_dim(rows: List[Dict[str, Any]], side: str, dim: str) -> float:
    vals = []
    for r in rows:
        v = r.get(side, {}).get(dim)
        if isinstance(v, (int, float)):
            vals.append(float(v))
    return round(statistics.mean(vals), 3) if vals else 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--payload", required=True)
    ap.add_argument("--runs", type=int, default=5)
    ap.add_argument("--url", default=os.getenv("ANALYZE_URL", "http://127.0.0.1:5000/api/ai/analyze"))
    ap.add_argument("--token", default=os.getenv("BACKEND_JWT_TOKEN", ""))
    ap.add_argument("--gemini-api-key", default=os.getenv("GEMINI_API_KEY", ""))
    ap.add_argument("--judge-model", default=os.getenv("GEMINI_JUDGE_MODEL", "gemini-2.5-flash-lite"))
    ap.add_argument("--timeout", type=int, default=90)
    ap.add_argument("--retries", type=int, default=2)
    ap.add_argument("--sleep-ms", type=int, default=300)
    ap.add_argument("--out", default="", help="Optional output json file path")
    args = ap.parse_args()

    if not args.gemini_api_key:
        raise SystemExit("Missing --gemini-api-key or GEMINI_API_KEY")

    payload = load_payload(args.payload)
    resume_data = payload.get("resumeData", {})
    jd_text = payload.get("jobDescription", "")
    client = genai.Client(api_key=args.gemini_api_key)

    judged_rows = []
    failures = 0
    run_records = []

    print(f"Target URL: {args.url}")
    print(f"Runs: {args.runs}")
    for i in range(args.runs):
        off = post_analyze(args.url, args.token, payload, rag_enabled=False, timeout=args.timeout, retries=args.retries)
        on = post_analyze(args.url, args.token, payload, rag_enabled=True, timeout=args.timeout, retries=args.retries)

        if not off.get("ok") or not on.get("ok") or not isinstance(off.get("json"), dict) or not isinstance(on.get("json"), dict):
            failures += 1
            print(f"#{i+1} analyze failed: off_status={off.get('status')} on_status={on.get('status')}")
            run_records.append({
                "run": i + 1,
                "stage": "analyze",
                "off": off,
                "on": on,
                "judge": None
            })
            time.sleep(max(args.sleep_ms, 0) / 1000.0)
            continue

        try:
            judged = judge_pair(
                client=client,
                model=args.judge_model,
                resume_data=resume_data,
                jd_text=jd_text,
                off_body=off["json"],
                on_body=on["json"],
            )
            judged_rows.append(judged)
            print(
                f"#{i+1} winner={judged['winner_real']} "
                f"on_overall={judged.get('on', {}).get('overall')} "
                f"off_overall={judged.get('off', {}).get('overall')}"
            )
            run_records.append({
                "run": i + 1,
                "stage": "ok",
                "off": {
                    "status": off.get("status"),
                    "elapsed_ms": off.get("elapsed_ms"),
                    "response": compact_for_judge(off.get("json") or {})
                },
                "on": {
                    "status": on.get("status"),
                    "elapsed_ms": on.get("elapsed_ms"),
                    "response": compact_for_judge(on.get("json") or {})
                },
                "judge": judged
            })
        except Exception as e:
            failures += 1
            print(f"#{i+1} judge failed: {e}")
            run_records.append({
                "run": i + 1,
                "stage": "judge_failed",
                "off": {
                    "status": off.get("status"),
                    "elapsed_ms": off.get("elapsed_ms"),
                    "response": compact_for_judge(off.get("json") or {})
                },
                "on": {
                    "status": on.get("status"),
                    "elapsed_ms": on.get("elapsed_ms"),
                    "response": compact_for_judge(on.get("json") or {})
                },
                "judge_error": str(e)
            })
        time.sleep(max(args.sleep_ms, 0) / 1000.0)

    on_wins = sum(1 for r in judged_rows if r.get("winner_real") == "on")
    off_wins = sum(1 for r in judged_rows if r.get("winner_real") == "off")
    ties = sum(1 for r in judged_rows if r.get("winner_real") == "tie")
    total = len(judged_rows)

    dims = ["jd_relevance", "actionability", "factuality", "skill_precision", "writing_quality", "overall"]
    print("\n=== LLM Judge Summary ===")
    print(f"evaluated_runs: {total}")
    print(f"failures: {failures}")
    print(f"on_wins: {on_wins}")
    print(f"off_wins: {off_wins}")
    print(f"ties: {ties}")
    print(f"on_win_rate: {round(on_wins / total, 4) if total else 0.0}")

    print("\n--- Avg Scores (ON vs OFF) ---")
    score_summary = {}
    for d in dims:
        on_avg = avg_dim(judged_rows, "on", d)
        off_avg = avg_dim(judged_rows, "off", d)
        print(f"{d}: on={on_avg} off={off_avg} delta={round(on_avg - off_avg, 3)}")
        score_summary[d] = {
            "on": on_avg,
            "off": off_avg,
            "delta": round(on_avg - off_avg, 3),
        }

    if args.out:
        output = {
            "meta": {
                "url": args.url,
                "runs": args.runs,
                "judge_model": args.judge_model,
            },
            "summary": {
                "evaluated_runs": total,
                "failures": failures,
                "on_wins": on_wins,
                "off_wins": off_wins,
                "ties": ties,
                "on_win_rate": round(on_wins / total, 4) if total else 0.0,
                "scores": score_summary,
            },
            "runs": run_records,
        }
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(output, f, ensure_ascii=False, indent=2)
        print(f"\nSaved report to: {args.out}")


if __name__ == "__main__":
    main()
