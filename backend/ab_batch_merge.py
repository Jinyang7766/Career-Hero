#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Batch runner + merger for A/B judge reports.

What it does:
1) Runs ab_judge_rag.py for multiple payloads with a higher runs value.
2) Merges newly generated reports with existing report files (e.g. current rerun output).

Example:
  python backend/ab_batch_merge.py \
    --runs 20 \
    --payloads backend/payload_samples/payload_01_ecom_aigc.json backend/payload_samples/payload_03_finance_analysis.json backend/payload_samples/payload_04_operations_supply_chain.json \
    --include-reports backend/ab_report_02_rerun.json \
    --url https://career-hero-backend-production-a634.up.railway.app/api/ai/analyze \
    --token <JWT> \
    --gemini-api-key <GEMINI_API_KEY> \
    --judge-model gemini-2.5-flash
"""

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Tuple


SCORE_DIMS = ["jd_relevance", "actionability", "factuality", "skill_precision", "writing_quality", "overall"]
HARD_DIMS = ["jd_keyword_coverage_rate", "suggestion_schema_valid_rate", "skill_hard_term_ratio", "placeholder_leak_rate"]


def load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def safe_float(v: Any) -> float:
    if isinstance(v, (int, float)):
        return float(v)
    return 0.0


def run_single_report(
    python_exe: str,
    judge_script: Path,
    payload: Path,
    runs: int,
    url: str,
    token: str,
    refresh_token: str,
    supabase_url: str,
    supabase_anon_key: str,
    gemini_api_key: str,
    judge_model: str,
    sleep_ms: int,
    out_file: Path,
) -> Tuple[bool, str]:
    cmd = [
        python_exe,
        str(judge_script),
        "--payload", str(payload),
        "--runs", str(runs),
        "--url", url,
        "--token", token,
        "--refresh-token", refresh_token,
        "--supabase-url", supabase_url,
        "--supabase-anon-key", supabase_anon_key,
        "--gemini-api-key", gemini_api_key,
        "--judge-model", judge_model,
        "--sleep-ms", str(sleep_ms),
        "--out", str(out_file),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    ok = proc.returncode == 0 and out_file.exists()
    log = (proc.stdout or "") + ("\n" + proc.stderr if proc.stderr else "")
    return ok, log


def weighted_metric(reports: List[Dict[str, Any]], key: str, dims: List[str]) -> Dict[str, Any]:
    weighted = {}
    for dim in dims:
        on_num = 0.0
        off_num = 0.0
        den = 0.0
        for rep in reports:
            summary = rep.get("data", {}).get("summary", {})
            runs = int(summary.get("evaluated_runs", 0) or 0)
            if runs <= 0:
                continue
            item = summary.get(key, {}).get(dim, {})
            on_num += safe_float(item.get("on")) * runs
            off_num += safe_float(item.get("off")) * runs
            den += runs
        if den > 0:
            on_avg = round(on_num / den, 4)
            off_avg = round(off_num / den, 4)
            weighted[dim] = {
                "on": on_avg,
                "off": off_avg,
                "delta": round(on_avg - off_avg, 4),
            }
        else:
            weighted[dim] = {"on": 0.0, "off": 0.0, "delta": 0.0}
    return weighted


def build_merged_report(reports: List[Dict[str, Any]]) -> Dict[str, Any]:
    total_evaluated = 0
    total_failures = 0
    total_on_wins = 0
    total_off_wins = 0
    total_ties = 0

    for rep in reports:
        summary = rep.get("data", {}).get("summary", {})
        total_evaluated += int(summary.get("evaluated_runs", 0) or 0)
        total_failures += int(summary.get("failures", 0) or 0)
        total_on_wins += int(summary.get("on_wins", 0) or 0)
        total_off_wins += int(summary.get("off_wins", 0) or 0)
        total_ties += int(summary.get("ties", 0) or 0)

    score_weighted = weighted_metric(reports, "scores", SCORE_DIMS)
    hard_weighted = weighted_metric(reports, "hard_metrics", HARD_DIMS)

    return {
        "meta": {
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "report_count": len(reports),
        },
        "summary": {
            "evaluated_runs": total_evaluated,
            "failures": total_failures,
            "on_wins": total_on_wins,
            "off_wins": total_off_wins,
            "ties": total_ties,
            "on_win_rate": round(total_on_wins / total_evaluated, 4) if total_evaluated > 0 else 0.0,
            "scores": score_weighted,
            "hard_metrics": hard_weighted,
        },
        "reports": [
            {
                "source_type": rep.get("source_type"),
                "path": rep.get("path"),
                "meta": rep.get("data", {}).get("meta", {}),
                "summary": rep.get("data", {}).get("summary", {}),
            }
            for rep in reports
        ],
    }


def build_judge_consistency(reports: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Compute judge consistency on generated reports:
    - full_agreement_rate across all available judge models per (payload, run)
    - pairwise agreement rate between judge models
    """
    buckets: Dict[Tuple[str, int], Dict[str, str]] = {}
    model_set = set()

    for rep in reports:
        if rep.get("source_type") != "generated":
            continue
        payload = rep.get("payload", "")
        judge_model = rep.get("data", {}).get("meta", {}).get("judge_model", "")
        if not payload or not judge_model:
            continue
        model_set.add(judge_model)
        for row in rep.get("data", {}).get("runs", []):
            if row.get("stage") != "ok":
                continue
            run_no = int(row.get("run", 0) or 0)
            winner = row.get("judge", {}).get("winner_real")
            if run_no <= 0 or not winner:
                continue
            key = (payload, run_no)
            if key not in buckets:
                buckets[key] = {}
            buckets[key][judge_model] = winner

    full_total = 0
    full_agree = 0
    for _, model_winners in buckets.items():
        if len(model_winners) < 2:
            continue
        full_total += 1
        if len(set(model_winners.values())) == 1:
            full_agree += 1

    models = sorted(model_set)
    pairwise: Dict[str, Dict[str, Any]] = {}
    for i in range(len(models)):
        for j in range(i + 1, len(models)):
            m1 = models[i]
            m2 = models[j]
            compared = 0
            agree = 0
            for _, model_winners in buckets.items():
                if m1 in model_winners and m2 in model_winners:
                    compared += 1
                    if model_winners[m1] == model_winners[m2]:
                        agree += 1
            key = f"{m1}__vs__{m2}"
            pairwise[key] = {
                "compared": compared,
                "agree": agree,
                "agreement_rate": round(agree / compared, 4) if compared > 0 else 0.0,
            }

    return {
        "judge_models": models,
        "comparable_run_keys": full_total,
        "full_agreement": full_agree,
        "full_agreement_rate": round(full_agree / full_total, 4) if full_total > 0 else 0.0,
        "pairwise": pairwise,
    }


