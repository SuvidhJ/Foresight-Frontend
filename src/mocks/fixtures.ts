/**
 * Hand-made fixtures used only while a module is mocked. Shapes follow src/contract/types.ts.
 * Brief rows are verbatim from data/brief_telemetry.csv; every other number is sample data
 * that the real modules replace at integration. Evidence metrics are deliberately null
 * ("not measured yet") so no invented result can reach a slide or the README.
 */
import type {
  AgentAnswer, AnomalyFlag, EvidenceAnalytics, EvidenceSafety, ForecastHour, IncidentRecord,
  InstructorSlot, Lesson, OperatorSummary, PrecheckItem, ShiftSummary, SkillProfile, Task, TaskPlan, Tip, TrainerRow,
} from '@/contract/types'

export { BRIEF_ROWS } from '@/lib/brief'

export const OPERATORS: OperatorSummary[] = [
  { operator_id: 'OP1001', name: 'Ravi K.', level: 'standard', years: 4 },
  { operator_id: 'OP1004', name: 'Anil S.', level: 'guided', years: 0.5 },
  { operator_id: 'OP1007', name: 'Sunita R.', level: 'expert', years: 12 },
]

export const SKILL: Record<string, SkillProfile> = {
  OP1001: { operator_id: 'OP1001', levels: { trenching: 'standard', truck_loading: 'standard', backfill: 'expert' }, inputs: { machine_type_hours: 3100, total_hours: 6400, soft_alerts_per_hour: 0.4, anomaly_flags_10_shifts: 2, cycle_time_vs_fleet: 1.04 }, promotion_ready: false },
  OP1004: { operator_id: 'OP1004', levels: { trenching: 'guided', truck_loading: 'guided', backfill: 'guided' }, inputs: { machine_type_hours: 420, total_hours: 900, soft_alerts_per_hour: 0.9, anomaly_flags_10_shifts: 3, cycle_time_vs_fleet: 1.21 }, promotion_ready: false },
  OP1007: { operator_id: 'OP1007', levels: { trenching: 'expert', truck_loading: 'expert', backfill: 'expert' }, inputs: { machine_type_hours: 14800, total_hours: 21000, soft_alerts_per_hour: 0.1, anomaly_flags_10_shifts: 0, cycle_time_vs_fleet: 0.88 }, promotion_ready: false },
}

const step = (prior: number, cond: number, op: number) => [
  { label: 'Production formula', minutes: prior },
  { label: 'Conditions', minutes: cond },
  { label: 'Operator pace', minutes: op },
]

export const TASKS: Task[] = [
  {
    task_id: 'T1', type: 'trenching', zone: 'Trench B', quantity_m3: 80, priority: 1, status: 'active',
    p10_min: 49, p50_min: 58, p90_min: 72, eta_breakdown: step(48, 6, 4),
    risk_factors: [
      { name: 'People near the spoil pile', level: 'med', note: 'Ground crew works the spoil pile until 11:00', action: 'Agree a hand signal with the crew before swinging towards the pile' },
      { name: 'Trench depth 2.4 m', level: 'low', note: 'Shoring in place', action: 'Keep the tracks 1 m back from the edge' },
    ],
  },
  {
    task_id: 'T2', type: 'truck_loading', zone: 'Pad A', quantity_m3: 150, priority: 2, status: 'pending',
    p10_min: 62, p50_min: 70, p90_min: 86, eta_breakdown: step(67, 3, 0),
    risk_factors: [{ name: 'Truck availability', level: 'med', note: '3 trucks booked, 1 on another site until 12:30', action: 'Drop to low idle while waiting for trucks' }],
  },
  {
    task_id: 'T3', type: 'backfill', zone: 'Backfill C', quantity_m3: 60, priority: 3, status: 'pending',
    p10_min: 22, p50_min: 26, p90_min: 33, eta_breakdown: step(24, 2, 0),
    risk_factors: [{ name: 'Slope 6°', level: 'low', note: 'Side slope on the east edge', action: 'Work up and down the slope, not across it' }],
  },
  {
    task_id: 'T4', type: 'trenching', zone: 'Trench D', quantity_m3: 50, priority: 4, status: 'pending',
    p10_min: 33, p50_min: 41, p90_min: 55, eta_breakdown: step(30, 9, 2),
    risk_factors: [
      { name: 'Rain 15:00–17:00', level: 'high', note: 'Clay walls lose strength when wet', action: 'Finish before 15:00, or wait until the ground drains' },
      { name: 'Buried cable marked', level: 'med', note: 'Marked 1.5 m east of the centre line', action: 'Hand-dig within 0.5 m of the marker' },
    ],
  },
]

