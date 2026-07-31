import { getApps, initializeApp } from 'firebase/app'
import { browserLocalPersistence, getAuth, onAuthStateChanged, setPersistence } from 'firebase/auth'

const PLATFORM_FIREBASE_APP_NAME = 'cleanzi-platform-admin'

const platformFirebaseConfig = {
  apiKey: import.meta.env.VITE_PLATFORM_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_PLATFORM_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_PLATFORM_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_PLATFORM_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_PLATFORM_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_PLATFORM_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_PLATFORM_FIREBASE_MEASUREMENT_ID,
}

const requiredConfigKeys = ['apiKey', 'authDomain', 'projectId', 'appId']

let authPersistencePromise = null
let authReadyPromise = null

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0
}

export function isPlatformFirebaseConfigured() {
  return requiredConfigKeys.every((key) => hasValue(platformFirebaseConfig[key]))
}

export function ensurePlatformFirebase() {
  if (!isPlatformFirebaseConfigured()) return null

  const existingApp = getApps().find((app) => app.name === PLATFORM_FIREBASE_APP_NAME)
  const app = existingApp || initializeApp(platformFirebaseConfig, PLATFORM_FIREBASE_APP_NAME)
  return { app, auth: getAuth(app) }
}

async function ensureAuthPersistence(auth) {
  if (!auth || typeof window === 'undefined') return
  if (!authPersistencePromise) {
    authPersistencePromise = setPersistence(auth, browserLocalPersistence).catch((error) => {
      console.warn('[platform-firebase] auth persistence setup failed', error)
    })
  }
  await authPersistencePromise
}

export async function ensurePlatformFirebaseAuthPersistence() {
  const auth = ensurePlatformFirebase()?.auth
  if (!auth) return null
  await ensureAuthPersistence(auth)
  return auth
}

export async function waitForPlatformFirebaseAuthReady(timeoutMs = 5000) {
  const auth = ensurePlatformFirebase()?.auth
  if (!auth) return null

  await ensureAuthPersistence(auth)
  if (auth.currentUser) return auth.currentUser

  if (!authReadyPromise) {
    authReadyPromise = new Promise((resolve) => {
      let settled = false
      let unsubscribe = null
      const finish = (user) => {
        if (settled) return
        settled = true
        unsubscribe?.()
        authReadyPromise = null
        resolve(user || auth.currentUser || null)
      }
      const timer = window.setTimeout(() => finish(auth.currentUser), Math.max(500, Number(timeoutMs) || 5000))
      unsubscribe = onAuthStateChanged(
        auth,
        (user) => {
          window.clearTimeout(timer)
          finish(user)
        },
        () => {
          window.clearTimeout(timer)
          finish(auth.currentUser)
        },
      )
    })
  }

  return authReadyPromise
}

export function getPlatformFirebaseApp() {
  return ensurePlatformFirebase()?.app || null
}
