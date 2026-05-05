import { initializeApp, getApp, getApps } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { ReCaptchaEnterpriseProvider, initializeAppCheck } from 'firebase/app-check'
import { connectDataConnectEmulator, getDataConnect } from 'firebase/data-connect'
import { connectorConfig } from '@dataconnect/generated'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCdRVjbPWm6MueCHOwsmmbdkEKZoO6Dy-k',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'iclean-room.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'iclean-room',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:1080573912983:web:d64286e3776c009788c6d2',
}

const requiredConfigKeys = ['apiKey', 'authDomain', 'projectId', 'appId']

let emulatorConnected = false
let appCheckInitialized = false

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
    dataConnect,
  }
}