export const PLAN: TaskPlan = {
  order: ['T1', 'T4', 'T2', 'T3'],
  total_p50_min: 186,
  saving_min: 25,
  reason: 'Do Trench D before the 15:00 rain: saves about 25 min at P50, and its P90 still finishes inside the shift.',
  fuel_needed_l: 52,
  refuel_before_task: 'T2',
}

export const FORECAST: ForecastHour[] = ['07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18'].map((h) => {
  const n = Number(h)
  const rain = n >= 15 && n <= 17 ? (n === 16 ? 8 : 5) : 0
  const temp = 24 + Math.round(9 * Math.sin(((n - 7) / 11) * Math.PI))
  return {
    time: `${h}:00`,
    ground: rain ? 'wet' : 'dry',
    mu: rain ? 0.4 : 0.7,
    visibility_m: n === 7 ? 300 : rain ? 800 : 5000,
    rain_mm_h: rain,
    temp_c: rain ? temp - 5 : temp,
    humidity_pct: rain ? 90 : 55,
    heat_index_c: rain ? temp - 5 : temp + 3,
  }
})

export const FLAGS: Record<string, AnomalyFlag[]> = {
  OP1001: [
    { flag_id: 'F-R2-BELT', source_ts: '2025-05-01 10:00:00', operator_id: 'OP1001', shift_date: '2025-05-01', rule: 'belt_off_idle', metric: 'idle_min_belt_off', value: 55, baseline: null, z: null, severity: 'coach', reason: 'Brief row 2 (10:00): idle 55 of 60 min (92%) with the belt unfastened and only 2 load cycles; 1.90 L of fuel per cycle vs 0.43 L at 08:00.' },
    { flag_id: 'F-R4-BELT', source_ts: '2025-05-02 09:00:00', operator_id: 'OP1001', shift_date: '2025-05-02', rule: 'belt_off_idle', metric: 'idle_min_belt_off', value: 60, baseline: null, z: null, severity: 'coach', reason: 'Brief row 4 (09:00): idle 60 of 60 min (100%) with the belt unfastened and 1 load cycle; 2.0 L of fuel for one cycle. Same pattern as row 2.' },
    { flag_id: 'F-R2-IDLE', source_ts: '2025-05-01 10:00:00', operator_id: 'OP1001', shift_date: '2025-05-01', rule: 'idle_ratio_high', metric: 'idle_ratio_pct', value: 92, baseline: 40, z: null, severity: 'coach', reason: 'Idle ratio 92% in the 10:00 hour, over the 40% site limit.' },
    { flag_id: 'F-R4-IDLE', source_ts: '2025-05-02 09:00:00', operator_id: 'OP1001', shift_date: '2025-05-02', rule: 'idle_ratio_high', metric: 'idle_ratio_pct', value: 100, baseline: 40, z: null, severity: 'coach', reason: 'Idle ratio 100% in the 09:00 hour, over the 40% site limit.' },
    { flag_id: 'F-GAP', operator_id: 'OP1001', shift_date: '2025-05-02', rule: 'after_hours_running', metric: 'engine_hours_gap_h', value: 3.7, baseline: null, z: null, severity: 'review', reason: 'Engine meter rose 3.7 h between 14:00 and 09:00 the next day. Either unlogged afternoon work or after-hours running: flagged for review, not judged.' },
  ],
  OP1004: [
    { flag_id: 'F-A1', operator_id: 'OP1004', shift_date: '2026-09-22', rule: 'cycle_time_drift', metric: 'cycle_time_s', value: 26.1, baseline: 21.4, z: 3.9, severity: 'coach', reason: 'Cycle time 26.1 s vs your usual 21.4 s (modified z = 3.9, over the 3.5 cutoff) on truck loading.' },
  ],
  OP1007: [
    { flag_id: 'F-S1', operator_id: 'OP1007', shift_date: '2026-09-22', rule: 'fuel_per_cycle_high', metric: 'fuel_per_cycle_l', value: 0.52, baseline: 0.41, z: 3.6, severity: 'info', reason: 'Fuel per cycle 0.52 L vs your usual 0.41 L (modified z = 3.6). Most of the extra came while waiting on trucks at high idle.' },
  ],
}

