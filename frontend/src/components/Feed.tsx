import { collection, onSnapshot, orderBy, query, where, type Timestamp } from 'firebase/firestore'
import { CalendarIcon, ChevronLeft, ChevronRight, Waves } from 'lucide-react'
import { useEffect, useState } from 'react'
import { es } from 'react-day-picker/locale'
import { Link } from 'react-router'
import { calendarClassNames } from '@/components/EntryForm'
import Tide, { dailyMoods } from '@/components/Tide'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/lib/auth'
import { addDays, asDate, localDay, mondayOf } from '@/lib/days'
import { db } from '@/lib/firebase'

type Entry = {
  id: string
  rawText: string
  createdAt: Timestamp | null // null until the server timestamp lands
  writtenAt?: Timestamp // only on entries written for a past day
  moodScore: number
  primaryEmotions: string[]
  keyTopics: string[]
  detectedGoals: string[]
  aiResponse: string
  profileEdits?: number
}

export default function Feed() {
  const user = useAuth()
  const [loaded, setLoaded] = useState<{ week: string; entries: Entry[] } | null>(null)
  const [error, setError] = useState('')

  const today = localDay(new Date()) // recomputed each render, so it rolls over at midnight
  const thisWeek = mondayOf(today)
  const [picked, setPicked] = useState<string | null>(null) // Monday of the chosen week; null = this week
  const [open, setOpen] = useState(false)
  const week = picked ?? thisWeek
  const sunday = addDays(week, 6)

  useEffect(() => {
    if (!user) return
    // Backdated entries sit at the end of their own day, so they land in that day's week.
    const q = query(
      collection(db, 'users', user.uid, 'entries'),
      where('createdAt', '>=', new Date(`${week}T00:00`)),
      where('createdAt', '<', new Date(`${addDays(week, 7)}T00:00`)),
      orderBy('createdAt', 'desc'),
    )
    return onSnapshot(
      q,
      (snap) => setLoaded({ week, entries: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Entry) }),
      (e) => setError(e.message),
    )
  }, [user, week])
  const entries = loaded?.week === week ? loaded.entries : null // a new week shows the skeleton until it loads

  const short = (day: string) => asDate(day).toLocaleDateString('es', { day: 'numeric', month: 'short' })
  const range = `${short(week)} – ${short(sunday)} ${asDate(sunday).getFullYear()}`
  const goTo = (monday: string) => setPicked(monday === thisWeek ? null : monday)

  const picker = (
    <nav aria-label="Semana" className="flex items-center justify-between gap-2">
      <Button variant="ghost" size="icon-lg" className="rounded-full" aria-label="Semana anterior" onClick={() => goTo(addDays(week, -7))}>
        <ChevronLeft aria-hidden />
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-label={`Semana del ${range}. Cambiar semana`}
          className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm tabular-nums outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
        >
          {week === thisWeek ? 'Esta semana' : range}
          <CalendarIcon className="size-4 text-tide-ink" aria-hidden />
        </PopoverTrigger>
        <PopoverContent sideOffset={8} className="w-auto rounded-2xl p-1 shadow-[0_24px_64px_-24px_#173a4280]">
          <Calendar
            mode="range"
            locale={es}
            selected={{ from: asDate(week), to: asDate(sunday) }}
            defaultMonth={asDate(week)}
            endMonth={asDate(today)}
            disabled={{ after: asDate(today) }}
            className="[--cell-size:--spacing(9)]"
            classNames={calendarClassNames}
            onDayClick={(date) => {
              goTo(mondayOf(localDay(date)))
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
      <Button
        variant="ghost"
        size="icon-lg"
        className="rounded-full"
        aria-label="Semana siguiente"
        disabled={week === thisWeek}
        onClick={() => goTo(addDays(week, 7))}
      >
        <ChevronRight aria-hidden />
      </Button>
    </nav>
  )

  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>
  if (!entries)
    return (
      <section className="flex flex-col gap-10">
        {picker}
        <Skeleton className="h-32 w-full rounded-2xl" />
      </section>
    )
  if (!entries.length)
    return (
      <section className="flex flex-col gap-10">
        {picker}
        <p className="text-muted-foreground">
          {week === thisWeek
            ? 'Tus entradas de esta semana aparecerán aquí, junto con la respuesta de Umi.'
            : 'No escribiste esa semana.'}
        </p>
      </section>
    )

  return (
    <section className="flex flex-col gap-10">
      {picker}
      <Tide moods={dailyMoods(entries).map((d) => d.moodScore).reverse()} />
      <ol className="flex flex-col">
        {entries.map((e) => {
          const date = e.createdAt?.toDate()
          return (
            <li key={e.id} className="grid grid-cols-[4.5rem_1fr] gap-4 border-t py-8 sm:grid-cols-[6rem_1fr] sm:gap-6">
              <div className="flex flex-col gap-1">
                <time className="text-sm text-muted-foreground" dateTime={date?.toISOString()}>
                  {date ? date.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Ahora'}
                  <br />
                  {/* a past-day entry carries an end-of-day placeholder time, so hide it */}
                  {!e.writtenAt && date?.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                </time>
                <span className="font-serif text-3xl text-tide-ink" aria-label={`Ánimo ${e.moodScore} de 10`}>
                  {e.moodScore}
                </span>
              </div>
              <div className="flex min-w-0 flex-col gap-4">
                <details className="group">
                  <summary className="cursor-pointer text-sm text-muted-foreground select-none hover:text-foreground">
                    <span className="group-open:hidden">Leer lo que escribí</span>
                    <span className="hidden group-open:inline">Ocultar lo que escribí</span>
                  </summary>
                  <p className="mt-3 font-serif text-lg leading-relaxed whitespace-pre-wrap">{e.rawText}</p>
                </details>
                {e.primaryEmotions.length + e.keyTopics.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5 text-sm">
                    {e.primaryEmotions.map((t) => (
                      <li key={`e-${t}`} className="rounded-full bg-secondary px-2.5 py-0.5 text-secondary-foreground">{t}</li>
                    ))}
                    {e.keyTopics.map((t) => (
                      <li key={`t-${t}`} className="rounded-full border px-2.5 py-0.5 text-muted-foreground">{t}</li>
                    ))}
                  </ul>
                )}
                {e.detectedGoals.length > 0 && (
                  <p className="text-sm text-muted-foreground">Te propusiste: {e.detectedGoals.join('; ')}</p>
                )}
                {e.aiResponse && (
                  <div className="flex gap-3 rounded-2xl bg-accent/70 p-4">
                    <Waves className="mt-1 size-4 shrink-0 text-coral-ink" aria-hidden />
                    <p className="font-serif leading-relaxed italic">{e.aiResponse}</p>
                  </div>
                )}
                {!!e.profileEdits && (
                  <Link to="/quien-soy" className="self-start text-sm text-coral-ink underline-offset-4 hover:underline">
                    Umi actualizó tu Quién soy
                  </Link>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
