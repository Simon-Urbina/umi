import { signOut } from 'firebase/auth'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import Logo from '@/components/Logo'
import { auth } from '@/lib/firebase'

const link = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-3 py-1.5 text-sm transition-colors ${
    isActive ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
  }`

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 sm:px-6">
      <nav className="flex flex-wrap items-center gap-1 py-6">
        <span className="mr-auto flex items-center gap-2 font-serif text-xl font-semibold tracking-tight">
          <Logo />
          Umi
        </span>
        <NavLink to="/dashboard" className={link}>Diario</NavLink>
        <NavLink to="/patrones" className={link}>Patrones</NavLink>
        <NavLink to="/horizonte" className={link}>Horizonte</NavLink>
        <NavLink to="/quien-soy" className={link}>Quién soy</NavLink>
        <button
          type="button"
          onClick={() => signOut(auth)}
          className="rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          Salir
        </button>
      </nav>
      {children}
    </div>
  )
}
