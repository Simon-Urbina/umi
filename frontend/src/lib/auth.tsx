import { onAuthStateChanged, type User } from 'firebase/auth'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router'
import { auth } from '@/lib/firebase'

// undefined = still resolving the session, null = signed out
const AuthContext = createContext<User | null | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  useEffect(() => onAuthStateChanged(auth, setUser), [])
  return <AuthContext value={user}>{children}</AuthContext>
}

export const useAuth = () => useContext(AuthContext)

export function RequireAuth({ children }: { children: ReactNode }) {
  const user = useAuth()
  if (user === undefined) return null
  return user ? children : <Navigate to="/" replace />
}
