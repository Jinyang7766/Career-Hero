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
import hashlib
import json
import os
import re
import statistics
import time
from typing import Any, Dict, List, Optional, Set, Tuple

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


def refresh_access_token(
    supabase_url: str,
    supabase_anon_key: str,
    refresh_token: str,
    timeout: int = 30,
) -> Optional[str]:
    if not (supabase_url and supabase_anon_key and refresh_token):
        return None
    token_url = supabase_url.rstrip("/") + "/auth/v1/token?grant_type=refresh_token"
    headers = {
        "apikey": supabase_anon_key,
        "Content-Type": "application/json",
    }
    payload = {"refresh_token": refresh_token}
    session = requests.Session()
    session.trust_env = False
    try:
        resp = session.post(token_url, headers=headers, json=payload, timeout=timeout)
        if not resp.ok:
            return None
        data = resp.json()
        access_token = data.get("access_token")
        if isinstance(access_token, str) and access_token.strip():
            return access_token.strip()
        return None
    except Exception:
        return None


def post_analyze(
    url: str,
    auth_state: Dict[str, str],
    payload: Dict[str, Any],
    rag_enabled: bool,
    supabase_url: str = "",
    supabase_anon_key: str = "",
    timeout: int = 90,
    retries: int = 2,
) -> Dict[str, Any]:
    req = dict(payload)
    req["ragEnabled"] = rag_enabled
    headers = {"Content-Type": "application/json"}

    t0 = time.time()
    session = requests.Session()
    session.trust_env = False
    last_exc = None
    resp = None
    refreshed_once = False
    for _ in range(max(1, retries + 1)):
        token = (auth_state.get("access_token") or "").strip()
        if token:
            headers["Authorization"] = f"Bearer {token}"
        else:
            headers.pop("Authorization", None)
        try:
            resp = session.post(
                url,
                headers=headers,
                data=json.dumps(req, ensure_ascii=False).encode("utf-8"),
                timeout=timeout,
            )
            if resp.status_code == 401 and not refreshed_once:
                new_access = refresh_access_token(
                    supabase_url=supabase_url,
                    supabase_anon_key=supabase_anon_key,
                    refresh_token=auth_state.get("refresh_token", ""),
                )
                if new_access:
                    auth_state["access_token"] = new_access
                    refreshed_once = True
                    continue
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
        "reference_cases_count": len(body.get("reference_cases", []) or []),
        "rag_enabled": body.get("rag_enabled"),
        "rag_requested": body.get("rag_requested"),
        "rag_strategy": body.get("rag_strategy"),
    }

def _to_text(obj: Any) -> str:
    if obj is None:
        return ""
    if isinstance(obj, str):
        return obj
    if isinstance(obj, (int, float, bool)):
        return str(obj)
    if isinstance(obj, list):
        return " ".join(_to_text(x) for x in obj)
    if isinstance(obj, dict):
        return " ".join(_to_text(v) for v in obj.values())
    return str(obj)


def extract_jd_terms(jd_text: str) -> Set[str]:
    if not jd_text:
        return set()
    # english technical terms
    en_terms = {w.lower() for w in re.findall(r"[A-Za-z][A-Za-z0-9+/#\-.]{2,}", jd_text)}
    # chinese chunks
    zh_parts = re.split(r"[，。；：\s、\n\r\t\-\(\)（）]+", jd_text)
    zh_terms = {p for p in zh_parts if 2 <= len(p) <= 10}
    stop_zh = {"岗位", "职责", "要求", "负责", "熟悉", "具备", "经验", "能力", "相关", "以上", "优先"}
    zh_terms = {t for t in zh_terms if t not in stop_zh}
    return en_terms.union(zh_terms)


