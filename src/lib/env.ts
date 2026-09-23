/**
 * Which modules are mocked in the browser. VITE_MOCK is a comma list of m1, m2, m4;
 * "none" or empty means everything goes to the real services. Default: all mocked.
 */
const raw: string = import.meta.env.VITE_MOCK ?? 'm1,m2,m4'

export const MOCKED = raw
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter((s): s is 'm1' | 'm2' | 'm4' => s === 'm1' || s === 'm2' || s === 'm4')

/** ?sample=1 fills the evidence page with a labelled layout sample (never a result). */
export const SAMPLE_EVIDENCE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('sample')
