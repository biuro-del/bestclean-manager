import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { createFirebaseClient } from "../lib/firebaseClient";
import { AuthContext } from "./authContext";
import {
  clearStoredSession,
  getOrCreateDeviceId,
  getStoredSession,
  newSessionId,
  setAuthMessage,
  setStoredSession,
  takeAuthMessage,
} from "./sessionStorage";

const LOGIN_EMAIL_DOMAIN = String(import.meta.env.VITE_AUTH_LOGIN_DOMAIN || "auth.iclean.local").trim().toLowerCase();

function isEmailIdentifier(identifier) {
  return String(identifier || "").includes("@");
}

function normalizeLogin(login) {
  const value = String(login || "").trim().toLowerCase();
  if (!value) {
    throw new Error("Podaj login lub e-mail.");
  }
  if (!/^[a-z0-9._-]+$/.test(value)) {
    throw new Error("Login moze zawierac tylko litery bez polskich znakow, cyfry oraz . _ -");
  }
  return value;
}

function resolveAuthEmail(identifier) {
  const value = String(identifier || "").trim();
  if (!value) {
    throw new Error("Podaj login lub e-mail.");
  }
  if (isEmailIdentifier(value)) {
    return value.toLowerCase();
  }
  const login = normalizeLogin(value);
  return `${login}@${LOGIN_EMAIL_DOMAIN}`;
}

function isTechnicalLoginIdentifier(identifier) {
  return !isEmailIdentifier(identifier);
}

function isTechnicalEmail(identifier) {
  const value = String(identifier || "").trim().toLowerCase();
  return isEmailIdentifier(value) && value.endsWith(`@${LOGIN_EMAIL_DOMAIN}`);
}

function isTechnicalLoginInput(identifier) {
  return isTechnicalLoginIdentifier(identifier) || isTechnicalEmail(identifier);
}

function technicalEmailFromEmailIdentifier(identifier) {
  const value = String(identifier || "").trim().toLowerCase();
  if (!isEmailIdentifier(value)) return "";
  const localPart = value.split("@")[0] || "";
  try {
    const login = normalizeLogin(localPart);
    return `${login}@${LOGIN_EMAIL_DOMAIN}`;
  } catch {
    return "";
  }
}

function shouldTryTechnicalFallback(identifier, error) {
  if (!isEmailIdentifier(identifier) || isTechnicalEmail(identifier)) return false;
  const code = String(error?.code || "");
  return code === "auth/invalid-credential" || code === "auth/user-not-found" || code === "auth/wrong-password";
}

function isInactiveFlag(value) {
  if (value === false || value === 0) return true;
  const str = String(value ?? "").trim().toLowerCase();
  return str === "false" || str === "0" || str === "no" || str === "nie" || str === "inactive";
}

async function ensureUserIsActive(db, uid) {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) {
    return;
  }
  const activeRaw = userSnap.data()?.active;
  if (isInactiveFlag(activeRaw)) {
    throw new Error("Konto jest nieaktywne.");
  }
}

function normalizeLoginError(error) {
  const message = String(error?.message || "");
  if (message === "Konto jest nieaktywne.") return message;
  if (message === "Podaj login lub e-mail.") return message;
  if (message.startsWith("Login moze zawierac")) return message;

  const code = String(error?.code || "");
  if (code === "auth/invalid-credential") return "Nieprawidlowy login/e-mail lub haslo.";
  if (code === "auth/user-not-found") return "Nieprawidlowy login/e-mail lub haslo.";
  if (code === "auth/wrong-password") return "Nieprawidlowy login/e-mail lub haslo.";
  if (code === "auth/user-disabled") return "Konto jest zablokowane.";
  if (code === "auth/too-many-requests") return "Za duzo prob logowania. Sprobuj ponownie za chwile.";
  if (code === "auth/network-request-failed") return "Brak polaczenia z siecia.";
  return "Nie udalo sie zalogowac.";
}

async function writeActiveSession(db, user) {
  const uid = String(user?.uid || "");
  if (!uid) throw new Error("Missing user uid.");

  const sessionId = newSessionId();
  const deviceId = getOrCreateDeviceId();
  const nowIso = new Date().toISOString();
  const sessionRef = doc(db, "sessions", uid);

  await setDoc(
    sessionRef,
    {
      uid,
      email: String(user?.email || ""),
      activeSessionId: sessionId,
      deviceId,
      updatedAt: serverTimestamp(),
      updatedAtIso: nowIso,
    },
    { merge: true },
  );

  setStoredSession(uid, sessionId);
}

async function requireActiveSession(db, user) {
  const uid = String(user?.uid || "");
  const local = getStoredSession();
  if (!uid || !local || local.uid !== uid || !local.sessionId) {
    throw new Error("Sesja lokalna jest niepoprawna. Zaloguj sie ponownie.");
  }

  const snap = await getDoc(doc(db, "sessions", uid));
  if (!snap.exists()) {
    throw new Error("Sesja wygasla. Zaloguj sie ponownie.");
  }

  const activeSessionId = String(snap.data()?.activeSessionId || "");
  if (!activeSessionId || activeSessionId !== local.sessionId) {
    throw new Error("Twoje konto zostalo zalogowane na innym urzadzeniu.");
  }
}

