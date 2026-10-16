import { collection, doc, limit, onSnapshot, orderBy, query, type Timestamp } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import Modal from '@/components/Modal'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/lib/auth'
import { db, functions } from '@/lib/firebase'

type Change = { id: string; edits: { find: string; replace: string }[]; createdAt: Timestamp | null }

const saveProfile = httpsCallable<{ text: string }>(functions, 'save_profile')
const ensureProfile = httpsCallable(functions, 'ensure_profile')

export default function Profile() {
  const user = useAuth()
  const [saved, setSaved] = useState<string | null>(null)
  const [draft, setDraft] = useState<string | null>(null) // null = not editing, so Umi's live updates show through
  const [changes, setChanges] = useState<Change[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState<'confirm' | 'saved' | null>(null)

  useEffect(() => {
    if (!user) return
    ensureProfile().catch(() => {}) // first visit: creates the starting profile; the snapshot below shows it
    const unsubProfile = onSnapshot(
      doc(db, 'users', user.uid, 'profile', 'main'),
      (snap) => setSaved(snap.data()?.text ?? ''),
      (e) => setError(e.message),
    )
    const unsubChanges = onSnapshot(
      query(collection(db, 'users', user.uid, 'profileChanges'), orderBy('createdAt', 'desc'), limit(15)),
      (snap) => setChanges(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Change)),
      (e) => setError(e.message),
    )
    return () => {
      unsubProfile()
      unsubChanges()
    }
  }, [user])

  async function save() {
    if (draft === null) return
    setSaving(true)
    setError('')
    try {
      await saveProfile({ text: draft })
      setDraft(null)
      setDialog('saved')
    } catch (err) {
      setDialog(null)
      setError(err instanceof Error ? err.message : 'No se pudo guardar. Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const text = draft ?? saved ?? ''
  const dirty = draft !== null && draft !== saved

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <h1 className="font-serif text-3xl font-medium sm:text-4xl">Quién soy</h1>
        <p className="max-w-prose text-muted-foreground">
          Umi lee esto antes de responderte para conocerte mejor, y lo actualiza cuando le cuentas algo importante que cambió.
          Puedes editarlo cuando quieras.
        </p>
        {saved === null ? (
          <Skeleton className="h-96 w-full rounded-2xl" />
        ) : (
          <>
            <label htmlFor="profile" className="sr-only">Tu perfil</label>
            <textarea
              id="profile"
              value={text}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={30000}
              placeholder="Pega aquí tu quién-soy.md, o escribe quién eres con tus palabras."
              className="min-h-96 w-full resize-y rounded-2xl bg-card p-5 font-serif leading-relaxed shadow-[0_1px_0_#cde0e3,0_12px_32px_-20px_#173a4255] outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring"
            />
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              {dirty && (
                <Button variant="ghost" size="lg" className="rounded-full px-5" onClick={() => setDraft(null)} disabled={saving}>
                  Descartar
                </Button>
              )}
              <Button size="lg" className="rounded-full px-5" onClick={() => setDialog('confirm')} disabled={!dirty || saving}>
                Guardar cambios
              </Button>
            </div>
          </>
        )}
        <Modal open={dialog === 'confirm'} onClose={() => !saving && setDialog(null)} title="¿Guardar los cambios?">
          <p className="text-muted-foreground">Umi usará esta versión de Quién soy desde tu próxima entrada.</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" size="lg" className="rounded-full px-5" onClick={() => setDialog(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button size="lg" className="rounded-full px-5" onClick={save} disabled={saving} autoFocus>
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </Modal>
        <Modal open={dialog === 'saved'} onClose={() => setDialog(null)} title="Cambios guardados">
          <p className="text-muted-foreground">Tu Quién soy está actualizado.</p>
          <div className="mt-6 flex justify-end">
            <Button size="lg" className="rounded-full px-5" onClick={() => setDialog(null)} autoFocus>
              Listo
            </Button>
          </div>
        </Modal>
        {changes.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="font-serif text-xl font-medium">Lo que Umi ha actualizado</h2>
            <ul className="flex flex-col gap-3">
              {changes.map((c) => (
                <li key={c.id} className="flex flex-col gap-2 rounded-xl border bg-card/60 p-4 text-sm">
                  <time className="text-muted-foreground">
                    {c.createdAt?.toDate().toLocaleString('es', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) ?? 'Ahora'}
                  </time>
                  {c.edits.map((e, i) => (
                    <div key={i} className="flex flex-col gap-1 font-serif">
                      <del className="text-muted-foreground">{e.find}</del>
                      <ins className="text-tide-ink no-underline">{e.replace}</ins>
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Layout>
  )
}
