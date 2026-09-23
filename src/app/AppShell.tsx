import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router'
import { useHotkeys } from 'react-hotkeys-hook'
import { toast } from 'sonner'
import {
  BookOpenCheck, ClipboardCheck, FlaskConical, Gauge, Keyboard, LayoutDashboard, MessageSquareText, MonitorPlay, ScrollText, TriangleAlert, Truck,
} from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AskPanel } from '@/features/ask/AskPanel'
import { api } from '@/lib/api'
import { MOCKED } from '@/lib/env'
import { useIncidents, useOperators } from '@/lib/queries'
import { SCENARIOS, type ScenarioId } from '@/lib/scenarios'
import { cn } from '@/lib/utils'
import { connectLive, useLive } from '@/store/live'
import { useSession, type Role } from '@/store/session'

export const NAV: { to: string; label: string; short: string; icon: typeof Gauge; roles: Role[] }[] = [
  { to: '/preshift', label: 'Pre-shift', short: 'Pre-shift', icon: ClipboardCheck, roles: ['operator'] },
  { to: '/cab', label: 'Cab', short: 'Cab', icon: Truck, roles: ['operator'] },
  { to: '/stage', label: 'Live site', short: 'Site', icon: MonitorPlay, roles: ['supervisor'] },
  { to: '/overview', label: 'Shift overview', short: 'Tasks', icon: LayoutDashboard, roles: ['operator', 'supervisor'] },
  { to: '/flags', label: 'Behaviour', short: 'Behaviour', icon: TriangleAlert, roles: ['operator', 'supervisor', 'trainer'] },
  { to: '/incidents', label: 'Incident log', short: 'Log', icon: ScrollText, roles: ['supervisor'] },
  { to: '/training', label: 'Training', short: 'Training', icon: BookOpenCheck, roles: ['operator', 'trainer'] },
  { to: '/summary', label: 'Shift summary', short: 'Summary', icon: Gauge, roles: ['operator', 'supervisor'] },
  { to: '/evidence', label: 'Evidence', short: 'Evidence', icon: FlaskConical, roles: ['operator', 'supervisor', 'trainer'] },
]

const KEYS: [string, string][] = [
  ['1 – 4', 'Run a demo scenario'],
  ['Space', 'Acknowledge a soft (amber) alert'],
  ['D', 'Dismiss a soft alert with a reason (hard alerts cannot be dismissed)'],
  ['V (hold)', 'Talk to the assistant'],
  ['T', 'Top-down / 3D view'],
  ['R', 'Replay the last 30 s'],
  ['E', 'Evidence page'],
  ['?', 'This list'],
]