export const TIPS: Tip[] = [
  { tip_id: 'TIP-1', type: 'idle_waiting', text: 'Waiting on trucks: drop to low idle. It saves about 1 L/h.', reason: 'Truck gaps of 6–9 min yesterday with the engine at high idle', level: 'standard' },
  { tip_id: 'TIP-2', type: 'belt', text: 'Buckle up before the lockout comes up, even for short moves.', reason: 'Belt off in 2 of the last 5 shifts', level: 'guided' },
  { tip_id: 'TIP-3', type: 'cycle', text: 'Swing 20° less on Pad A: the truck can sit closer to the face.', reason: 'Your swing angle on truck loading is 20° above the fleet median', level: 'expert' },
]

export const LESSONS: Lesson[] = [
  {
    lesson_id: 'L-BELT', title: 'Seatbelts and rollover ejection', trigger_rules: ['belt_off_engine_on', 'belt_off_idle'], minutes: 4, video_path: null,
    card_md: '### Why the belt matters\n\nThe cab\'s rollover protection (ROPS) only protects you **inside** it. In a rollover or tip, an unbelted operator can be thrown out and crushed by the machine.\n\n- Buckle up **before** you lift the hydraulic lockout.\n- If you leave the seat, lower the lockout and **shut the engine down** rather than idling.\n- Latching the belt behind the seat is logged as a bypass.',
    quiz: [
      { q: 'When does the cab protect you in a rollover?', options: ['Always', 'Only when you are belted in', 'Only on slopes'], answer_idx: 1 },
      { q: 'You need to leave the seat for 10 minutes. What should you do?', options: ['Leave it idling with the belt latched', 'Lower the lockout and shut the engine down', 'Unbuckle and keep the lockout up'], answer_idx: 1 },
      { q: 'When should you buckle up?', options: ['Before lifting the hydraulic lockout', 'Only when travelling', 'Only near people'], answer_idx: 0 },
    ],
  },
  {
    lesson_id: 'L-IDLE', title: 'Idle management and auto idle shutdown', trigger_rules: ['idle_continuous', 'idle_ratio_high', 'unattended_idle'], minutes: 3, video_path: null,
    card_md: '### Idle hours cost more than fuel\n\n- An idling engine burns fuel and **adds engine hours** without moving material. Service intervals and resale value are counted in hours.\n- On this machine, idle burn is about **2 L/h** (from the brief\'s own data).\n- Waiting on trucks? Use **low idle**. Leaving the machine? **Shut down**.\n- Engine idle shutdown can be set between 5 and 60 minutes.',
    quiz: [
      { q: 'What does an idle hour add besides fuel?', options: ['Nothing', 'An engine hour towards service and resale', 'Extra hydraulic pressure'], answer_idx: 1 },
      { q: 'Best choice while waiting 8 minutes for a truck?', options: ['High idle', 'Low idle', 'Rev the engine every minute'], answer_idx: 1 },
      { q: 'You leave the machine for a break. What should you do?', options: ['Shut the engine down', 'Leave it at low idle', 'Leave it at high idle'], answer_idx: 0 },
    ],
  },
  {
    lesson_id: 'L-SWING', title: 'Swing awareness and blind zones', trigger_rules: ['swing_warning'], minutes: 4, video_path: null,
    card_md: '### The swing radius is a no-go zone\n\n- The counterweight swings behind you, in your blind zone.\n- Before swinging, **look in the direction of the swing** and use the mirrors and camera.\n- Agree a hand signal with ground crew; stop if you lose sight of them.',
    quiz: [
      { q: 'Where is the biggest blind zone during a swing?', options: ['In front of the bucket', 'Behind, at the counterweight', 'Directly under the cab'], answer_idx: 1 },
      { q: 'You lose sight of a ground worker. What do you do?', options: ['Keep swinging slowly', 'Stop until you see them again', 'Sound the horn and continue'], answer_idx: 1 },
      { q: 'What should you do before swinging?', options: ['Look in the direction of the swing', 'Check fuel', 'Raise the boom fully'], answer_idx: 0 },
    ],
  },
  {
    lesson_id: 'L-WET', title: 'Wet ground and low visibility', trigger_rules: ['degraded_conditions'], minutes: 3, video_path: null,
    card_md: '### Rain changes the physics\n\n- Wet ground lowers friction, so **stopping distance grows**; Foresight widens its warning zones automatically.\n- In low visibility, slow down, use lights and the horn, and rely on the spotter.\n- Trench walls weaken when wet: keep extra clearance from edges.',
    quiz: [
      { q: 'What happens to stopping distance on wet ground?', options: ['It shrinks', 'It grows', 'No change'], answer_idx: 1 },
      { q: 'Visibility drops to 40 m. What changes first?', options: ['Travel faster to finish early', 'Slow down and use lights and horn', 'Turn off the lights to save power'], answer_idx: 1 },
      { q: 'Why keep back from trench edges in rain?', options: ['Walls weaken when wet', 'The machine gets dirty', 'It saves fuel'], answer_idx: 0 },
    ],
  },
  {
    lesson_id: 'L-CYCLE', title: 'Cycle time and fuel per cycle (advanced)', trigger_rules: ['cycle_time_drift', 'fuel_per_cycle_high'], minutes: 5, video_path: null,
    card_md: '### Small angles, big savings\n\n- Place the truck so the swing is **under 90°**: every 10° saved is time on every cycle.\n- Fill the bucket in one smooth pass; re-digging adds a full cycle of fuel.\n- Compare against **your own** baseline, not the fleet: Foresight flags drift at a modified z-score over 3.5.',
    quiz: [
      { q: 'Best swing angle for truck loading?', options: ['Under 90°', 'About 180°', 'It does not matter'], answer_idx: 0 },
      { q: 'What does Foresight compare your cycle time with first?', options: ['The fleet record', 'Your own recent shifts', 'The manufacturer rating'], answer_idx: 1 },
      { q: 'Re-digging to top up the bucket costs…', options: ['Nothing', 'Most of an extra cycle of fuel and time', 'Only hydraulic oil'], answer_idx: 1 },
    ],
  },
]

