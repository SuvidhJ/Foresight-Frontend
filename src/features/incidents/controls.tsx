import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FilePlus2, OctagonAlert, ShieldAlert, Siren, TriangleAlert, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { ManualReport } from '@/contract/types'
import { api } from '@/lib/api'
import { useIncidents, useOperatorId, useVerify } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { useLive } from '@/store/live'

export function TierIcon({ tier }: { tier: string }) {
  if (tier === 'hard') return <OctagonAlert className="size-4 text-hard" aria-label="Hard" />
  if (tier === 'soft') return <TriangleAlert className="size-4 text-soft" aria-label="Soft" />
  return <span className="inline-block size-2 rounded-full bg-muted-foreground" aria-label="Logged" />
}

export function ReportDialog() {
  const operator = useOperatorId()
  const moving = useLive((s) => !!s.cur && (s.cur.frame.machine.motion_commanded || s.cur.frame.machine.speed_mps > 0.1))
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Omit<ManualReport, 'operator_id' | 'machine_id'>>({ type: 'manual', category: 'near_miss', note: '' })
  const submit = async () => {
    await api.report({ ...form, operator_id: operator, machine_id: 'EXC001' })
    await qc.invalidateQueries({ queryKey: ['incidents'] })
    setOpen(false)
    setForm({ type: 'manual', category: 'near_miss', note: '' })
    toast.success(form.type === 'emergency' ? 'Emergency sent to the supervisor and logged' : 'Report logged')
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" data-testid="report"><FilePlus2 className="size-4" /> Report</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report an incident or near-miss</DialogTitle>
          <DialogDescription>From the cab this is one button or the voice command "report incident", and only once the machine has stopped. Near-misses and incidents are kept apart.</DialogDescription>
        </DialogHeader>
        {moving && form.type === 'manual' && (
          <div className="flex items-center gap-2 rounded-lg border border-soft/50 bg-soft/10 p-3 text-sm"><ShieldAlert className="size-4 text-soft" /> The machine is moving. The cab only allows reports once it has stopped; emergencies are always allowed.</div>
        )}
        <div className="grid gap-3">
          <ToggleGroup type="single" value={form.type} onValueChange={(v) => v && setForm({ ...form, type: v as ManualReport['type'] })} variant="outline" className="w-full">
            <ToggleGroupItem value="manual" className="flex-1">Report</ToggleGroupItem>
            <ToggleGroupItem value="emergency" className="flex-1"><Siren className="size-4" /> Emergency</ToggleGroupItem>
          </ToggleGroup>
          <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as ManualReport['category'] })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="near_miss">Near-miss</SelectItem>
              <SelectItem value="incident">Incident</SelectItem>
              <SelectItem value="hazard">Hazard spotted</SelectItem>
              <SelectItem value="machine_issue">Possible machine issue</SelectItem>
            </SelectContent>
          </Select>
          <Textarea placeholder="What happened? (optional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
        <DialogFooter>
          <Button onClick={submit} className={cn(form.type === 'emergency' && 'bg-hard text-white hover:bg-hard/90')}>Send</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function TamperControls() {
  const incidents = useIncidents().data
  const verify = useVerify().data
  const qc = useQueryClient()
  const target = incidents?.find((r) => r.event.warning_time_s != null) ?? incidents?.[Math.floor((incidents?.length ?? 0) / 2)]
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['incidents'] }), qc.invalidateQueries({ queryKey: ['verify'] })])
  if (!incidents?.length || !target) return null
  if (verify && !verify.ok) {
    return <Button variant="outline" size="sm" onClick={async () => { await api.restore(); await refresh() }}><Undo2 className="size-4" /> Restore row</Button>
  }
  return (
    <Button
      variant="outline"
      size="sm"
      className="border-dashed"
      data-testid="tamper"
      title="Demo only: edits a stored row directly in the database, as an attacker would"
      onClick={async () => {
        const ok = await api.tamper(target.seq).then((r) => r.ok).catch(() => false)
        if (!ok) { toast.error('Tamper endpoint not available (it only exists in demo mode)'); return }
        toast(`Record #${target.seq} edited directly in the database: warning time removed`)
        await refresh()
      }}
    >
      Simulate tampering (demo)
    </Button>
  )
}

