import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getFunctions } from 'firebase/functions'

// Web config is public by design; access is enforced by Auth + firestore.rules.
const app = initializeApp({
  apiKey: 'AIzaSyAxAua5I4N0Nc4KShlqDGwnja5xdhCqCTQ',
  authDomain: 'umi-psi.firebaseapp.com',
  projectId: 'umi-psi',
  storageBucket: 'umi-psi.firebasestorage.app',
  messagingSenderId: '729294493960',
  appId: '1:729294493960:web:bee594c0e2f9b4204074bd',
})

export const auth = getAuth(app)
export const db = getFirestore(app)
export const functions = getFunctions(app)
