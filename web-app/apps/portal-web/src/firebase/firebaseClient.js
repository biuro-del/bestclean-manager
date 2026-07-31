import { initializeApp, getApp, getApps } from 'firebase/app'
import { browserLocalPersistence, getAuth, onAuthStateChanged, setPersistence } from 'firebase/auth'
import { ReCaptchaEnterpriseProvider, initializeAppCheck } from 'firebase/app-check'
import { connectDataConnectEmulator, getDataConnect } from 'firebase/data-connect'
import { connectorConfig } from '@dataconnect/generated'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const dataConnectConfig = {
  connector: import.meta.env.VITE_DATACONNECT_CONNECTOR,
  service: import.meta.env.VITE_DATACONNECT_SERVICE,
  location: import.meta.env.VITE_DATACONNECT_LOCATION,
}

const requiredConfigKeys = ['apiKey', 'authDomain', 'projectId', 'appId']

let emulatorConnected = false
let appCheckInitialized = false
let authPersistencePromise = null
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

export function isDataConnectConfigured() {
  return ['connector', 'service', 'location'].every((key) => hasValue(dataConnectConfig[key]))
}

export function getDataSourceLabel() {
  return isFirebaseConfigured() ? 'Data Connect' : 'Mock'
}

export function ensureFirebase() {
  if (!isFirebaseConfigured()) {
    return null
  }

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
  const appCheckSiteKey = String(import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY ?? '').trim()
  if (!appCheckInitialized && appCheckSiteKey && typeof window !== 'undefined') {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    })
    appCheckInitialized = true
  }
  const auth = getAuth(app)
  Object.assign(connectorConfig, dataConnectConfig)
  const dataConnect = isDataConnectConfigured() ? getDataConnect(connectorConfig) : null

  const emulatorHost = import.meta.env.VITE_DATACONNECT_EMULATOR_HOST
  const emulatorPort = Number(import.meta.env.VITE_DATACONNECT_EMULATOR_PORT ?? 9399)
  const useEmulators = isTrue(import.meta.env.VITE_USE_EMULATORS)

  if (dataConnect && !emulatorConnected && useEmulators && hasValue(emulatorHost)) {
    connectDataConnectEmulator(dataConnect, emulatorHost, emulatorPort)
    emulatorConnected = true
  }

  return {
    app,
    auth,
    dataConnect,
  }
}

function ensureAuthPersistence(auth) {
  if (!auth || typeof window === 'undefined') {
    return Promise.resolve()
  }

  if (!authPersistencePromise) {
    authPersistencePromise = setPersistence(auth, browserLocalPersistence).catch((error) => {
      console.warn('[firebase] auth persistence setup failed', error)
    })
  }

  return authPersistencePromise
}

export async function ensureFirebaseAuthPersistence() {
  const firebase = ensureFirebase()
  if (!firebase?.auth) {
    return null
  }

  await ensureAuthPersistence(firebase.auth)
  return firebase.auth
}

export async function waitForFirebaseAuthReady(timeoutMs = 5000) {
  const firebase = ensureFirebase()
  const auth = firebase?.auth
  if (!auth) {
    return null
  }

  await ensureAuthPersistence(auth)

  if (auth.currentUser) {
    return auth.currentUser
  }

  if (!authReadyPromise) {
    authReadyPromise = new Promise((resolve) => {
      let settled = false
      let unsubscribe = null
      const finish = (user) => {
        if (settled) {
          return
        }
        settled = true
        if (unsubscribe) {
          unsubscribe()
        }
        authReadyPromise = null
        resolve(user || auth.currentUser || null)
      }

      const timer = window.setTimeout(() => finish(auth.currentUser || null), Math.max(500, Number(timeoutMs) || 5000))
      unsubscribe = onAuthStateChanged(
        auth,
        (user) => {
          window.clearTimeout(timer)
          finish(user)
        },
        () => {
          window.clearTimeout(timer)
          finish(auth.currentUser || null)
        },
      )
    })
  }

  return authReadyPromise
}
