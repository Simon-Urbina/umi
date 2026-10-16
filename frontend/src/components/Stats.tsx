import { collection, getDocs, limit, orderBy, query, type Timestamp } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/lib/auth'
import { db } from '@/lib/firebase'

type Entry = { createdAt: Timestamp | null; moodScore: number; primaryEmotions: string[]; keyTopics: string[] }
type Row = { label: string; value: number; n: number }

const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const MIN_ENTRIES = 3

/** Groups entries by each key they carry and reports the average mood and the count per key. */
export function moodBy(entries: Entry[], keys: (e: Entry) => string[]): Row[] {
  const groups = new Map<string, number[]>()
  for (const e of entries) {
    for (const key of new Set(keys(e))) groups.set(key, [...(groups.get(key) ?? []), e.moodScore])
  }
  return [...groups].map(([label, moods]) => ({ label, value: moods.reduce((a, b) => a + b, 0) / moods.length, n: moods.length }))
}

const plural = (n: number) => `${n} ${n === 1 ? 'entrada' : 'entradas'}`

export function Bars({ title, note, rows, max, format }: {
  title: string
  note: string
  rows: Row[]
  max: number
  format: (r: Row) => string
}) {
  return (
    <figure className="flex flex-col gap-3">
      <figcaption>
        <h3 className="font-serif text-lg font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{note}</p>
      </figcaption>
      <ul className="flex flex-col gap-0.5">
        {rows.map((r) => (
          <li
            key={r.label}
            title={`${r.label}: ${format(r)} (${plural(r.n)})`}
            className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-3 rounded-md py-1 text-sm hover:bg-secondary/60 sm:grid-cols-[9rem_1fr_2.5rem]"
          >
            <span className="truncate first-letter:uppercase">{r.label}</span>
            <span className="h-3 rounded-r-[4px] bg-tide-ink" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
            <span className="text-right tabular-nums text-muted-foreground">{format(r)}</span>
          </li>
        ))}
      </ul>
    </figure>
  )
}

export default function Stats() {
  const user = useAuth()
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    // shortcut: last 500 entries, about a year and a half of daily writing; aggregate server-side past that
    const q = query(collection(db, 'users', user.uid, 'entries'), orderBy('createdAt', 'desc'), limit(500))
    getDocs(q)
      .then((snap) => setEntries(snap.docs.map((d) => d.data() as Entry)))
      .catch((e) => setError(e.message))
  }, [user])

  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>
  if (!entries) return <Skeleton className="h-48 w-full rounded-2xl" />
  if (entries.length < MIN_ENTRIES)
    return <p className="text-muted-foreground">Con unas cuantas entradas más verás aquí tus números.</p>

  const avg = (r: Row) => r.value.toFixed(1)
  const topics = moodBy(entries, (e) => e.keyTopics.map((t) => t.toLowerCase()))
    .filter((r) => r.n >= 2) // a topic seen once says nothing about a pattern
    .sort((a, b) => b.n - a.n)
    .slice(0, 6)
    .sort((a, b) => b.value - a.value)
  const emotions = moodBy(entries, (e) => e.primaryEmotions.map((t) => t.toLowerCase()))
    .map((r) => ({ ...r, value: r.n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 6)
  const byDay = moodBy(entries, (e) => (e.createdAt ? [WEEKDAYS[(e.createdAt.toDate().getDay() + 6) % 7]] : []))
    .sort((a, b) => WEEKDAYS.indexOf(a.label) - WEEKDAYS.indexOf(b.label))

  return (
    <section className="flex flex-col gap-8 rounded-2xl bg-card p-6 shadow-[0_1px_0_#cde0e3,0_12px_32px_-20px_#173a4255] sm:p-8">
      <div>
        <h2 className="font-serif text-2xl font-medium">Tus números</h2>
        <p className="text-sm text-muted-foreground">Calculados de tus últimas {plural(entries.length)}, sin IA.</p>
      </div>
      {topics.length > 0 && (
        <Bars title="Ánimo según el tema" note="Promedio de 1 a 10 en los temas que más escribes" rows={topics} max={10} format={avg} />
      )}
      <Bars
        title="Emociones que más aparecen"
        note="Cuántas entradas las mencionan"
        rows={emotions}
        max={Math.max(...emotions.map((r) => r.n))}
        format={(r) => String(r.n)}
      />
      <Bars title="Ánimo según el día" note="Promedio de 1 a 10 por día de la semana" rows={byDay} max={10} format={avg} />
    </section>
  )
}