def collect_hard_metrics(result_body: Dict[str, Any], jd_text: str) -> Dict[str, float]:
    if not isinstance(result_body, dict):
        return {
            "jd_keyword_coverage_rate": 0.0,
            "suggestion_schema_valid_rate": 0.0,
            "skill_hard_term_ratio": 0.0,
            "placeholder_leak_rate": 0.0,
        }

    suggestions = result_body.get("suggestions", []) or []
    suggestions = [s for s in suggestions if isinstance(s, dict)]
    total_s = len(suggestions)

    # 1) JD keyword coverage over output text
    terms = extract_jd_terms(jd_text)
    output_text = _to_text(result_body.get("summary", "")) + " " + _to_text(suggestions)
    output_text_l = output_text.lower()
    matched = 0
    for t in terms:
        t_l = t.lower()
        if t_l and t_l in output_text_l:
            matched += 1
    coverage = (matched / len(terms)) if terms else 0.0

    # 2) Suggestion schema validity
    required = {"title", "reason", "targetSection", "suggestedValue"}
    valid = 0
    for s in suggestions:
        if all(k in s and s.get(k) not in (None, "") for k in required):
            valid += 1
    schema_valid_rate = (valid / total_s) if total_s else 0.0

    # 3) Skill hard term ratio
    hard_pat = re.compile(
        r"(sql|python|java|javascript|typescript|excel|tableau|power\s?bi|scrm|crm|ltv|roi|cpc|cpa|cpm|gmv|erp|wms|sap|vba|ga4|seo|sem|a/b|ab\s?test|"
        r"生意参谋|京东商智|万相台|直通车|引力魔方|京东快车|千川|巨量引擎|zapier|make|coze|dify|n8n|figma|copilot|notion|chatgpt)",
        re.IGNORECASE
    )
    skill_terms = []
    for s in suggestions:
        ts = str(s.get("targetSection", "")).lower()
        if ts in ("skills", "skill"):
            sv = s.get("suggestedValue")
            if isinstance(sv, list):
                skill_terms.extend([_to_text(x).strip() for x in sv if _to_text(x).strip()])
            elif isinstance(sv, str) and sv.strip():
                skill_terms.extend([x.strip() for x in re.split(r"[,，;；、\n]+", sv) if x.strip()])
    if skill_terms:
        hard_cnt = sum(1 for t in skill_terms if hard_pat.search(t))
        skill_hard_ratio = hard_cnt / len(skill_terms)
    else:
        skill_hard_ratio = 0.0

    # 4) Placeholder leak rate
    leak_pat = re.compile(r"(\[\[(COMPANY|ADDRESS|EMAIL|PHONE)_\d+\]\]|(COMPANY|ADDRESS|EMAIL|PHONE)_\d+)")
    leak_hits = sum(1 for s in suggestions if leak_pat.search(_to_text(s)))
    placeholder_leak_rate = (leak_hits / total_s) if total_s else 0.0

    return {
        "jd_keyword_coverage_rate": round(coverage, 4),
        "suggestion_schema_valid_rate": round(schema_valid_rate, 4),
        "skill_hard_term_ratio": round(skill_hard_ratio, 4),
        "placeholder_leak_rate": round(placeholder_leak_rate, 4),
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
    # Deterministic side assignment to reduce positional bias variance across judge models.
    off_sig = json.dumps(compact_for_judge(off_body), ensure_ascii=False, sort_keys=True)
    on_sig = json.dumps(compact_for_judge(on_body), ensure_ascii=False, sort_keys=True)
    digest = hashlib.sha256((off_sig + "||" + on_sig).encode("utf-8")).hexdigest()
    left_is_on = int(digest[-1], 16) % 2 == 0
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

请按以下维度对 LEFT 和 RIGHT 分别 1-5 分打分，必须使用整数分。
评分锚点（统一口径）：
1) jd_relevance（权重 35%）
- 5: 关键职责/关键词高覆盖，几乎逐条命中 JD
- 3: 仅部分命中，存在明显缺口
- 1: 与 JD 关系弱
2) actionability（权重 25%）
- 5: 建议可直接粘贴到简历，具体且可执行
- 3: 有建议但泛化，落地性一般
- 1: 空泛或难执行
3) factuality（权重 20%）
- 5: 基于给定简历事实，无臆造
- 3: 有轻微推断但可接受
- 1: 明显编造/硬套
4) skill_precision（权重 15%）
- 5: 技能为硬技能名词，术语准确
- 3: 混入泛词或动作词
- 1: 大量非技能词
5) writing_quality（权重 5%）
- 5: 清晰简洁，无噪声
- 3: 偶有冗余
- 1: 混乱影响可读性

强制规则：
- 若出现明显臆造事实，factuality 不得高于 2。
- 若建议多数无法直接用于简历，actionability 不得高于 2。

