export function clock(d: Date) {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export function clockSec(d: Date) {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/** Clock time `minutes` from now. */
export function inMinutes(minutes: number, from = new Date()) {
  return clock(new Date(from.getTime() + minutes * 60_000))
}

export function mins(m: number) {
  if (m < 60) return `${Math.round(m)} min`
  const h = Math.floor(m / 60)
  const r = Math.round(m % 60)
  return r ? `${h} h ${r} min` : `${h} h`
}

export function pct(v: number | null | undefined, digits = 0) {
  return v == null ? '—' : `${v.toFixed(digits)}%`
}

export function secs(v: number | null | undefined, digits = 1) {
  return v == null ? '—' : `${v.toFixed(digits)} s`
}

export function shortHash(h: string) {
  return `${h.slice(0, 6)}…${h.slice(-4)}`
}

export function titleCase(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
