#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Simple A/B test runner for /api/ai/analyze with and without RAG.

Usage:
  python backend/ab_test_rag.py --payload payload.json --runs 5 --url https://xxx/api/ai/analyze --token <JWT>

payload.json supports either:
  1) {"resumeData": {...}, "jobDescription": "..."}
  2) {...}  (treated as resumeData only)
"""

import argparse
import json
import os
import statistics
import time
from typing import Any, Dict, List

import requests
from requests.exceptions import RequestException


def load_payload(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if "resumeData" in data:
        return {
            "resumeData": data.get("resumeData"),
            "jobDescription": data.get("jobDescription", "")
        }
    return {"resumeData": data, "jobDescription": ""}


def call_analyze(
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
    session.trust_env = False  # ignore system proxy env to avoid local proxy hijack
    last_exc = None
    resp = None
    for _ in range(max(1, retries + 1)):
        try:
            resp = session.post(
                url,
                headers=headers,
                data=json.dumps(req, ensure_ascii=False).encode("utf-8"),
                timeout=timeout
            )
            last_exc = None
            break
        except RequestException as e:
            last_exc = e
            time.sleep(0.6)
            continue

    if resp is None:
        elapsed_ms = round((time.time() - t0) * 1000, 2)
        return {
            "status": 0,
            "elapsed_ms": elapsed_ms,
            "ok": False,
            "json": None,
            "error": f"request_failed: {last_exc}",
        }
    elapsed_ms = round((time.time() - t0) * 1000, 2)
    out: Dict[str, Any] = {
        "status": resp.status_code,
        "elapsed_ms": elapsed_ms,
        "ok": resp.ok,
        "json": None,
        "error": None,
    }
    try:
        out["json"] = resp.json()
    except Exception:
        out["error"] = resp.text[:500]
    return out


def collect_metrics(result: Dict[str, Any]) -> Dict[str, Any]:
    if not result.get("ok") or not isinstance(result.get("json"), dict):
        return {
            "ok": 0,
            "elapsed_ms": result.get("elapsed_ms", 0),
            "score": None,
            "suggestion_count": 0,
            "skills_suggestion_count": 0,
            "skills_term_count": 0,
            "reference_cases_count": 0,
            "missing_keywords_count": 0,
        }

    body = result["json"]
    suggestions = body.get("suggestions", []) or []
    skill_suggestions = [
        s for s in suggestions
        if isinstance(s, dict) and str(s.get("targetSection", "")).lower() in ("skills", "skill")
    ]
    skills_terms = 0
    for s in skill_suggestions:
        v = s.get("suggestedValue")
        if isinstance(v, list):
            skills_terms += len(v)
        elif isinstance(v, str) and v.strip():
            skills_terms += len([x for x in v.replace("，", ",").split(",") if x.strip()])

    return {
        "ok": 1,
        "elapsed_ms": result.get("elapsed_ms", 0),
        "score": body.get("score"),
        "suggestion_count": len(suggestions),
        "skills_suggestion_count": len(skill_suggestions),
        "skills_term_count": skills_terms,
        "reference_cases_count": len(body.get("reference_cases", []) or []),
        "missing_keywords_count": len(body.get("missingKeywords", []) or []),
    }


def summarize(metrics_list: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not metrics_list:
        return {}
    ok_runs = [m for m in metrics_list if m.get("ok") == 1]
    def avg(key: str) -> float:
        vals = [m[key] for m in ok_runs if isinstance(m.get(key), (int, float))]
        return round(statistics.mean(vals), 2) if vals else 0.0
    return {
        "runs": len(metrics_list),
        "ok_runs": len(ok_runs),
        "success_rate": round(len(ok_runs) / len(metrics_list), 4) if metrics_list else 0.0,
        "avg_elapsed_ms": avg("elapsed_ms"),
        "avg_score": avg("score"),
        "avg_suggestion_count": avg("suggestion_count"),
        "avg_skills_suggestion_count": avg("skills_suggestion_count"),
        "avg_skills_term_count": avg("skills_term_count"),
        "avg_reference_cases_count": avg("reference_cases_count"),
        "avg_missing_keywords_count": avg("missing_keywords_count"),
    }


def print_group(title: str, summary: Dict[str, Any]):
    print(f"\n=== {title} ===")
    for k, v in summary.items():
        print(f"{k}: {v}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--payload", required=True, help="Path to JSON payload or resumeData JSON")
    parser.add_argument("--runs", type=int, default=5, help="Runs per group")
    parser.add_argument("--url", default=os.getenv("ANALYZE_URL", "http://127.0.0.1:5000/api/ai/analyze"))
    parser.add_argument("--token", default=os.getenv("BACKEND_JWT_TOKEN", ""))
    parser.add_argument("--timeout", type=int, default=90)
    parser.add_argument("--sleep-ms", type=int, default=300)
    parser.add_argument("--retries", type=int, default=2)
    args = parser.parse_args()

    payload = load_payload(args.payload)

    group_a: List[Dict[str, Any]] = []
    group_b: List[Dict[str, Any]] = []

    print(f"Target URL: {args.url}")
    print(f"Runs per group: {args.runs}")
    print("Running A (ragEnabled=false)...")
    for i in range(args.runs):
        res = call_analyze(args.url, args.token, payload, rag_enabled=False, timeout=args.timeout, retries=args.retries)
        m = collect_metrics(res)
        group_a.append(m)
        print(f"A#{i+1}: status={res['status']} elapsed={m['elapsed_ms']}ms ref_cases={m['reference_cases_count']} suggestions={m['suggestion_count']} err={res.get('error')}")
        time.sleep(max(args.sleep_ms, 0) / 1000.0)

    print("Running B (ragEnabled=true)...")
    for i in range(args.runs):
        res = call_analyze(args.url, args.token, payload, rag_enabled=True, timeout=args.timeout, retries=args.retries)
        m = collect_metrics(res)
        group_b.append(m)
        print(f"B#{i+1}: status={res['status']} elapsed={m['elapsed_ms']}ms ref_cases={m['reference_cases_count']} suggestions={m['suggestion_count']} err={res.get('error')}")
        time.sleep(max(args.sleep_ms, 0) / 1000.0)

    sum_a = summarize(group_a)
    sum_b = summarize(group_b)

    print_group("A: RAG OFF", sum_a)
    print_group("B: RAG ON", sum_b)

    print("\n=== Delta (B - A) ===")
    comparable_keys = [
        "avg_elapsed_ms",
        "avg_score",
        "avg_suggestion_count",
        "avg_skills_suggestion_count",
        "avg_skills_term_count",
        "avg_reference_cases_count",
        "avg_missing_keywords_count",
    ]
    for k in comparable_keys:
        print(f"{k}: {round((sum_b.get(k, 0) - sum_a.get(k, 0)), 2)}")


if __name__ == "__main__":
    main()
