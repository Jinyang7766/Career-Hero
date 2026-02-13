# A/B Test Merged Summary

## Overall
- evaluated_runs: 39
- failures: 86
- on_wins: 17
- off_wins: 11
- ties: 11
- on_win_rate: 0.4359

## Score Deltas (ON - OFF)
| Dimension | ON | OFF | Delta |
|---|---:|---:|---:|
| jd_relevance | 4.6925 | 4.5642 | 0.1283 |
| actionability | 3.8462 | 3.6411 | 0.2051 |
| factuality | 2.6409 | 2.3848 | 0.2561 |
| skill_precision | 4.7949 | 4.8205 | -0.0256 |
| writing_quality | 4.7949 | 4.9487 | -0.1538 |
| overall | 4.0888 | 3.9579 | 0.1309 |

## Hard Metric Deltas (ON - OFF)
| Metric | ON | OFF | Delta |
|---|---:|---:|---:|
| jd_keyword_coverage_rate | 0.9487 | 0.9445 | 0.0042 |
| suggestion_schema_valid_rate | 1.0 | 1.0 | 0.0 |
| skill_hard_term_ratio | 0.5082 | 0.4706 | 0.0376 |
| placeholder_leak_rate | 0.0 | 0.0 | 0.0 |

## Judge Consistency
- judge_models: gemini-2.5-flash, gemini-3-pro-preview
- comparable_run_keys: 14
- full_agreement: 4
- full_agreement_rate: 0.2857

### Pairwise Agreement
| Pair | Compared | Agree | Agreement Rate |
|---|---:|---:|---:|
| gemini-2.5-flash vs gemini-3-pro-preview | 14 | 4 | 0.2857 |

## Included Reports
- generated | `G:\AI_project\Career-Hero\backend\ab_reports_batch\payload_01_ecom_aigc_gemini_2_5_flash_runs20_20260213_210010.json` | runs=20 | on/off/tie=6/3/11 | judge=gemini-2.5-flash
- generated | `G:\AI_project\Career-Hero\backend\ab_reports_batch\payload_01_ecom_aigc_gemini_3_pro_preview_runs20_20260213_210010.json` | runs=14 | on/off/tie=7/7/0 | judge=gemini-3-pro-preview
- generated | `G:\AI_project\Career-Hero\backend\ab_reports_batch\payload_03_finance_analysis_gemini_2_5_flash_runs20_20260213_210010.json` | runs=0 | on/off/tie=0/0/0 | judge=gemini-2.5-flash
- generated | `G:\AI_project\Career-Hero\backend\ab_reports_batch\payload_03_finance_analysis_gemini_3_pro_preview_runs20_20260213_210010.json` | runs=0 | on/off/tie=0/0/0 | judge=gemini-3-pro-preview
- generated | `G:\AI_project\Career-Hero\backend\ab_reports_batch\payload_04_operations_supply_chain_gemini_2_5_flash_runs20_20260213_210010.json` | runs=0 | on/off/tie=0/0/0 | judge=gemini-2.5-flash
- generated | `G:\AI_project\Career-Hero\backend\ab_reports_batch\payload_04_operations_supply_chain_gemini_3_pro_preview_runs20_20260213_210010.json` | runs=0 | on/off/tie=0/0/0 | judge=gemini-3-pro-preview
- included | `backend\ab_report_02_rerun.json` | runs=5 | on/off/tie=4/1/0 | judge=gemini-2.5-flash