export const SLOTS: InstructorSlot[] = [
  { slot_id: 'S-1', time: 'Thu 07:30', instructor: 'Arjun (trainer)', topic: 'Seatbelts and idle: 20-min cab session', booked: false },
  { slot_id: 'S-2', time: 'Thu 16:30', instructor: 'Arjun (trainer)', topic: 'Seatbelts and idle: 20-min cab session', booked: false },
  { slot_id: 'S-3', time: 'Fri 07:30', instructor: 'Arjun (trainer)', topic: 'Spotter coordination', booked: false },
]

export const TRAINER_ROWS: TrainerRow[] = [
  { operator_id: 'OP1001', name: 'Ravi K.', lesson_id: 'L-BELT', lesson_title: 'Seatbelts and rollover ejection', score: null, flags_before: 2, flags_after: null },
  { operator_id: 'OP1001', name: 'Ravi K.', lesson_id: 'L-IDLE', lesson_title: 'Idle management and auto idle shutdown', score: null, flags_before: 2, flags_after: null },
  { operator_id: 'OP1004', name: 'Anil S.', lesson_id: 'L-CYCLE', lesson_title: 'Cycle time and fuel per cycle', score: 2, flags_before: 3, flags_after: 1 },
  { operator_id: 'OP1007', name: 'Sunita R.', lesson_id: 'L-CYCLE', lesson_title: 'Cycle time and fuel per cycle', score: 3, flags_before: 1, flags_after: 0 },
]

