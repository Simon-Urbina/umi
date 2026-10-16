import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { useState } from 'react'
import { Navigate } from 'react-router'
import Logo from '@/components/Logo'
import { tidePath } from '@/components/Tide'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { auth } from '@/lib/firebase'

const swell = tidePath([4, 6, 5, 7, 6, 8, 7])
const undertow = tidePath([6, 4, 5, 3, 5, 4, 6])

export default function Login() {
  const user = useAuth()
  const [error, setError] = useState('')
  if (user) return <Navigate to="/dashboard" replace />

  const signIn = () => signInWithPopup(auth, new GoogleAuthProvider()).catch((e) => setError(e.message))

  return (
    <main className="relative flex min-h-svh flex-col overflow-hidden">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-4 pb-48 sm:px-6">
        <p lang="ja" className="font-serif text-8xl leading-none text-coral-ink sm:text-9xl" aria-label="Umi, mar en japonés">
          海
        </p>
        <h1 className="flex items-center gap-3 font-serif text-5xl font-medium tracking-tight sm:text-6xl">
          <Logo className="size-12 sm:size-14" />
          Umi
        </h1>
        <p className="max-w-md font-serif text-xl leading-relaxed text-muted-foreground">
          Escribe cómo te fue. Umi te lee con calma, te responde con cariño y te ayuda a ver tus mareas con el tiempo.
        </p>
        <Button size="lg" className="h-11 self-start rounded-full px-6 text-base" onClick={signIn} disabled={user === undefined}>
          Entrar con Google
        </Button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
      <svg viewBox="0 0 600 120" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-48 w-full" aria-hidden>
        <path d={`${swell} L600,120 L0,120 Z`} fill="var(--coral)" fillOpacity="0.45" />
        <path d={`${undertow} L600,120 L0,120 Z`} fill="var(--tide)" transform="translate(0 30)" />
      </svg>
    </main>
  )
}
