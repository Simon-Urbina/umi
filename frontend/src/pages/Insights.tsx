import { collection, limit, onSnapshot, orderBy, query, type Timestamp } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { useEffect, useState } from 'react'
import Markdown from 'react-markdown'
import Layout from '@/components/Layout'
import Stats from '@/components/Stats'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/lib/auth'
import { db, functions } from '@/lib/firebase'

type Report = { id: string; report: string; sources: number; createdAt: Timestamp | null }

// Each level reads the one below it: entries -> patterns -> horizons.
const LEVELS = {
  patterns: {
    fn: 'generate_patterns',
    title: 'Tus patrones',
    intro: 'Umi lee tus últimos 30 días con entradas y te cuenta qué se repite: cómo ha ido tu ánimo, qué temas vuelven y cómo vas con tus metas. Cada informe se guarda y alimenta tu Horizonte.',
    sources: 'días',
    heading: '[&_h2]:text-tide-ink',
  },
  horizons: {
    fn: 'generate_horizon',
    title: 'Tu horizonte',
    intro: 'Mirando desde lejos: Umi lee tus últimos informes de patrones y te cuenta cómo has ido cambiando, qué se mantiene y qué has logrado.',
    sources: 'informes',
    heading: '[&_h2]:text-coral-ink',
  },
} as const

const when = (r: Report) =>
  r.createdAt?.toDate().toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }) ?? 'Ahora'

export default function Insights({ kind }: { kind: keyof typeof LEVELS }) {
  const level = LEVELS[kind]
  const user = useAuth()
  const [reports, setReports] = useState<Report[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    // shortcut: last 20 only, add pagination if the history grows past that
    const q = query(collection(db, 'users', user.uid, kind), orderBy('createdAt', 'desc'), limit(20))
    return onSnapshot(
      q,
      (snap) => setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Report)),
      (e) => setError(e.message),
    )
  }, [user, kind])

  async function run() {
    setLoading(true)
    setError('')
    try {
      await httpsCallable(functions, level.fn, { timeout: 120_000 })() // saved server-side; the live query shows it
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el informe. Inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const [latest, ...older] = reports ?? []

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <h1 className="font-serif text-3xl font-medium sm:text-4xl">{level.title}</h1>
        <p className="max-w-prose text-muted-foreground">{level.intro}</p>
        {kind === 'patterns' && <Stats />}
        <Button size="lg" className="self-start rounded-full px-5" onClick={run} disabled={loading}>
          {loading ? 'Umi está leyendo…' : latest ? 'Generar uno nuevo' : 'Generar informe'}
        </Button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {loading || !reports ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-7 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          latest && (
            <article className={`rounded-2xl bg-card p-6 font-serif text-lg leading-relaxed shadow-[0_1px_0_#cde0e3,0_12px_32px_-20px_#173a4255] sm:p-8 [&_h1]:mb-2 [&_h1]:text-2xl [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h2:first-child]:mt-0 [&_li]:ml-5 [&_li]:list-disc [&_p]:my-3 [&_strong]:font-semibold ${level.heading}`}>
              <p className="!mt-0 mb-6 font-sans text-sm text-muted-foreground">
                {when(latest)}, a partir de {latest.sources} {level.sources}
              </p>
              <Markdown>{latest.report}</Markdown>
            </article>
          )
        )}
        {older.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="font-serif text-xl font-medium">Anteriores</h2>
            {older.map((r) => (
              <details key={r.id} className="group rounded-xl border bg-card/60 px-4 py-3">
                <summary className="cursor-pointer text-muted-foreground group-open:mb-3">{when(r)}</summary>
                <div className={`font-serif leading-relaxed [&_h2]:mt-5 [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:my-2 ${level.heading}`}>
                  <Markdown>{r.report}</Markdown>
                </div>
              </details>
            ))}
          </section>
        )}
      </div>
    </Layout>
  )
}