export function AuthProvider({ children }) {
  const firebase = useMemo(() => createFirebaseClient(), []);
  const { auth, db } = firebase;
  const sessionUnsubRef = useRef(null);
  const loginInProgressRef = useRef(false);
  const pendingSessionUidRef = useRef("");

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authMessage, setAuthMessageState] = useState("");

  const forceLogout = useCallback(
    async (message) => {
      if (message) setAuthMessage(message);
      clearStoredSession();
      try {
        await signOut(auth);
      } catch {
        // noop
      }
    },
    [auth],
  );

  const waitForSessionDuringLogin = useCallback(async (uid) => {
    for (let i = 0; i < 40; i += 1) {
      const local = getStoredSession();
      if (local && local.uid === uid && local.sessionId) {
        return true;
      }
      if (!loginInProgressRef.current && pendingSessionUidRef.current !== uid) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (sessionUnsubRef.current) {
        sessionUnsubRef.current();
        sessionUnsubRef.current = null;
      }

      if (!nextUser) {
        pendingSessionUidRef.current = "";
        setUser(null);
        setLoading(false);
        setAuthMessageState(takeAuthMessage());
        return;
      }

      try {
        const localBefore = getStoredSession();
        if ((!localBefore || localBefore.uid !== nextUser.uid || !localBefore.sessionId) && loginInProgressRef.current) {
          await waitForSessionDuringLogin(nextUser.uid);
        }

        await requireActiveSession(db, nextUser);
        setUser(nextUser);
        setLoading(false);
        setAuthMessageState("");

        const sessionRef = doc(db, "sessions", nextUser.uid);
        sessionUnsubRef.current = onSnapshot(sessionRef, (snapshot) => {
          const local = getStoredSession();
          const activeSessionId = String(snapshot.data()?.activeSessionId || "");
          if (!local || local.uid !== nextUser.uid || !activeSessionId || local.sessionId !== activeSessionId) {
            forceLogout("Twoje konto zostalo zalogowane na innym urzadzeniu.");
          }
        });
      } catch (error) {
        const message = String(error?.message || "Sesja wygasla. Zaloguj sie ponownie.");
        await forceLogout(message);
      }
    });

    return () => {
      if (sessionUnsubRef.current) {
        sessionUnsubRef.current();
        sessionUnsubRef.current = null;
      }
      unsubscribe();
    };
  }, [auth, db, forceLogout, waitForSessionDuringLogin]);

  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState !== "visible") return;
      if (!auth.currentUser) return;
      try {
        await requireActiveSession(db, auth.currentUser);
      } catch (error) {
        const message = String(error?.message || "Sesja wygasla. Zaloguj sie ponownie.");
        await forceLogout(message);
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [auth, db, forceLogout]);

  const login = async ({ identifier, password }) => {
    setLoading(true);
    setAuthMessageState("");
    loginInProgressRef.current = true;
    try {
      const authEmail = resolveAuthEmail(identifier);
      let credential;
      try {
        credential = await signInWithEmailAndPassword(auth, authEmail, String(password || ""));
      } catch (primaryError) {
        const fallbackEmail = technicalEmailFromEmailIdentifier(identifier);
        if (!shouldTryTechnicalFallback(identifier, primaryError) || !fallbackEmail || fallbackEmail === authEmail) {
          throw primaryError;
        }
        credential = await signInWithEmailAndPassword(auth, fallbackEmail, String(password || ""));
      }

      await ensureUserIsActive(db, credential.user.uid);
      pendingSessionUidRef.current = String(credential?.user?.uid || "");
      await writeActiveSession(db, credential.user);
    } catch (error) {
      if (String(error?.message || "") === "Konto jest nieaktywne.") {
        await signOut(auth);
      }
      pendingSessionUidRef.current = "";
      loginInProgressRef.current = false;
      setLoading(false);
      throw new Error(normalizeLoginError(error));
    } finally {
      pendingSessionUidRef.current = "";
      loginInProgressRef.current = false;
    }
  };

  const logout = async () => {
    loginInProgressRef.current = false;
    pendingSessionUidRef.current = "";
    clearStoredSession();
    setAuthMessageState("");
    await signOut(auth);
  };

  const requestPasswordReset = async ({ identifier }) => {
    if (isTechnicalLoginInput(identifier)) {
      throw new Error("Dla loginu technicznego odzyskiwanie hasla jest niedostepne. Skontaktuj sie z administratorem systemu.");
    }

    const authEmail = resolveAuthEmail(identifier);
    try {
      await sendPasswordResetEmail(auth, authEmail);
    } catch (error) {
      const code = String(error?.code || "");
      if (code === "auth/invalid-email") {
        throw new Error("Nieprawidlowy login lub e-mail.");
      }
      if (code === "auth/too-many-requests") {
        throw new Error("Za duzo prob. Sprobuj ponownie za chwile.");
      }
      if (code === "auth/network-request-failed") {
        throw new Error("Brak polaczenia z siecia.");
      }
      throw new Error("Nie udalo sie wyslac maila resetujacego.");
    }
  };

  const value = {
    user,
    loading,
    authMessage,
    isAuthenticated: !!user,
    login,
    requestPasswordReset,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
