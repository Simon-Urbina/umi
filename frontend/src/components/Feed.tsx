import { collection, limit, onSnapshot, orderBy, query, type Timestamp } from 'firebase/firestore'
import { Waves } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import Tide from '@/components/Tide'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/lib/auth'
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

const TIDE_ENTRIES = 14

export default function Feed() {
  const user = useAuth()
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    // shortcut: last 50 only, add pagination when someone has more history than that
    const q = query(collection(db, 'users', user.uid, 'entries'), orderBy('createdAt', 'desc'), limit(50))
    return onSnapshot(
      q,
      (snap) => setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Entry)),
      (e) => setError(e.message),
    )
  }, [user])

  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>
  if (!entries) return <Skeleton className="h-32 w-full rounded-2xl" />
  if (!entries.length)
    return <p className="text-muted-foreground">Tu primera entrada aparecerá aquí, junto con la respuesta de Umi.</p>

  return (
    <section className="flex flex-col gap-10">
      <Tide moods={entries.slice(0, TIDE_ENTRIES).map((e) => e.moodScore).reverse()} />
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
                <p className="font-serif text-lg leading-relaxed whitespace-pre-wrap">{e.rawText}</p>
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
