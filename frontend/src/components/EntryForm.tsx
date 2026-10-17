import { httpsCallable } from 'firebase/functions'
import { CalendarIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { es } from 'react-day-picker/locale'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { asDate, localDay } from '@/lib/days'
import { functions } from '@/lib/firebase'

// The function analyzes AND saves the entry; the Feed picks it up via its live query.
// Match the function's 120s timeout; the SDK's default 70s can cut off a slow first run.
const analyzeDailyEntry = httpsCallable<{ rawText: string; entryDate: string }>(functions, 'analyze_daily_entry', {
  timeout: 120_000,
})

export const calendarClassNames = {
  day_button: 'rounded-full! hover:bg-secondary data-[selected-single=true]:bg-tide-ink! data-[selected-single=true]:text-white!',
  today: 'rounded-full! bg-accent! text-accent-foreground',
}

export default function EntryForm() {
  const today = localDay(new Date()) // recomputed each render, so it rolls over at midnight
  const [picked, setPicked] = useState<string | null>(null) // null = today
  const [open, setOpen] = useState(false)
  const day = picked && picked < today ? picked : today
  const title = asDate(day).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await analyzeDailyEntry({ rawText: text, entryDate: day })
      setText('')
      setPicked(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la entrada. Inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-serif text-3xl font-medium first-letter:uppercase sm:text-4xl">{title}</h1>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            disabled={loading}
            aria-label={`Fecha de la entrada: ${title}. Cambiar fecha`}
            className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm tabular-nums outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            {asDate(day).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            <CalendarIcon className="size-4 text-tide-ink" aria-hidden />
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={8} className="w-auto rounded-2xl p-1 shadow-[0_24px_64px_-24px_#173a4280]">
            <Calendar
              mode="single"
              locale={es}
              required
              selected={asDate(day)}
              defaultMonth={asDate(day)}
              endMonth={asDate(today)}
              disabled={{ after: asDate(today) }}
              className="[--cell-size:--spacing(9)]"
              classNames={calendarClassNames}
              onSelect={(date) => {
                setPicked(localDay(date))
                setOpen(false)
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
      <label htmlFor="entry" className="sr-only">Entrada del diario</label>
      <textarea
        id="entry"
        rows={7}
        maxLength={20000}
        placeholder={day === today ? '¿Cómo te fue hoy?' : '¿Cómo te fue ese día?'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={loading}
        className="field-sizing-content min-h-48 w-full resize-none rounded-2xl bg-card p-5 font-serif text-lg leading-relaxed shadow-[0_1px_0_#cde0e3,0_12px_32px_-20px_#173a4255] outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" size="lg" className="self-end rounded-full px-5" disabled={loading || !text.trim()}>
        {loading ? 'Umi está leyendo…' : 'Guardar entrada'}
      </Button>
    </form>
  )
}