def build_markdown_report(merged: Dict[str, Any]) -> str:
    summary = merged.get("summary", {})
    scores = summary.get("scores", {})
    hard = summary.get("hard_metrics", {})
    consistency = merged.get("judge_consistency", {})

    lines: List[str] = []
    lines.append("# A/B Test Merged Summary")
    lines.append("")
    lines.append("## Overall")
    lines.append(f"- evaluated_runs: {summary.get('evaluated_runs', 0)}")
    lines.append(f"- failures: {summary.get('failures', 0)}")
    lines.append(f"- on_wins: {summary.get('on_wins', 0)}")
    lines.append(f"- off_wins: {summary.get('off_wins', 0)}")
    lines.append(f"- ties: {summary.get('ties', 0)}")
    lines.append(f"- on_win_rate: {summary.get('on_win_rate', 0.0)}")
    lines.append("")

    lines.append("## Score Deltas (ON - OFF)")
    lines.append("| Dimension | ON | OFF | Delta |")
    lines.append("|---|---:|---:|---:|")
    for dim in SCORE_DIMS:
        item = scores.get(dim, {})
        lines.append(f"| {dim} | {item.get('on', 0)} | {item.get('off', 0)} | {item.get('delta', 0)} |")
    lines.append("")

    lines.append("## Hard Metric Deltas (ON - OFF)")
    lines.append("| Metric | ON | OFF | Delta |")
    lines.append("|---|---:|---:|---:|")
    for dim in HARD_DIMS:
        item = hard.get(dim, {})
        lines.append(f"| {dim} | {item.get('on', 0)} | {item.get('off', 0)} | {item.get('delta', 0)} |")
    lines.append("")

    lines.append("## Judge Consistency")
    lines.append(f"- judge_models: {', '.join(consistency.get('judge_models', []))}")
    lines.append(f"- comparable_run_keys: {consistency.get('comparable_run_keys', 0)}")
    lines.append(f"- full_agreement: {consistency.get('full_agreement', 0)}")
    lines.append(f"- full_agreement_rate: {consistency.get('full_agreement_rate', 0.0)}")
    lines.append("")
    lines.append("### Pairwise Agreement")
    lines.append("| Pair | Compared | Agree | Agreement Rate |")
    lines.append("|---|---:|---:|---:|")
    for pair_key, item in consistency.get("pairwise", {}).items():
        pair_label = pair_key.replace("__vs__", " vs ")
        lines.append(
            f"| {pair_label} | {item.get('compared', 0)} | {item.get('agree', 0)} | {item.get('agreement_rate', 0.0)} |"
        )
    lines.append("")

    lines.append("## Included Reports")
    for rep in merged.get("reports", []):
        meta = rep.get("meta", {})
        rep_sum = rep.get("summary", {})
        lines.append(
            f"- {rep.get('source_type')} | `{rep.get('path')}` | runs={rep_sum.get('evaluated_runs', 0)} | "
            f"on/off/tie={rep_sum.get('on_wins', 0)}/{rep_sum.get('off_wins', 0)}/{rep_sum.get('ties', 0)} | "
            f"judge={meta.get('judge_model', '')}"
        )
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=20, help="Runs per payload")
    parser.add_argument(
        "--payloads",
        nargs="+",
        default=[
            "backend/payload_samples/payload_01_ecom_aigc.json",
            "backend/payload_samples/payload_03_finance_analysis.json",
            "backend/payload_samples/payload_04_operations_supply_chain.json",
        ],
        help="Payload files for new runs",
    )
    parser.add_argument(
        "--include-reports",
        nargs="*",
        default=["backend/ab_report_02_rerun.json"],
        help="Existing report files to merge",
    )
    parser.add_argument("--url", default=os.getenv("ANALYZE_URL", ""))
    parser.add_argument("--token", default=os.getenv("BACKEND_JWT_TOKEN", ""))
    parser.add_argument("--refresh-token", default=os.getenv("BACKEND_REFRESH_TOKEN", ""))
    parser.add_argument("--supabase-url", default=os.getenv("SUPABASE_URL", ""))
    parser.add_argument("--supabase-anon-key", default=os.getenv("SUPABASE_ANON_KEY", ""))
    parser.add_argument("--gemini-api-key", default=os.getenv("GEMINI_API_KEY", ""))
    parser.add_argument("--judge-model", default=os.getenv("GEMINI_JUDGE_MODEL", "gemini-2.5-flash"))
    parser.add_argument(
        "--judge-models",
        nargs="+",
        default=[],
        help="Run multiple judge models on the same payload set (overrides --judge-model)",
    )
    parser.add_argument("--sleep-ms", type=int, default=300)
    parser.add_argument("--out-dir", default="backend/ab_reports_batch")
    parser.add_argument("--merged-out", default="")
    parser.add_argument("--markdown-out", default="", help="Optional markdown summary output path")
    parser.add_argument("--keep-going", action="store_true", help="Continue when one payload run fails")
    args = parser.parse_args()

    if not args.url:
        print("ERROR: missing --url (or ANALYZE_URL env)")
        return 2
    if not args.token:
        print("ERROR: missing --token (or BACKEND_JWT_TOKEN env)")
        return 2
    if not args.gemini_api_key:
        print("ERROR: missing --gemini-api-key (or GEMINI_API_KEY env)")
        return 2

    root = Path.cwd()
    judge_script = root / "backend" / "ab_judge_rag.py"
    if not judge_script.exists():
        print(f"ERROR: judge script not found: {judge_script}")
        return 2

    out_dir = root / args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    merged_out = Path(args.merged_out) if args.merged_out else out_dir / f"ab_merged_{ts}.json"
    markdown_out = Path(args.markdown_out) if args.markdown_out else out_dir / f"ab_merged_{ts}.md"
    judge_models = args.judge_models if args.judge_models else [args.judge_model]

    generated_reports: List[Dict[str, Any]] = []
    for payload_str in args.payloads:
        payload = Path(payload_str)
        if not payload.exists():
            print(f"[SKIP] payload not found: {payload}")
            if not args.keep_going:
                return 1
            continue
        stem = payload.stem

        for judge_model in judge_models:
            model_tag = "".join(ch if ch.isalnum() else "_" for ch in judge_model).strip("_")
            out_file = out_dir / f"{stem}_{model_tag}_runs{args.runs}_{ts}.json"
            print(f"[RUN ] payload={payload} runs={args.runs} judge={judge_model}")
            ok, log = run_single_report(
                python_exe=sys.executable,
                judge_script=judge_script,
                payload=payload,
                runs=args.runs,
                url=args.url,
                token=args.token,
                refresh_token=args.refresh_token,
                supabase_url=args.supabase_url,
                supabase_anon_key=args.supabase_anon_key,
                gemini_api_key=args.gemini_api_key,
                judge_model=judge_model,
                sleep_ms=args.sleep_ms,
                out_file=out_file,
            )
            if not ok:
                print(f"[FAIL] payload={payload} judge={judge_model}")
                print(log[-2000:])
                if not args.keep_going:
                    return 1
                continue
            report_data = load_json(out_file)
            generated_reports.append({
                "source_type": "generated",
                "path": str(out_file),
                "payload": str(payload),
                "judge_model": judge_model,
                "data": report_data,
            })
            print(f"[ OK ] saved {out_file}")

    included_reports: List[Dict[str, Any]] = []
    for report_str in args.include_reports:
        report_path = Path(report_str)
        if not report_path.exists():
            print(f"[SKIP] include report not found: {report_path}")
            continue
        included_reports.append({
            "source_type": "included",
            "path": str(report_path),
            "data": load_json(report_path),
        })
        print(f"[ADD ] include {report_path}")

    all_reports = generated_reports + included_reports
    if not all_reports:
        print("ERROR: no reports to merge")
        return 1

    merged = build_merged_report(all_reports)
    merged["judge_consistency"] = build_judge_consistency(generated_reports)
    merged_out.parent.mkdir(parents=True, exist_ok=True)
    with merged_out.open("w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)
    with markdown_out.open("w", encoding="utf-8") as f:
        f.write(build_markdown_report(merged))

    summary = merged.get("summary", {})
    print("\n=== MERGED SUMMARY ===")
    print(f"evaluated_runs: {summary.get('evaluated_runs')}")
    print(f"on_wins/off_wins/ties: {summary.get('on_wins')}/{summary.get('off_wins')}/{summary.get('ties')}")
    print(f"on_win_rate: {summary.get('on_win_rate')}")
    cons = merged.get("judge_consistency", {})
    print(
        "judge_consistency(full_agreement_rate): "
        f"{cons.get('full_agreement_rate')} "
        f"(keys={cons.get('comparable_run_keys')})"
    )
    print(f"saved_merged: {merged_out}")
    print(f"saved_markdown: {markdown_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