export function precheckItems(level: string, fuelPct: number): PrecheckItem[] {
  const sensor = level !== 'guided'
  return [
    { id: 'helmet', label: 'Helmet', group: 'ppe', source: 'visual', value: null, auto_filled: false },
    { id: 'gloves', label: 'Gloves', group: 'ppe', source: 'visual', value: null, auto_filled: false },
    { id: 'boots', label: 'Safety boots', group: 'ppe', source: 'visual', value: null, auto_filled: false },
    { id: 'vest', label: 'Hi-vis vest', group: 'ppe', source: 'visual', value: null, auto_filled: false },
    { id: 'walkaround', label: 'Walk-around: tracks, pins, leaks', group: 'machine', source: 'visual', value: null, auto_filled: false },
    { id: 'mirrors', label: 'Mirrors and camera lenses clean', group: 'machine', source: 'visual', value: null, auto_filled: false },
    { id: 'belt', label: 'Seatbelt latches and retracts', group: 'machine', source: 'visual', value: null, auto_filled: false },
    { id: 'hyd_oil', label: 'Hydraulic oil level', group: 'machine', source: 'sensor', value: sensor ? true : null, auto_filled: sensor, note: 'Sensor: within range' },
    { id: 'coolant', label: 'Coolant level', group: 'machine', source: 'sensor', value: sensor ? true : null, auto_filled: sensor, note: 'Sensor: within range' },
    { id: 'faults', label: 'No active fault codes', group: 'machine', source: 'sensor', value: sensor ? true : null, auto_filled: sensor, note: 'Sensor: none active' },
    { id: 'fuel', label: `Fuel ${fuelPct}%: refuel before truck loading`, group: 'machine', source: 'sensor', value: sensor ? false : null, auto_filled: sensor, note: 'Sensor: 14%, plan needs 52 L' },
    { id: 'attachment', label: 'Attachment matches task (1.0 m³ digging bucket for trenching)', group: 'machine', source: 'sensor', value: sensor ? true : null, auto_filled: sensor, note: 'Sensor: bucket ID matches' },
    { id: 'rain_gear', label: 'Rain gear in the cab (rain from 15:00)', group: 'condition', source: 'visual', value: null, auto_filled: false },
    { id: 'water', label: 'Drinking water (heat index 35 °C at 13:00)', group: 'condition', source: 'visual', value: null, auto_filled: false },
  ]
}

export const BRIEFING_LINES: Record<string, string[]> = {
  guided: [
    '1. Trench B first (58 min, up to 72). Ground crew is on the spoil pile until 11:00: agree a hand signal before you swing towards it.',
    '2. Then Trench D before the 15:00 rain. Clay walls weaken when wet.',
    '3. Refuel before truck loading on Pad A: the tank is at 14%.',
    '4. Backfill C last. Work up and down the 6° slope, not across it.',
    "Yesterday's tip: buckle up before you lift the lockout, even for short moves.",
  ],
  standard: [
    'Trench B → Trench D (beat the 15:00 rain) → refuel → Pad A → Backfill C.',
    'Key risks: crew on the spoil pile until 11:00; rain from 15:00; fuel at 14%.',
  ],
  expert: [
    'B → D → refuel → A → C. Total P50 3 h 06 min.',
    'Changed since yesterday: rain moved up to 15:00; 1 truck short until 12:30.',
  ],
}

export const CHANGED_SINCE_LAST = [
  'Rain forecast moved from 17:00 to 15:00',
  'Hydraulic oil topped up by the night crew',
  'Trench B shoring installed on the north side',
]

export const HANDOVER = 'Night shift (Deepak): left track tension a little slack, reported to maintenance. Spoil pile at Trench B is higher than planned.'

export const SUMMARY: Record<string, ShiftSummary> = Object.fromEntries(
  OPERATORS.map((o) => [o.operator_id, {
    operator_id: o.operator_id,
    date: '2026-09-23',
    near_misses: o.operator_id === 'OP1001' ? 1 : 0,
    median_warning_s: o.operator_id === 'OP1001' ? 4.8 : null,
    belt_compliance_pct: o.operator_id === 'OP1001' ? 91 : o.operator_id === 'OP1004' ? 96 : 100,
    idle_pct: o.operator_id === 'OP1001' ? 28 : o.operator_id === 'OP1004' ? 22 : 14,
    fuel_l: o.operator_id === 'OP1001' ? 41 : 38,
    tasks: TASKS.map((t, i) => ({ ...t, status: i < 2 ? 'done' : t.status })),
    went_well: 'No hard alerts in the first four hours, and swing clearance around the spoil pile was kept every cycle.',
    tip: 'When waiting on trucks, drop to low idle: about 1 L/h saved.',
    handover_note: null,
  } satisfies ShiftSummary]),
)

