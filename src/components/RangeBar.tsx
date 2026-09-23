import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

/**
 * P10–P90 band with a P50 tick on a shared scale, so tasks can be compared at a glance.
 * An optional `actual` marker shows where a finished task landed.
 */
export function RangeBar({ p10, p50, p90, max, actual, className }: { p10: number; p50: number; p90: number; max: number; actual?: number | null; className?: string }) {
  const x = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`
  return (
    <div className={cn('relative h-3 w-full rounded-full bg-muted', className)}>
      <motion.div
        className="absolute inset-y-0 rounded-full bg-primary/30 ring-1 ring-primary/50"
        initial={false}
        animate={{ left: x(p10), width: `calc(${x(p90)} - ${x(p10)})` }}
        transition={{ type: 'spring', stiffness: 220, damping: 28 }}
      />
      <motion.div
        className="absolute -top-1 h-5 w-1 -translate-x-1/2 rounded bg-primary"
        initial={false}
        animate={{ left: x(p50) }}
        transition={{ type: 'spring', stiffness: 220, damping: 28 }}
      />
      {actual != null && (
        <div className="absolute -top-1.5 h-6 w-0.5 -translate-x-1/2 bg-foreground" style={{ left: x(actual) }} title={`Actual ${actual} min`} />
      )}
    </div>
  )
}
