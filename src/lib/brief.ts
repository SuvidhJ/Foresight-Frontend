import type { BriefRow } from '@/contract/types'

/** The brief's telemetry table, verbatim from data/brief_telemetry.csv. */
export const BRIEF_ROWS: BriefRow[] = [
  { timestamp: '2025-05-01 08:00:00', machine_id: 'EXC001', operator_id: 'OP1001', engine_hours: 1523.5, fuel_used_l: 5.2, load_cycles: 12, idling_time_min: 30, seatbelt_status: 'Fastened', safety_alert_triggered: 'No' },
  { timestamp: '2025-05-01 10:00:00', machine_id: 'EXC001', operator_id: 'OP1001', engine_hours: 1524.8, fuel_used_l: 3.8, load_cycles: 2, idling_time_min: 55, seatbelt_status: 'Unfastened', safety_alert_triggered: 'Yes' },
  { timestamp: '2025-05-01 14:00:00', machine_id: 'EXC001', operator_id: 'OP1001', engine_hours: 1526.5, fuel_used_l: 6.1, load_cycles: 10, idling_time_min: 15, seatbelt_status: 'Fastened', safety_alert_triggered: 'No' },
  { timestamp: '2025-05-02 09:00:00', machine_id: 'EXC001', operator_id: 'OP1001', engine_hours: 1530.2, fuel_used_l: 2.0, load_cycles: 1, idling_time_min: 60, seatbelt_status: 'Unfastened', safety_alert_triggered: 'Yes' },
]
