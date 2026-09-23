import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { createColumnHelper, flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable, type SortingState } from '@tanstack/react-table'
import { ArrowUpDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { PageHeader, Panel } from '@/components/Stat'
import type { IncidentRecord } from '@/contract/types'
import { ReportDialog, TamperControls, TierIcon } from '@/features/incidents/controls'
import { ChainStrip, IntegrityBadge } from '@/features/incidents/IntegrityBadge'
import { clockSec, shortHash, titleCase } from '@/lib/format'
import { useIncidents, useVerify } from '@/lib/queries'

const col = createColumnHelper<IncidentRecord>()

const columns = [
  col.accessor('seq', { header: '#', cell: (c) => <span className="num text-muted-foreground">{c.getValue()}</span> }),
  col.accessor((r) => r.event.t, { id: 'time', header: 'Time', cell: (c) => <span className="num">{clockSec(new Date(c.getValue() * 1000))}</span> }),
  col.accessor((r) => r.event.tier, { id: 'tier', header: 'Tier', filterFn: 'equalsString', cell: (c) => <span className="flex items-center gap-2"><TierIcon tier={c.getValue()} /><span className="capitalize">{c.getValue()}</span></span> }),
  col.accessor((r) => r.event.type, { id: 'type', header: 'Type', filterFn: 'equalsString', cell: (c) => titleCase(c.getValue()) }),
  col.accessor((r) => r.event.source, { id: 'source', header: 'Source', cell: (c) => <Badge variant="outline" className="text-[10px] uppercase">{c.getValue()}</Badge> }),
  col.accessor((r) => r.event.warning_time_s ?? null, { id: 'warning', header: 'Warned before breach', cell: (c) => (c.getValue() != null ? <span className="num font-semibold text-primary">{(c.getValue() as number).toFixed(1)} s</span> : <span className="text-muted-foreground">—</span>) }),
  col.accessor((r) => r.event.reasons.join(' · '), { id: 'reasons', header: 'Reason', cell: (c) => <span className="line-clamp-2 max-w-md text-sm">{c.getValue()}</span> }),
  col.accessor((r) => r.outcome ?? '', { id: 'outcome', header: 'Outcome', cell: (c) => (c.getValue() ? titleCase(c.getValue()) : <span className="text-muted-foreground">open</span>) }),
  col.accessor('hash', { header: 'Hash', enableSorting: false, cell: (c) => <span className="num text-xs text-muted-foreground" title={c.getValue()}>{shortHash(c.getValue())}</span> }),
]

export default function IncidentsPage() {
  const incidents = useIncidents().data ?? []
  const verify = useVerify().data
  const [sorting, setSorting] = useState<SortingState>([{ id: 'seq', desc: true }])
  const [tier, setTier] = useState('all')
  const [type, setType] = useState('all')
  const types = useMemo(() => [...new Set(incidents.map((r) => r.event.type))], [incidents])
  const columnFilters = useMemo(() => [...(tier !== 'all' ? [{ id: 'tier', value: tier }] : []), ...(type !== 'all' ? [{ id: 'type', value: type }] : [])], [tier, type])
  const table = useReactTable({ data: incidents, columns, state: { sorting, columnFilters }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getFilteredRowModel: getFilteredRowModel() })
  const warned = incidents.map((r) => r.event.warning_time_s).filter((v): v is number => v != null)

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader title="Incident log" sub="Append-only. Each record stores the SHA-256 of the one before it, so editing any past row breaks every later hash.">
        <div className="flex items-center gap-2">
          <IntegrityBadge v={verify} />
          <TamperControls />
          <ReportDialog />
        </div>
      </PageHeader>

      <Panel className="mb-5" title="Hash chain" action={<span className="text-xs text-muted-foreground">h<sub>i</sub> = SHA256(h<sub>i−1</sub> ‖ record<sub>i</sub>)</span>}>
        <ChainStrip records={incidents} brokenAt={verify && !verify.ok ? verify.first_broken_seq : null} />
      </Panel>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <ToggleGroup type="single" value={tier} onValueChange={(v) => v && setTier(v)} variant="outline" size="sm">
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="hard">Hard</ToggleGroupItem>
          <ToggleGroupItem value="soft">Soft</ToggleGroupItem>
          <ToggleGroupItem value="log">Logged</ToggleGroupItem>
        </ToggleGroup>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger size="sm" className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {types.map((t) => <SelectItem key={t} value={t}>{titleCase(t)}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-muted-foreground">
          {incidents.length} records{warned.length ? <> · median warning <span className="num text-foreground">{[...warned].sort((a, b) => a - b)[Math.floor(warned.length / 2)].toFixed(1)} s</span></> : null}
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table data-testid="incident-table">
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id} className="text-xs">
                    {h.column.getCanSort() ? (
                      <button className="flex items-center gap-1" onClick={h.column.getToggleSortingHandler()}>
                        {flexRender(h.column.columnDef.header, h.getContext())}<ArrowUpDown className="size-3 opacity-50" />
                      </button>
                    ) : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            <AnimatePresence initial={false}>
              {table.getRowModel().rows.map((row) => {
                const broken = verify && !verify.ok && verify.first_broken_seq === row.original.seq
                return (
                  <motion.tr
                    key={row.id}
                    layout
                    initial={{ opacity: 0, backgroundColor: 'rgba(34,211,238,0.18)' }}
                    animate={{ opacity: 1, backgroundColor: broken ? 'rgba(239,68,68,0.15)' : 'rgba(0,0,0,0)' }}
                    transition={{ duration: 1.2 }}
                    className="border-b"
                  >
                    {row.getVisibleCells().map((c) => <TableCell key={c.id} className="py-2.5">{flexRender(c.column.columnDef.cell, c.getContext())}</TableCell>)}
                  </motion.tr>
                )
              })}
            </AnimatePresence>
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
