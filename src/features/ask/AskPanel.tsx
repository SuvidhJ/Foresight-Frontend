import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Loader2, Send, Sparkles, Wrench } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import type { AgentAnswer } from '@/contract/types'
import { api } from '@/lib/api'
import { useOperatorId } from '@/lib/queries'
import { speak } from '@/lib/speech'

const SUGGESTIONS = ['Why is my fuel burn high today?', 'Can I finish Trench D before the rain?', "What's next?", 'Is it safe ahead?']

export function AnswerCard({ a, q }: { a: AgentAnswer; q?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border bg-card p-4" data-testid="agent-answer">
      {(q || a.transcript) && <div className="mb-2 text-sm text-muted-foreground">“{q ?? a.transcript}”</div>}
      <p className="text-base leading-relaxed">{a.text}</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Wrench className="size-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Data from</span>
        {a.tools_used.length ? a.tools_used.map((t) => <Badge key={t} variant="secondary" className="num text-[11px]">{t}</Badge>) : <span className="text-xs text-muted-foreground">no tools (no answer given)</span>}
      </div>
    </motion.div>
  )
}

/**
 * Ask Foresight: open questions go to M4's bounded local agent. It can only call read-only
 * tools, and the answer lists which ones it used, so every number is traceable.
 */
export function AskPanel({ trigger }: { trigger: React.ReactNode }) {
  const operator = useOperatorId()
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState<{ q: string; a: AgentAnswer }[]>([])

  const ask = async (question: string) => {
    if (!question.trim() || busy) return
    setBusy(true)
    setQ('')
    try {
      const a = await api.ask(operator, question)
      setHistory((h) => [{ q: question, a }, ...h].slice(0, 5))
      speak(a.text)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /> Ask Foresight</SheetTitle>
          <SheetDescription>Runs locally. Reads your data through read-only tools; it can't change settings, dismiss alerts or write to the log.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void ask(q) }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ask about tasks, fuel, alerts, weather…"
              className="h-11 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus:border-primary"
              data-testid="ask-input"
            />
            <Button type="submit" size="lg" className="h-11" disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}</Button>
          </form>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => ask(s)} className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground">{s}</button>
            ))}
          </div>
          <AnimatePresence initial={false}>
            {history.map((h, i) => <AnswerCard key={history.length - i} a={h.a} q={h.q} />)}
          </AnimatePresence>
        </div>
      </SheetContent>
    </Sheet>
  )
}
