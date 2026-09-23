import type { EvidenceAnalytics, EvidenceSafety } from '@/contract/types'

/** Layout-only sample, shown with a SAMPLE badge when the URL has ?sample=1. Never a result. */
export const EVIDENCE_SAMPLE: { safety: EvidenceSafety; analytics: EvidenceAnalytics } = {
  safety: {
    median_warning_b0_s: 3.1, median_warning_m1_s: 4.6, false_alarms_per_hour_b0: 0.6, false_alarms_per_hour_m1: 0.6,
    near_miss_warned_pct: 93, guardrail_hard_pct: 100, shipped_model: 'M1',
    warning_hist: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((b) => ({ bin_s: b, b0: [2, 5, 9, 12, 7, 3, 1, 0, 0][b], m1: [1, 2, 4, 7, 10, 9, 5, 2, 1][b] })),
    ablation: [
      { variant: 'Full model', median_warning_s: 4.6, false_alarms_per_hour: 0.6 },
      { variant: 'Without trend features', median_warning_s: 3.9, false_alarms_per_hour: 0.6 },
      { variant: 'Without swing features', median_warning_s: 3.4, false_alarms_per_hour: 0.6 },
    ],
  },
  analytics: {
    coverage_p10_p90_pct: 81, coverage_raw_pct: 68, p50_mae_min: 6.2, p50_mae_prior_min: 11.5,
    anomaly_recall_pct: 94, anomaly_precision_pct: 88, brief_rows_correct: 4,
    calibration: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((n) => ({ nominal: n, empirical_raw: Math.max(0, n - 0.12 * Math.sin(n * Math.PI)), empirical_cqr: n + 0.02 * Math.sin(n * 6) })),
  },
}