输出严格 JSON（不要解释）：
{{
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
  "reason": "一句话说明关键差异"
}}
"""

    resp = client.models.generate_content(
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0
        )
    )
    text = (resp.text or "").strip()
    data = safe_json_loads(text)
    if not data:
        raise RuntimeError(f"judge parse failed: {text[:400]}")

    left_score = data.get("left", {})
    right_score = data.get("right", {})

    dims = ["jd_relevance", "actionability", "factuality", "skill_precision", "writing_quality"]
    weights = {
        "jd_relevance": 0.35,
        "actionability": 0.25,
        "factuality": 0.20,
        "skill_precision": 0.15,
        "writing_quality": 0.05,
    }

    def _normalize_block(block: Dict[str, Any]) -> Dict[str, float]:
        out: Dict[str, float] = {}
        for d in dims:
            v = block.get(d, 1)
            try:
                fv = float(v)
            except Exception:
                fv = 1.0
            if fv < 1.0:
                fv = 1.0
            if fv > 5.0:
                fv = 5.0
            out[d] = round(fv, 3)
        weighted = sum(out[d] * weights[d] for d in dims)
        out["overall"] = round(weighted, 3)
        return out

    left_score = _normalize_block(left_score if isinstance(left_score, dict) else {})
    right_score = _normalize_block(right_score if isinstance(right_score, dict) else {})

    tie_margin = 0.1
    diff = left_score["overall"] - right_score["overall"]
    if abs(diff) <= tie_margin:
        winner_side = "tie"
        winner_real = "tie"
    elif diff > 0:
        winner_side = "left"
        winner_real = "on" if left_is_on else "off"
    else:
        winner_side = "right"
        winner_real = "off" if left_is_on else "on"

    on_score = left_score if left_is_on else right_score
    off_score = right_score if left_is_on else left_score

    return {
        "winner_real": winner_real,
        "winner_side": winner_side,
        "tie_margin": tie_margin,
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
    ap.add_argument("--refresh-token", default=os.getenv("BACKEND_REFRESH_TOKEN", ""))
    ap.add_argument("--supabase-url", default=os.getenv("SUPABASE_URL", ""))
    ap.add_argument("--supabase-anon-key", default=os.getenv("SUPABASE_ANON_KEY", ""))
    ap.add_argument("--gemini-api-key", default=os.getenv("GEMINI_API_KEY", ""))
    ap.add_argument("--judge-model", default=os.getenv("GEMINI_JUDGE_MODEL", "gemini-3-pro-preview"))
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
    auth_state = {
        "access_token": args.token or "",
        "refresh_token": args.refresh_token or "",
    }

    judged_rows = []
    failures = 0
    run_records = []
    hard_rows = []

    print(f"Target URL: {args.url}")
    print(f"Runs: {args.runs}")
    if auth_state.get("refresh_token") and args.supabase_url and args.supabase_anon_key:
        print("Auth refresh: enabled")
    else:
        print("Auth refresh: disabled")
    for i in range(args.runs):
        off = post_analyze(
            args.url,
            auth_state,
            payload,
            rag_enabled=False,
            supabase_url=args.supabase_url,
            supabase_anon_key=args.supabase_anon_key,
            timeout=args.timeout,
            retries=args.retries,
        )
        on = post_analyze(
            args.url,
            auth_state,
            payload,
            rag_enabled=True,
            supabase_url=args.supabase_url,
            supabase_anon_key=args.supabase_anon_key,
            timeout=args.timeout,
            retries=args.retries,
        )

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
            off_hard = collect_hard_metrics(off["json"], jd_text)
            on_hard = collect_hard_metrics(on["json"], jd_text)
            judged = judge_pair(
                client=client,
                model=args.judge_model,
                resume_data=resume_data,
                jd_text=jd_text,
                off_body=off["json"],
                on_body=on["json"],
            )
            judged_rows.append(judged)
            hard_rows.append({"on": on_hard, "off": off_hard})
            print(
                f"#{i+1} winner={judged['winner_real']} "
                f"on_overall={judged.get('on', {}).get('overall')} "
                f"off_overall={judged.get('off', {}).get('overall')} "
                f"on_ref={len((on.get('json') or {}).get('reference_cases', []) or [])} "
                f"off_ref={len((off.get('json') or {}).get('reference_cases', []) or [])} "
                f"on_strategy={(on.get('json') or {}).get('rag_strategy')} "
                f"off_strategy={(off.get('json') or {}).get('rag_strategy')}"
            )
            run_records.append({
                "run": i + 1,
                "stage": "ok",
                "off": {
                    "status": off.get("status"),
                    "elapsed_ms": off.get("elapsed_ms"),
                    "response": compact_for_judge(off.get("json") or {}),
                    "hard_metrics": off_hard
                },
                "on": {
                    "status": on.get("status"),
                    "elapsed_ms": on.get("elapsed_ms"),
                    "response": compact_for_judge(on.get("json") or {}),
                    "hard_metrics": on_hard
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

    def avg_hard(side: str, key: str) -> float:
        vals = []
        for r in hard_rows:
            v = r.get(side, {}).get(key)
            if isinstance(v, (int, float)):
                vals.append(float(v))
        return round(statistics.mean(vals), 4) if vals else 0.0

    hard_keys = [
        "jd_keyword_coverage_rate",
        "suggestion_schema_valid_rate",
        "skill_hard_term_ratio",
        "placeholder_leak_rate",
    ]
    hard_summary = {}
    print("\n--- Hard Metrics (ON vs OFF) ---")
    for k in hard_keys:
        on_avg = avg_hard("on", k)
        off_avg = avg_hard("off", k)
        delta = round(on_avg - off_avg, 4)
        print(f"{k}: on={on_avg} off={off_avg} delta={delta}")
        hard_summary[k] = {"on": on_avg, "off": off_avg, "delta": delta}

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
                "hard_metrics": hard_summary,
            },
            "runs": run_records,
        }
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(output, f, ensure_ascii=False, indent=2)
        print(f"\nSaved report to: {args.out}")


if __name__ == "__main__":
    main()
