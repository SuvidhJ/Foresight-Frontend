/**
 * TypeScript mirror of shared/contracts.py (docs/05-team-work-split.md).
 *
 * Until shared/contracts.py exists, this file is hand-written from doc 05. Once it exists,
 * regenerate with `npm run gen:types` (scripts/gen_types.py) and replace this file.
 *
 * Fields and models marked PROPOSED are the gaps listed in docs/06-frontend-m3-brief.md.
 * They are optional so the frontend still works if the team doesn't adopt them.
 */

export type Tier = 'log' | 'soft' | 'hard'

export type AlertType =
  | 'proximity'
  | 'stability'
  | 'seatbelt'
  | 'seatbelt_bypass'
  | 'stale_sensor'
  | 'unattended_idle'
  | 'manual'
  | 'emergency'

export type Level = 'guided' | 'standard' | 'expert'
export type TaskType = 'trenching' | 'truck_loading' | 'backfill'

export interface Conditions {
  ground: 'dry' | 'wet' | 'mud'
  mu: number
  visibility_m: number
  rain_mm_h: number
  temp_c: number
  humidity_pct: number
  heat_index_c?: number | null
}

/** Site frame: metres, +x east, +y north. Angles: degrees clockwise from north (PROPOSED convention, gap 1). */
export interface MachineState {
  machine_id: string
  operator_id: string
  x: number
  y: number
  heading_deg: number
  speed_mps: number
  /** Absolute bearing of the boom (PROPOSED: absolute, not relative to tracks). */
  swing_deg: number
  swing_rate_dps: number
  boom_reach_m: number
  load_t: number
  slope_deg: number
  stability_ratio: number
  engine_on: boolean
  belt_fastened: boolean
  seat_occupied: boolean
  hydraulic_lockout: boolean
  motion_commanded: boolean
  fuel_pct: number
}

export interface TrackedObject {
  id: string
  cls: 'person' | 'vehicle' | 'object'
  x: number
  y: number
  vx: number
  vy: number
  t_cpa_s?: number | null
  d_cpa_m?: number | null
  predicted_path?: [number, number][]
}

export interface Zones {
  inner_m: number
  warn_m: number
  outer_m: number
}

export interface AlertEvent {
  alert_id: string
  t: number
  machine_id: string
  operator_id: string
  tier: Tier
  type: AlertType
  source: 'rule' | 'model' | 'operator'
  p_nearmiss?: number | null
  t_cpa_s?: number | null
  d_cpa_m?: number | null
  warning_time_s?: number | null
  reasons: string[]
  action: string
  conditions: Conditions
  model_version?: string | null
  /** PROPOSED: which tracked object caused the alert, so the site view can highlight it. */
  object_id?: string | null
}

export interface AckRequest {
  alert_id: string
  method: 'voice' | 'button'
  action: 'ack' | 'dismiss'
  reason_code?: 'known_hazard' | 'spotter_present' | 'false_alarm' | null
}

export interface LiveFrame {
  t: number
  scenario_id: string
  seed: number
  machine: MachineState
  objects: TrackedObject[]
  zones: Zones
  conditions: Conditions
  active_alert?: AlertEvent | null
  sensor_ok: boolean
  /** PROPOSED (gap 3): simulated motion-inhibit signal is raised. */
  motion_inhibit?: boolean
  /** PROPOSED (gap 4): server wall clock in ms when the frame was sent, for latency. */
  sent_ms?: number | null
  /** PROPOSED (gap 2): wall-clock time of t = 0, so the UI can show clock times. */
  shift_start_iso?: string | null
}

export type Outcome = 'near_miss' | 'incident' | 'cleared' | 'dismissed'

export interface IncidentRecord {
  seq: number
  event: AlertEvent
  outcome?: Outcome | null
  note?: string | null
  prev_hash: string
  hash: string
}

export interface RiskFactor {
  name: string
  level: 'low' | 'med' | 'high'
  note: string
  action: string
}

export interface EtaStep {
  label: string
  minutes: number
}

export interface Task {
  task_id: string
  type: TaskType
  zone: string
  quantity_m3: number
  priority: number
  status: 'pending' | 'active' | 'done'
  p10_min: number
  p50_min: number
  p90_min: number
  eta_breakdown: EtaStep[]
  risk_factors: RiskFactor[]
}

export interface TaskPlan {
  order: string[]
  total_p50_min: number
  saving_min: number
  reason: string
  fuel_needed_l: number
  refuel_before_task?: string | null
}

export interface AnomalyFlag {
  flag_id: string
  operator_id: string
  shift_date: string
  rule: string
  metric: string
  value: number
  baseline?: number | null
  z?: number | null
  severity: 'info' | 'review' | 'coach'
  reason: string
  /** PROPOSED (gap 19): timestamp of the telemetry row the flag came from, e.g. "2025-05-01 10:00:00". */
  source_ts?: string | null
}

