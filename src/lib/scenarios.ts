export type ScenarioId = '1' | '2' | '3' | '4'

export interface Beat {
  /** Scenario seconds, as scripted in the simulator (doc 01 demo script). */
  t: number
  label: string
  /** What the presenter wants the panel to notice. */
  say: string
  tone?: 'soft' | 'hard' | 'ok' | 'info'
}

/** The four seeded demo scenarios (doc 01, Demo scenarios). */
export const SCENARIOS: Record<ScenarioId, { name: string; blurb: string; beats: Beat[] }> = {
  '1': {
    name: 'Normal truck loading',
    blurb: 'Quiet cab, no false alarms',
    beats: [
      { t: 0, label: 'Loading', say: 'Dig, swing, dump into the truck. A worker walks about 20 m away: tracked, never alarmed.', tone: 'info' },
      { t: 14, label: 'Cycle done', say: 'A full load cycle with a person on site and no false alarm. Quiet is a feature.', tone: 'ok' },
    ],
  },
  '2': {
    name: 'Converging hazard',
    blurb: 'Worker walks into the swing path',
    beats: [
      { t: 0, label: 'Worker enters', say: 'A worker walks in from the west, towards where the boom is about to swing.', tone: 'info' },
      { t: 5.2, label: 'Early warning', say: 'The model sees the paths converging and warns early: amber, with direction and time to closest approach.', tone: 'soft' },
      { t: 10, label: 'Stop', say: 'Inner zone breached: the rule stops the swing. Red, motion inhibited, no dismiss button.', tone: 'hard' },
      { t: 13.1, label: 'Clear', say: 'The worker steps out, motion is restored, and the near-miss is logged with a 4.8 s warning.', tone: 'ok' },
    ],
  },
  '3': {
    name: 'Wet, 40 m visibility',
    blurb: 'Rain and fog roll in; zones grow',
    beats: [
      { t: 0, label: 'Dry', say: 'Same site, clear and dry.', tone: 'info' },
      { t: 2, label: 'Rain, fog', say: 'Rain and fog roll in. Visibility falls to 40 m; the ground loses grip.', tone: 'info' },
      { t: 5, label: 'Zones grow', say: 'Safety zones widen by themselves: wet ground means a longer stopping distance.', tone: 'info' },
      { t: 6.5, label: 'Vehicle', say: 'A light vehicle converges through the fog. The operator can barely see it; the sensors can.', tone: 'soft' },
      { t: 12, label: 'Stops', say: 'The driver stops short and the alert clears on its own.', tone: 'ok' },
    ],
  },
  '4': {
    name: "Brief's own rows",
    blurb: 'Belt-off idling, operator away',
    beats: [
      { t: 0, label: 'Nobody in cab', say: "The problem statement's own data: engine idling, belt off, seat empty.", tone: 'info' },
      { t: 4, label: 'Row 2', say: 'No point shouting into an empty cab: row 2 goes to the supervisor.', tone: 'soft' },
      { t: 9, label: 'Row 4', say: 'Row 4, the next day, is the same pattern, so it is flagged as a repeat and a lesson is assigned.', tone: 'soft' },
    ],
  },
}

export function scenarioLength(id: ScenarioId) {
  return (SCENARIOS[id].beats.at(-1)?.t ?? 0) + 4
}