export const AGENT_ANSWERS: { match: RegExp; answer: AgentAnswer }[] = [
  {
    match: /fuel/i,
    answer: { text: 'Fuel per cycle is 0.52 L today against your usual 0.41 L. Most of the extra came while waiting on trucks at high idle: 3 gaps of 6 to 9 minutes. Low idle while waiting would save about 1 L per hour.', intent: 'open_question', tools_used: ['get_shift_stats', 'get_anomalies'] },
  },
  {
    match: /rain|before|finish/i,
    answer: { text: 'Trench D needs 41 minutes at P50 and 55 at P90. Rain starts at 15:00. If you start by 14:00, the P90 still finishes before the rain.', intent: 'open_question', tools_used: ['get_tasks', 'get_eta', 'get_forecast'] },
  },
  {
    match: /how long|left|remaining/i,
    answer: { text: 'Trench B: about 25 minutes left, up to 40 if the crew holds you up at the spoil pile.', intent: 'how_long_left', tools_used: ['get_tasks', 'get_eta'] },
  },
  {
    match: /safe|ahead/i,
    answer: { text: 'One person tracked 16 m to the west, moving away. Nothing inside the warning zone.', intent: 'is_it_safe_ahead', tools_used: ['get_live_objects'] },
  },
  {
    match: /next/i,
    answer: { text: 'Next is Trench D, 50 cubic metres, before the 15:00 rain. Then refuel.', intent: 'whats_next', tools_used: ['get_tasks', 'get_forecast'] },
  },
]

export const AGENT_FALLBACK: AgentAnswer = {
  text: "I can answer questions about your tasks, times, fuel, alerts and the forecast. I couldn't match that one to my tools.",
  intent: null,
  tools_used: [],
}

export const EVIDENCE_SAFETY: EvidenceSafety = {
  median_warning_b0_s: null, median_warning_m1_s: null, false_alarms_per_hour_b0: null, false_alarms_per_hour_m1: null,
  near_miss_warned_pct: null, guardrail_hard_pct: null, shipped_model: null, warning_hist: [], ablation: [],
}

export const EVIDENCE_ANALYTICS: EvidenceAnalytics = {
  coverage_p10_p90_pct: null, coverage_raw_pct: null, p50_mae_min: null, p50_mae_prior_min: null,
  anomaly_recall_pct: null, anomaly_precision_pct: null, brief_rows_correct: null, calibration: [],
}

/** Seed log entries from earlier in the shift (before the demo scenarios run). */
export function seedIncidents(nowS: number): Omit<IncidentRecord, 'seq' | 'prev_hash' | 'hash'>[] {
  const cond = { ground: 'dry' as const, mu: 0.7, visibility_m: 5000, rain_mm_h: 0, temp_c: 27, humidity_pct: 60, heat_index_c: 28 }
  const ev = (mOff: number, id: string, tier: 'soft' | 'hard' | 'log', type: IncidentRecord['event']['type'], source: 'rule' | 'model' | 'operator', reasons: string[], action: string, warning: number | null = null) => ({
    alert_id: id, t: nowS - mOff * 60, machine_id: 'EXC001', operator_id: 'OP1001', tier, type, source,
    p_nearmiss: source === 'model' ? 0.41 : null, warning_time_s: warning, reasons, action, conditions: cond,
    model_version: source === 'model' ? 'nearmiss-gbt-0.3' : null,
  })
  return [
    { event: ev(196, 'E-0712', 'soft', 'proximity', 'model', ['Dump truck reversing towards the swing radius', 'Closest approach 2.6 m in 5.4 s'], 'Hold the swing until the truck stops'), outcome: 'dismissed', note: 'Reason: spotter present' },
    { event: ev(151, 'E-0757', 'soft', 'seatbelt', 'rule', ['Belt unfastened with engine on and lockout up'], 'Buckle up before operating'), outcome: 'cleared', note: 'Belt fastened after 40 s' },
    { event: ev(118, 'E-0830', 'soft', 'stale_sensor', 'rule', ['No object data from the rear radar for 600 ms'], 'Detection degraded: area not confirmed clear'), outcome: 'cleared', note: 'Feed recovered after 1.2 s' },
    { event: ev(64, 'E-0924', 'soft', 'stability', 'rule', ['Stability ratio 0.78 at 7.4 m reach with a full bucket', 'Side slope 6°'], 'Bring the load closer before swinging'), outcome: 'cleared', note: null },
  ]
}