export interface SkillProfile {
  operator_id: string
  levels: Record<string, Level>
  inputs: Record<string, number>
  promotion_ready: boolean
}

export interface QuizItem {
  q: string
  options: string[]
  answer_idx: number
}

export interface Lesson {
  lesson_id: string
  title: string
  trigger_rules: string[]
  minutes: number
  card_md: string
  video_path?: string | null
  quiz: QuizItem[]
}

export interface Tip {
  tip_id: string
  type: string
  text: string
  reason: string
  level: Level
  feedback?: 'up' | 'down' | null
}

export interface ShiftSummary {
  operator_id: string
  date: string
  near_misses: number
  median_warning_s?: number | null
  belt_compliance_pct: number
  idle_pct: number
  fuel_l: number
  tasks: Task[]
  went_well: string
  tip: string
  handover_note?: string | null
}

export interface AgentAnswer {
  text: string
  intent?: string | null
  tools_used: string[]
  /** PROPOSED (gap 14): what the speech recogniser heard. */
  transcript?: string | null
}

/* ---------- PROPOSED models for endpoints that have no shape yet (doc 06 gaps) ---------- */

/** Gap 6: GET /api/operators */
export interface OperatorSummary {
  operator_id: string
  name: string
  level: Level
  years: number
}

/** Gap 7: GET /api/forecast (hourly, seeded) */
export interface ForecastHour extends Conditions {
  time: string // "15:00"
}

/** Gap 8: POST /api/eta/whatif */
export interface WhatIfRequest {
  rain_mm_h: number
  visibility_m: number
  trucks_available: number
}

/** Gap 9: GET /api/incidents/verify */
export interface VerifyResult {
  ok: boolean
  checked: number
  first_broken_seq: number | null
}

/** Gap 10: POST /api/incidents */
export interface ManualReport {
  type: 'manual' | 'emergency'
  category: 'near_miss' | 'incident' | 'hazard' | 'machine_issue'
  note: string
  operator_id: string
  machine_id: string
}

/** Gap 11: GET /api/precheck */
export interface PrecheckItem {
  id: string
  label: string
  group: 'ppe' | 'machine' | 'condition'
  source: 'sensor' | 'visual'
  value: boolean | null
  auto_filled: boolean
  note?: string | null
}

export interface Briefing {
  operator_id: string
  level: Level
  lines: string[]
  changed_since_last: string[]
  handover_note?: string | null
  yesterday_tip?: string | null
  compliance_streak_shifts: number
}

export interface PrecheckState {
  items: PrecheckItem[]
  briefing: Briefing
}

/** Gap 12: GET /api/training/{operator} */
export interface InstructorSlot {
  slot_id: string
  time: string
  instructor: string
  topic: string
  booked: boolean
}

export interface TrainingState {
  operator_id: string
  assigned: { lesson_id: string; because_flag_id: string | null; because: string; done: boolean; score: number | null }[]
  lessons: Lesson[]
  slots: InstructorSlot[]
  tips: Tip[]
}

export interface TrainerRow {
  operator_id: string
  name: string
  lesson_id: string
  lesson_title: string
  score: number | null
  flags_before: number
  flags_after: number | null
}

/** Gap 13: GET /api/evidence/safety and /api/evidence/analytics. null = not measured yet. */
export interface EvidenceSafety {
  median_warning_b0_s: number | null
  median_warning_m1_s: number | null
  false_alarms_per_hour_b0: number | null
  false_alarms_per_hour_m1: number | null
  near_miss_warned_pct: number | null
  guardrail_hard_pct: number | null
  shipped_model: 'B0' | 'M1' | null
  warning_hist: { bin_s: number; b0: number; m1: number }[]
  ablation: { variant: string; median_warning_s: number | null; false_alarms_per_hour: number | null }[]
}

export interface EvidenceAnalytics {
  coverage_p10_p90_pct: number | null
  coverage_raw_pct: number | null
  p50_mae_min: number | null
  p50_mae_prior_min: number | null
  anomaly_recall_pct: number | null
  anomaly_precision_pct: number | null
  brief_rows_correct: number | null
  calibration: { nominal: number; empirical_raw: number; empirical_cqr: number }[]
}

/** The brief's telemetry table, verbatim (data/brief_telemetry.csv). */
export interface BriefRow {
  timestamp: string
  machine_id: string
  operator_id: string
  engine_hours: number
  fuel_used_l: number
  load_cycles: number
  idling_time_min: number
  seatbelt_status: 'Fastened' | 'Unfastened'
  safety_alert_triggered: 'Yes' | 'No'
}
