# A/B Test Merged Summary

## Overall
- evaluated_runs: 123
- failures: 2
- on_wins: 50
- off_wins: 48
- ties: 25
- on_win_rate: 0.4065

## Score Deltas (ON - OFF)
| Dimension | ON | OFF | Delta |
|---|---:|---:|---:|
| jd_relevance | 4.7643 | 4.7318 | 0.0325 |
| actionability | 4.0 | 3.9432 | 0.0568 |
| factuality | 2.374 | 2.3821 | -0.0081 |
| skill_precision | 4.7804 | 4.7316 | 0.0488 |
| writing_quality | 4.9512 | 4.9186 | 0.0326 |
| overall | 4.1061 | 4.0749 | 0.0312 |

## Hard Metric Deltas (ON - OFF)
| Metric | ON | OFF | Delta |
|---|---:|---:|---:|
| jd_keyword_coverage_rate | 0.8581 | 0.8391 | 0.019 |
| suggestion_schema_valid_rate | 1.0 | 0.9993 | 0.0007 |
| skill_hard_term_ratio | 0.3645 | 0.3432 | 0.0213 |
| placeholder_leak_rate | 0.0 | 0.0 | 0.0 |

## Judge Consistency
- judge_models: gemini-2.5-flash, gemini-3-pro-preview
- comparable_run_keys: 58
- full_agreement: 12
- full_agreement_rate: 0.2069

### Pairwise Agreement
| Pair | Compared | Agree | Agreement Rate |
|---|---:|---:|---:|
| gemini-2.5-flash vs gemini-3-pro-preview | 58 | 12 | 0.2069 |

## Included Reports
- generated | `G:\AI_project\Career-Hero\backend\ab_reports_batch\payload_01_ecom_aigc_gemini_2_5_flash_runs20_20260214_132626.json` | runs=20 | on/off/tie=4/7/9 | judge=gemini-2.5-flash
- generated | `G:\AI_project\Career-Hero\backend\ab_reports_batch\payload_01_ecom_aigc_gemini_3_pro_preview_runs20_20260214_132626.json` | runs=20 | on/off/tie=9/11/0 | judge=gemini-3-pro-preview
- generated | `G:\AI_project\Career-Hero\backend\ab_reports_batch\payload_03_finance_analysis_gemini_2_5_flash_runs20_20260214_132626.json` | runs=20 | on/off/tie=5/8/7 | judge=gemini-2.5-flash
- generated | `G:\AI_project\Career-Hero\backend\ab_reports_batch\payload_03_finance_analysis_gemini_3_pro_preview_runs20_20260214_132626.json` | runs=19 | on/off/tie=13/5/1 | judge=gemini-3-pro-preview
- generated | `G:\AI_project\Career-Hero\backend\ab_reports_batch\payload_04_operations_supply_chain_gemini_2_5_flash_runs20_20260214_132626.json` | runs=19 | on/off/tie=4/7/8 | judge=gemini-2.5-flash
- generated | `G:\AI_project\Career-Hero\backend\ab_reports_batch\payload_04_operations_supply_chain_gemini_3_pro_preview_runs20_20260214_132626.json` | runs=20 | on/off/tie=11/9/0 | judge=gemini-3-pro-preview
- included | `backend\ab_report_02_rerun.json` | runs=5 | on/off/tie=4/1/0 | judge=gemini-2.5-flash
