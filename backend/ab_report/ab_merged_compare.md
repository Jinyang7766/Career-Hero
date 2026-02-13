# A/B Test Merged Summary

## Overall
- evaluated_runs: 123
- failures: 2
- on_wins: 56
- off_wins: 65
- ties: 2
- on_win_rate: 0.4553

## Score Deltas (ON - OFF)
| Dimension | ON | OFF | Delta |
|---|---:|---:|---:|
| jd_relevance | 4.8374 | 4.744 | 0.0934 |
| actionability | 4.3292 | 4.3659 | -0.0367 |
| factuality | 3.4471 | 3.6829 | -0.2358 |
| skill_precision | 4.5853 | 4.5447 | 0.0406 |
| writing_quality | 4.8211 | 4.7967 | 0.0244 |
| overall | 4.4058 | 4.4269 | -0.0211 |

## Hard Metric Deltas (ON - OFF)
| Metric | ON | OFF | Delta |
|---|---:|---:|---:|
| jd_keyword_coverage_rate | 0.8672 | 0.831 | 0.0362 |
| suggestion_schema_valid_rate | 1.0 | 0.9919 | 0.0081 |
| skill_hard_term_ratio | 0.3501 | 0.382 | -0.0319 |
| placeholder_leak_rate | 0.0 | 0.0 | 0.0 |

## Judge Consistency
- judge_models: gemini-2.5-flash, gemini-3-pro-preview
- comparable_run_keys: 58
- full_agreement: 30
- full_agreement_rate: 0.5172

### Pairwise Agreement
| Pair | Compared | Agree | Agreement Rate |
|---|---:|---:|---:|
| gemini-2.5-flash vs gemini-3-pro-preview | 58 | 30 | 0.5172 |

## Included Reports
- generated | `G:\AI_project\Career-Hero\backend\ab_reports_batch\payload_01_ecom_aigc_gemini_2_5_flash_runs20_20260213_171752.json` | runs=20 | on/off/tie=8/11/1 | judge=gemini-2.5-flash
- generated | `G:\AI_project\Career-Hero\backend\ab_reports_batch\payload_01_ecom_aigc_gemini_3_pro_preview_runs20_20260213_171752.json` | runs=19 | on/off/tie=9/10/0 | judge=gemini-3-pro-preview
- generated | `G:\AI_project\Career-Hero\backend\ab_reports_batch\payload_03_finance_analysis_gemini_2_5_flash_runs20_20260213_171752.json` | runs=20 | on/off/tie=9/11/0 | judge=gemini-2.5-flash
- generated | `G:\AI_project\Career-Hero\backend\ab_reports_batch\payload_03_finance_analysis_gemini_3_pro_preview_runs20_20260213_171752.json` | runs=19 | on/off/tie=6/13/0 | judge=gemini-3-pro-preview
- generated | `G:\AI_project\Career-Hero\backend\ab_reports_batch\payload_04_operations_supply_chain_gemini_2_5_flash_runs20_20260213_171752.json` | runs=20 | on/off/tie=8/11/1 | judge=gemini-2.5-flash
- generated | `G:\AI_project\Career-Hero\backend\ab_reports_batch\payload_04_operations_supply_chain_gemini_3_pro_preview_runs20_20260213_171752.json` | runs=20 | on/off/tie=12/8/0 | judge=gemini-3-pro-preview
- included | `backend\ab_report_02_rerun.json` | runs=5 | on/off/tie=4/1/0 | judge=gemini-2.5-flash
