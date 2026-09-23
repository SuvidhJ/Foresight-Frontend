import { motion } from 'motion/react'
import { Link2, Link2Off, ShieldCheck, ShieldX } from 'lucide-react'
import type { IncidentRecord, VerifyResult } from '@/contract/types'
import { cn } from '@/lib/utils'

/** "Integrity verified" from recomputing the SHA-256 chain, or the first broken row. */
export function IntegrityBadge({ v, className }: { v: VerifyResult | undefined; className?: string }) {
  if (!v) return <div className={cn('h-10 w-56 animate-pulse rounded-lg bg-card', className)} />
  return (
    <motion.div
      key={String(v.ok)}
      initial={{ scale: 0.96, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold', v.ok ? 'border-ok/50 bg-ok/10 text-ok' : 'border-hard bg-hard/15 text-hard', className)}
      data-testid="integrity"
      data-ok={v.ok}
    >
      {v.ok ? <ShieldCheck className="size-5" /> : <ShieldX className="size-5" />}
      {v.ok ? <>Integrity verified · <span className="num">{v.checked}</span> records</> : <>Chain broken at record #{v.first_broken_seq}</>}
    </motion.div>
  )
}

/** The last records as chain links; links from the first broken record onwards turn red. */
export function ChainStrip({ records, brokenAt }: { records: IncidentRecord[]; brokenAt: number | null }) {
  const last = records.slice(-14)
  return (
    <div className="flex items-center gap-1 overflow-x-auto py-1" aria-label="Hash chain">
      {last.map((r) => {
        const broken = brokenAt != null && r.seq >= brokenAt
        return (
          <div key={r.seq} className="flex items-center gap-1">
            <div className={cn('num rounded-md border px-1.5 py-0.5 text-[10px]', broken ? 'border-hard text-hard' : 'border-border text-muted-foreground')} title={`#${r.seq} ${r.hash}`}>
              #{r.seq} {r.hash.slice(0, 4)}
            </div>
            {broken ? <Link2Off className="size-3.5 text-hard" /> : <Link2 className="size-3.5 text-muted-foreground" />}
          </div>
        )
      })}
    </div>
  )
}
