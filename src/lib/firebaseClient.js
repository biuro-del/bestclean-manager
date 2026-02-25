import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

function requireEnv(name, value) {
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
}

let cachedClient = null;

export function createFirebaseClient() {
  if (cachedClient) {
    return cachedClient;
  }

  requireEnv("VITE_FIREBASE_API_KEY", config.apiKey);
  requireEnv("VITE_FIREBASE_AUTH_DOMAIN", config.authDomain);
  requireEnv("VITE_FIREBASE_PROJECT_ID", config.projectId);
  requireEnv("VITE_FIREBASE_APP_ID", config.appId);

  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  cachedClient = { app, auth, db };
  return cachedClient;
}