function Shortcuts({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Everything can also be done by touch on the tablet.</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
          {KEYS.map(([k, what]) => (
            <div key={k} className="contents">
              <dt><kbd className="num rounded-md border bg-muted px-2 py-0.5 text-xs">{k}</kbd></dt>
              <dd className="text-muted-foreground">{what}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
}

export const HOME: Record<Role, string> = { operator: '/preshift', supervisor: '/stage', trainer: '/training' }

function Connection() {
  const connected = useLive((s) => s.connected)
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="connection">
      <span className={cn('size-2 rounded-full', connected ? 'bg-ok' : 'bg-hard')} />
      {connected ? 'Live' : 'No stream'}
    </span>
  )
}

/** Unattended idle and emergencies go to the supervisor, not the cab (doc 01 seatbelt table). */
function SupervisorNotifications() {
  const role = useSession((s) => s.role)
  const incidents = useIncidents(2000).data
  const seen = useRef<number | null>(null)
  useEffect(() => {
    if (!incidents?.length) return
    const last = incidents.at(-1)!.seq
    if (seen.current == null) { seen.current = last; return }
    for (const r of incidents.filter((x) => x.seq > seen.current!)) {
      if (role !== 'supervisor') continue
      if (r.event.type === 'unattended_idle') toast.warning('Unattended machine: EXC001 idling, belt off, seat empty', { description: r.event.reasons[0] })
      if (r.event.type === 'emergency') toast.error(`Emergency reported by ${r.event.operator_id}`, { description: r.note ?? undefined })
    }
    seen.current = last
  }, [incidents, role])
  return null
}

export function AppShell() {
  const { role, setRole, operatorId, setOperator } = useSession()
  const operators = useOperators().data
  const navigate = useNavigate()

  useEffect(() => { connectLive() }, [])

  const start = (id: ScenarioId) => {
    api.startScenario(id).then(
      () => toast(`Scenario ${id}: ${SCENARIOS[id].name}`, { description: SCENARIOS[id].blurb, duration: 2500 }),
      () => toast.error('Could not start the scenario: engine not reachable'),
    )
  }
  useHotkeys('1', () => start('1'))
  useHotkeys('2', () => start('2'))
  useHotkeys('3', () => start('3'))
  useHotkeys('4', () => start('4'))
  useHotkeys('e', () => navigate('/evidence'))
  const [keys, setKeys] = useState(false)
  useHotkeys('shift+slash', () => setKeys(true))

  const nav = NAV.filter((n) => n.roles.includes(role))

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <SupervisorNotifications />
      <Shortcuts open={keys} onOpenChange={setKeys} />
      <nav className="flex w-[68px] shrink-0 flex-col items-center gap-1 border-r bg-panel py-3" aria-label="Main">
        <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary" title="Foresight">
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /><path d="M12 2v2M12 20v2" /></svg>
        </div>
        {nav.map((n) => (
          <Tooltip key={n.to}>
            <TooltipTrigger asChild>
              <NavLink
                to={n.to}
                className={({ isActive }) => cn('flex size-12 flex-col items-center justify-center gap-0.5 rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground', isActive && 'bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary')}
                data-testid={`nav-${n.to.slice(1)}`}
              >
                <n.icon className="size-5" />
                <span className="max-w-full truncate px-0.5 text-[9px] leading-none">{n.short}</span>
              </NavLink>
            </TooltipTrigger>
            <TooltipContent side="right">{n.label}</TooltipContent>
          </Tooltip>
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-panel px-4">
          <span className="text-sm font-semibold tracking-wide">Foresight</span>
          <span className="hidden text-xs text-muted-foreground lg:inline">Smart operator assistant · EXC001</span>
          <ToggleGroup type="single" value={role} onValueChange={(v) => { if (v) { setRole(v as Role); navigate(HOME[v as Role]) } }} variant="outline" size="sm" className="ml-4" aria-label="Role">
            <ToggleGroupItem value="operator" className="px-3 text-xs data-[state=on]:bg-primary/15 data-[state=on]:text-primary">Operator</ToggleGroupItem>
            <ToggleGroupItem value="supervisor" className="px-3 text-xs data-[state=on]:bg-primary/15 data-[state=on]:text-primary">Supervisor</ToggleGroupItem>
            <ToggleGroupItem value="trainer" className="px-3 text-xs data-[state=on]:bg-primary/15 data-[state=on]:text-primary">Trainer</ToggleGroupItem>
          </ToggleGroup>
          <Select value={operatorId} onValueChange={setOperator}>
            <SelectTrigger size="sm" className="w-52 text-xs" aria-label="Operator" data-testid="operator-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(operators ?? [{ operator_id: operatorId, name: operatorId, level: 'standard', years: 0 }]).map((o) => (
                <SelectItem key={o.operator_id} value={o.operator_id} className="text-xs">
                  {o.name} · {o.operator_id} · <span className="capitalize">{o.level}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden items-center gap-1 md:flex" aria-label="Scenarios">
              {(Object.keys(SCENARIOS) as ScenarioId[]).map((id) => (
                <Tooltip key={id}>
                  <TooltipTrigger asChild>
                    <button onClick={() => start(id)} className="num flex size-7 items-center justify-center rounded-md border text-xs text-muted-foreground hover:border-primary hover:text-foreground" data-testid={`scenario-${id}`}>{id}</button>
                  </TooltipTrigger>
                  <TooltipContent>{SCENARIOS[id].name}: {SCENARIOS[id].blurb}</TooltipContent>
                </Tooltip>
              ))}
            </div>
            {MOCKED.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="rounded border border-dashed border-muted-foreground/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" data-testid="mock-badge">
                    Mock {MOCKED.map((m) => m.toUpperCase()).join(' ')}
                  </span>
                </TooltipTrigger>
                <TooltipContent>These modules are answered by fixtures in the browser, not the real services.</TooltipContent>
              </Tooltip>
            )}
            <Connection />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" className="size-8" onClick={() => setKeys(true)} aria-label="Keyboard shortcuts"><Keyboard className="size-4" /></Button>
              </TooltipTrigger>
              <TooltipContent>Shortcuts (?)</TooltipContent>
            </Tooltip>
            <AskPanel trigger={<Button size="sm" variant="outline" className="h-8"><MessageSquareText className="size-4" /> Ask</Button>} />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
