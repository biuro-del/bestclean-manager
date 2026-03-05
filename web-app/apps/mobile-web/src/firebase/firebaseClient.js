import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAnalytics, isSupported } from 'firebase/analytics'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import { connectDataConnectEmulator, getDataConnect } from 'firebase/data-connect'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { connectorConfig } from '@dataconnect/generated'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCq2sF92ezbmMc4cvmEKy672r9Y9PEXtYw',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'iclean2-2e798.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'iclean2-2e798',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'iclean2-2e798.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '841744028239',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:841744028239:web:79d2d50ca545e62006503a',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-QX1P8GGH2Y',
}

const requiredConfigKeys = ['apiKey', 'authDomain', 'projectId', 'appId']

let analyticsPromise = null
let emulatorConnected = false
let authReadyPromise = null

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isTrue(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase() === 'true'
}

export function isFirebaseConfigured() {
  return requiredConfigKeys.every((key) => hasValue(firebaseConfig[key]))
}

export function ensureFirebaseApp() {
  if (!isFirebaseConfigured()) {
    return null
  }

  if (getApps().length > 0) {
    return getApp()
  }
  return initializeApp(firebaseConfig)
}

export function ensureFirebaseAnalytics() {
  if (!isFirebaseConfigured()) {
    return Promise.resolve(null)
  }

  if (!analyticsPromise) {
    analyticsPromise = (async () => {
      const app = ensureFirebaseApp()
      if (!app) {
        return null
      }

      const supported = await isSupported()
      if (!supported) {
        return null
      }
      return getAnalytics(app)
    })().catch(() => null)
  }
  return analyticsPromise
}

export function ensureFirebase() {
  const app = ensureFirebaseApp()
  if (!app) {
    return null
  }

  const auth = getAuth(app)
  const db = getFirestore(app)
  const storage = getStorage(app)
  const dataConnect = getDataConnect(connectorConfig)
  const emulatorHost = import.meta.env.VITE_DATACONNECT_EMULATOR_HOST
  const emulatorPort = Number(import.meta.env.VITE_DATACONNECT_EMULATOR_PORT ?? 9399)
  const useEmulators = isTrue(import.meta.env.VITE_USE_EMULATORS)

  if (!emulatorConnected && useEmulators && hasValue(emulatorHost)) {
    connectDataConnectEmulator(dataConnect, emulatorHost, emulatorPort)
    emulatorConnected = true
  }

  return {
    app,
    auth,
    db,
    storage,
    dataConnect,
  }
}

export function waitForFirebaseAuthReady() {
  const firebase = ensureFirebase()
  if (!firebase?.auth) {
    return Promise.resolve(null)
  }

  const auth = firebase.auth
  if (auth.currentUser) {
    return Promise.resolve(auth.currentUser)
  }

  if (!authReadyPromise) {
    authReadyPromise = new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(
        auth,
        (user) => {
          try {
            unsubscribe()
          } catch {
            // Ignore.
          }
          authReadyPromise = null
          resolve(user || null)
        },
        () => {
          try {
            unsubscribe()
          } catch {
            // Ignore.
          }
          authReadyPromise = null
          resolve(auth.currentUser || null)
        },
      )
    })
  }

  return authReadyPromise
}
