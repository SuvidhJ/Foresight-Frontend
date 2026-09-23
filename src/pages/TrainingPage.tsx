import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import { BookOpen, CalendarCheck, CheckCircle2, Clock, PlayCircle, ThumbsDown, ThumbsUp, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader, Panel } from '@/components/Stat'
import type { Lesson } from '@/contract/types'
import { api } from '@/lib/api'
import { useOperatorId, useOperators, useTrainer, useTraining } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { useSession } from '@/store/session'

function LessonDialog({ lesson, onClose }: { lesson: Lesson | null; onClose: () => void }) {
  const operator = useOperatorId()
  const qc = useQueryClient()
  const [answers, setAnswers] = useState<number[]>([])
  const [result, setResult] = useState<{ score: number; correct: boolean[] } | null>(null)
  const close = () => { setAnswers([]); setResult(null); onClose() }
  const submit = async () => {
    if (!lesson) return
    const r = await api.quiz(operator, lesson.lesson_id, answers)
    setResult(r)
    await qc.invalidateQueries({ queryKey: ['training'] })
  }
  return (
    <Dialog open={!!lesson} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {lesson && (
          <>
            <DialogHeader>
              <DialogTitle>{lesson.title}</DialogTitle>
              <DialogDescription>{lesson.minutes} min · card, short clip and a 3-question check</DialogDescription>
            </DialogHeader>
            <div className="prose-sm space-y-2 text-sm leading-relaxed [&_h3]:text-base [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-foreground">
              <ReactMarkdown>{lesson.card_md}</ReactMarkdown>
            </div>
            {lesson.video_path ? (
              <video src={lesson.video_path} controls className="w-full rounded-lg border" />
            ) : (
              <div className="flex h-24 items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground"><PlayCircle className="size-5" /> Clip stored on the machine (not included in this build)</div>
            )}
            <div className="space-y-4">
              {lesson.quiz.map((q, qi) => (
                <div key={q.q}>
                  <div className="mb-2 text-sm font-medium">{qi + 1}. {q.q}</div>
                  <div className="grid gap-1.5">
                    {q.options.map((o, oi) => {
                      const picked = answers[qi] === oi
                      const right = result && q.answer_idx === oi
                      const wrong = result && picked && q.answer_idx !== oi
                      return (
                        <button
                          key={o}
                          disabled={!!result}
                          onClick={() => setAnswers((a) => { const n = [...a]; n[qi] = oi; return n })}
                          className={cn('flex min-h-11 items-center gap-2 rounded-lg border px-3 text-left text-sm', picked && !result && 'border-primary bg-primary/10', right && 'border-ok bg-ok/10', wrong && 'border-hard bg-hard/10')}
                        >
                          {right && <CheckCircle2 className="size-4 text-ok" />}{wrong && <XCircle className="size-4 text-hard" />}{o}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
            {result ? (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <span className="num text-lg font-semibold">{result.score} / {lesson.quiz.length}</span>
                <Button onClick={close}>Done</Button>
              </div>
            ) : (
              <Button disabled={answers.filter((a) => a != null).length < lesson.quiz.length} onClick={submit} data-testid="quiz-submit">Check answers</Button>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function OperatorTraining() {
  const operator = useOperatorId()
  const data = useTraining().data
  const qc = useQueryClient()
  const [open, setOpen] = useState<Lesson | null>(null)
  if (!data) return <div className="text-sm text-muted-foreground">Loading…</div>
  const lesson = (id: string) => data.lessons.find((l) => l.lesson_id === id)!

  return (
    <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-5">
        <Panel title={<span className="flex items-center gap-2"><BookOpen className="size-4 text-primary" /> Assigned from your own shifts</span>}>
          <div className="space-y-2" data-testid="assigned">
            {data.assigned.length === 0 && <p className="text-sm text-muted-foreground">Nothing assigned: no coaching flags in your recent shifts.</p>}
            {data.assigned.map((a, i) => {
              const l = lesson(a.lesson_id)
              return (
                <motion.div key={a.lesson_id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.12 }} className="rounded-xl border bg-background/40 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="font-medium">{l.title}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground"><Clock className="size-3" /> {l.minutes} min{a.done && <Badge className="bg-ok/15 text-ok">Done · {a.score}/3</Badge>}</div>
                    </div>
                    <Button size="sm" variant={a.done ? 'secondary' : 'default'} onClick={() => setOpen(l)} data-testid={`open-${a.lesson_id}`}>{a.done ? 'Review' : 'Start'}</Button>
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground"><span className="font-medium text-foreground">Why:</span> {a.because}</div>
                </motion.div>
              )
            })}
          </div>
        </Panel>
        <Panel title="Library">
          <div className="grid gap-2 sm:grid-cols-2">
            {data.lessons.map((l) => (
              <button key={l.lesson_id} onClick={() => setOpen(l)} className="rounded-lg border bg-background/30 p-3 text-left text-sm hover:border-primary/60">
                <div className="font-medium">{l.title}</div>
                <div className="text-xs text-muted-foreground">{l.minutes} min</div>
              </button>
            ))}
          </div>
        </Panel>
      </div>

      <div className="space-y-5">
        <Panel title={<span className="flex items-center gap-2"><CalendarCheck className="size-4 text-primary" /> Instructor sessions</span>}>
          <div className="space-y-2">
            {data.slots.map((s) => (
              <div key={s.slot_id} className="flex items-center gap-3 rounded-lg border bg-background/40 p-3">
                <div className="flex-1 text-sm"><div className="font-medium">{s.time} · {s.instructor}</div><div className="text-xs text-muted-foreground">{s.topic}</div></div>
                <Button size="sm" variant={s.booked ? 'secondary' : 'outline'} disabled={s.booked} onClick={async () => { await api.book(operator, s.slot_id); await qc.invalidateQueries({ queryKey: ['training'] }); toast.success(`Booked: ${s.time}`) }}>
                  {s.booked ? 'Booked' : 'Book'}
                </Button>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Suggested after 2 seatbelt flags in 5 shifts, or any hard event.</p>
        </Panel>
        <Panel title="Tips for you">
          <div className="space-y-2">
            {data.tips.map((t) => (
              <div key={t.tip_id} className="rounded-lg border bg-background/40 p-3">
                <div className="text-sm font-medium">{t.text}</div>
                <div className="mt-1 text-xs text-muted-foreground">{t.reason}</div>
                <div className="mt-2 flex items-center gap-2">
                  {(['up', 'down'] as const).map((fb) => (
                    <Button key={fb} size="sm" variant={t.feedback === fb ? 'default' : 'ghost'} className="h-8" aria-label={fb === 'up' ? 'Helpful' : 'Not helpful'} onClick={async () => { await api.tipFeedback(t.tip_id, fb); await qc.invalidateQueries({ queryKey: ['training'] }) }}>
                      {fb === 'up' ? <ThumbsUp className="size-4" /> : <ThumbsDown className="size-4" />}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">A tip type rejected twice in a row pauses for 5 shifts. Safety alerts are never paused by feedback.</p>
        </Panel>
      </div>
      <LessonDialog lesson={open} onClose={() => setOpen(null)} />
    </div>
  )
}

function TrainerView() {
  const rows = useTrainer().data ?? []
  return (
    <Panel title="Who has which lesson, and did it help?">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Operator</TableHead><TableHead>Lesson</TableHead><TableHead>Quiz</TableHead><TableHead>Flags in 5 shifts before</TableHead><TableHead>After</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.operator_id + r.lesson_id}>
              <TableCell>{r.name} <span className="text-xs text-muted-foreground">{r.operator_id}</span></TableCell>
              <TableCell>{r.lesson_title}</TableCell>
              <TableCell className="num">{r.score != null ? `${r.score}/3` : <span className="text-muted-foreground">not taken</span>}</TableCell>
              <TableCell className="num">{r.flags_before}</TableCell>
              <TableCell className="num">{r.flags_after != null ? <span className={cn(r.flags_after < r.flags_before && 'text-ok')}>{r.flags_after}</span> : <span className="text-muted-foreground">waiting</span>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="mt-3 text-xs text-muted-foreground">Success is measured by whether the flag that triggered the lesson drops over the next 5 shifts.</p>
    </Panel>
  )
}

export default function TrainingPage() {
  const role = useSession((s) => s.role)
  const operator = useOperatorId()
  const name = useOperators().data?.find((o) => o.operator_id === operator)?.name
  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader title="Training hub" sub={role === 'trainer' ? 'Lessons are assigned from each operator\'s own flags; this view shows whether they helped.' : `${name ?? operator}: short lessons triggered by what happened on your own shifts.`} />
      <AnimatePresence mode="wait">{role === 'trainer' ? <TrainerView key="t" /> : <OperatorTraining key="o" />}</AnimatePresence>
    </div>
  )
}
