# Foresight web client (M3)

Every screen of Foresight: cab tablet, demo stage, and the off-machine views. It runs fully offline and works today against in-browser mocks, so it doesn't wait for M1, M2 or M4.

## Run

```bash
npm install                  # once, while online
npx playwright install chromium   # once, for the smoke tests
npm run dev                  # http://localhost:5173
```

Demo keys: `1`–`4` start a scenario · `Space` acknowledge a soft alert · `D` dismiss with a reason · hold `V` to talk · `T` top-down / 3D · `R` replay the last 30 s · `E` evidence page · `?` all shortcuts.

Browsers block sound until a click, so one click per page load turns it on: **Start shift** on pre-shift (the cab then opens ready), **Start** on the cab, or a scenario card on the demo stage.

For the panel, use `/stage`: pick a scenario and read the timeline's line under the header as it changes. The script is in [docs/07](../docs/07-frontend-plan.md#demo-script-with-the-stage-about-90-s).

## Screens

| Route | Who | What it shows |
| --- | --- | --- |
| `/preshift` | Operator | Briefing by coaching level, sensor-filled checklist, handover note |
| `/cab` | Operator | Live 3D site view, one alert at a time, ETA, machine status, push-to-talk |
| `/stage` | Demo | Cab (in 3D) and supervisor log side by side, with a presenter timeline: an alert fires, its hash-chained record appears |
| `/overview` | Operator, supervisor | Weather strip, P10–P90 task ranges, suggested order, what-if sliders, fuel plan, ETA waterfall |
| `/flags` | All | The brief's 4 rows (2 and 4 flagged), anomaly flags with reasons |
| `/incidents` | Supervisor | Filterable log, integrity badge, tamper test, manual report |
| `/training` | Operator, trainer | Lessons from the operator's own flags, quiz, instructor booking, tip feedback |
| `/summary` | Operator | Shift stats, tasks against ranges, handover note |
| `/evidence` | Judges | Metrics table; "Not measured yet" until real runs fill it |

## Mocks and going live, one module at a time

All calls go through `src/lib/api.ts` and `/ws/live`. While a module is mocked, [MSW](https://mswjs.io) answers its endpoints inside the browser (`src/mocks/`). Otherwise the dev server forwards them to that module's service.

| `.env.local` | Effect |
| --- | --- |
| `VITE_MOCK=m1,m2,m4` | Default: everything mocked |
| `VITE_MOCK=m2,m4` | Live stream and scenarios from M1 on :8001; the rest mocked |
| `VITE_MOCK=none` | Everything real: M1 :8001, M2 :8002, M4 :8004 |
| `VITE_MOCK=none` + `VITE_INTEGRATED=1` | After I1: everything from `api/main.py` on :8000 |
| `VITE_M1_URL=http://host:port` | Override one module's address |

The top bar shows **MOCK M1 M2 M4** for whatever is still mocked, so a demo never passes mock data off as real.

The mock simulator (`src/mocks/sim.ts`) plays the four demo scenarios deterministically. Scenario 2 warns at 5.2 s and breaches the inner zone at 10.0 s, so it reports 4.8 s of warning. That matches the demo script.

## Contract

`src/contract/types.ts` mirrors `shared/contracts.py` from doc 05. When the team's file exists, run `npm run gen:types`. It writes `src/contract/generated.ts` from the pydantic models; then swap the imports.

Fields and models marked **PROPOSED** are the gaps in [docs/06](../docs/06-frontend-m3-brief.md). All are optional; the UI still works without them. The ones that matter most for the demo:

| Proposal | Why |
| --- | --- |
| `LiveFrame.motion_inhibit` | Shows "MOTION INHIBITED" and freezes the machine only when the engine really raises it |
| `LiveFrame.sent_ms` | Lets the UI measure tick-to-screen latency for the evidence page |
| `AlertEvent.object_id` | Colours the right person or vehicle amber or red |
| `AnomalyFlag.source_ts` | Highlights exactly brief rows 2 and 4 (text matching once flagged row 1 by mistake) |
| Site frame: metres, +x east, +y north, bearings clockwise from north, `swing_deg` absolute | The 3D view draws positions exactly as sent |
| `AlertEvent.t` in Unix seconds | Clock times in the log |

## Tests

```bash
npm run typecheck
npm run test:e2e     # starts its own dev server on :5174, all mocked, network blocked
```

The smoke tests block every request that leaves the machine, and check:

- every screen renders;
- scenario 2 goes soft (with the hazard's direction) → STOP → hard with "warned 4.8 s before breach" → "motion restored";
- a hard alert can't be dismissed;
- scenario 3 shows the conditions card (stopping distance +75%), zones +30%, and tags the vehicle "hard to see";
- the stage's start screen starts a scenario and the timeline narrates it;
- the replay reports the same 4.8 s;
- tampering with a record breaks the chain and restoring it fixes it;
- brief rows 2 and 4 are flagged and rows 1 and 3 aren't;
- scenario 4 stays silent in the cab and alerts the supervisor.

## Build notes

- **3D:** three.js via react-three-fiber, in `src/features/site/` (camera, machine, actors, terrain, overlays, weather, labels). The scene reads the live store inside `useFrame` and interpolates 10 Hz frames to 60 fps, so React doesn't re-render per frame. Everything is built from primitives and canvas-drawn textures: no model or image files.
- **Camera:** one perspective camera flies between top-down (24° lens from high up, north up, ground to scale) and tilted 3D. In 3D it eases towards the hazard during an alert.
- **Labels:** our own DOM layer (`LabelDriver`). drei's `<Html>` rendered empty boxes here.
- **Predicted paths:** instanced dash meshes. drei's `<Line>` didn't redraw after its points changed.
- **Low visibility:** from above, a ground fog layer whose opacity is 1 − exp(−3d/V) (Koschmieder: 5% contrast left at the reported visibility V), with drifting patches; in 3D, three.js fog measured from the machine. Tracked objects ignore fog, because the sensors see what the operator can't; below 25% contrast their label says "hard to see · tracked".
- **Sound:** Tone.js, synthesised in the browser, soft and hard in different patterns.
- **Speech:** the browser's local voices only (Indian English preferred when installed).
- **Microphone:** RecordRTC records 16 kHz mono WAV for Vosk.
- **Offline:** no CDN assets. Fonts are bundled, and drei helpers that fetch from a CDN (`Environment`, `Text`) are not used.
