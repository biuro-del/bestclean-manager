import process from "node:process";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { google } from "googleapis";

const DEFAULT_SPREADSHEET_ID = "1aDllEIgfjTccPMtIormCwtfx0p2qxSQbSSlZiQBU3g0";
const DEFAULT_WORKERS_SHEET_GID = 976340991;
const DEFAULT_LOGIN_DOMAIN = "auth.iclean.local";
const EMAIL_MODE_TECHNICAL = "technical";
const EMAIL_MODE_PREFER_SHEET = "prefer_sheet_email";

const argv = process.argv.slice(2);
const isApply = argv.includes("--apply");
const isDryRun = argv.includes("--dry-run") || !isApply;

const config = {
  projectId: String(process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || "iclean-room").trim(),
  spreadsheetId: String(process.env.WORKERS_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID).trim(),
  workersSheetGid: Number(process.env.WORKERS_SHEET_GID || DEFAULT_WORKERS_SHEET_GID),
  loginDomain: String(process.env.AUTH_LOGIN_DOMAIN || DEFAULT_LOGIN_DOMAIN).trim().toLowerCase(),
  emailMode: String(process.env.AUTH_EMAIL_MODE || EMAIL_MODE_TECHNICAL).trim().toLowerCase(),
  updateExistingPasswords: String(process.env.UPDATE_EXISTING_PASSWORDS || "false").trim().toLowerCase() === "true",
};

if (![EMAIL_MODE_TECHNICAL, EMAIL_MODE_PREFER_SHEET].includes(config.emailMode)) {
  throw new Error(`Invalid AUTH_EMAIL_MODE="${config.emailMode}". Use "${EMAIL_MODE_TECHNICAL}" or "${EMAIL_MODE_PREFER_SHEET}".`);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeAsciiLower(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeLogin(value) {
  const login = normalizeAsciiLower(value);
  if (!login) throw new Error("Missing login.");
  if (!/^[a-z0-9._-]+$/.test(login)) {
    throw new Error(`Invalid login "${value}". Allowed chars: a-z 0-9 . _ -`);
  }
  return login;
}

function isValidEmail(value) {
  const email = normalizeText(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseActive(rawValue) {
  const value = normalizeAsciiLower(rawValue);
  if (!value) return true;
  if (["true", "1", "yes", "tak"].includes(value)) return true;
  if (["false", "0", "no", "nie", "inactive"].includes(value)) return false;
  return true;
}

function normalizeRole(rawRole) {
  const role = normalizeAsciiLower(rawRole);
  if (!role) return "pracownik";
  if (role.includes("admin")) return "admin";
  if (role.includes("kierownik")) return "kierownik";
  if (role.includes("koordynator")) return "koordynator";
  if (role.includes("audytor")) return "audytor";
  return "pracownik";
}

function roleClaims(role) {
  return [role];
}

function resolveAuthEmail(worker) {
  const technicalEmail = `${worker.login}@${config.loginDomain}`;
  const sheetEmail = worker.sheetEmail;

  if (config.emailMode === EMAIL_MODE_PREFER_SHEET && isValidEmail(sheetEmail)) {
    return normalizeText(sheetEmail).toLowerCase();
  }
  return technicalEmail;
}

function normalizeHeader(header) {
  return normalizeAsciiLower(header).replace(/\s+/g, " ");
}

function findHeaderIndex(headers, candidates, { required = false, fieldName = "" } = {}) {
  const normalizedCandidates = candidates.map((name) => normalizeHeader(name));
  for (let idx = 0; idx < headers.length; idx += 1) {
    const current = normalizeHeader(headers[idx]);
    if (normalizedCandidates.includes(current)) return idx;
  }
  if (required) {
    throw new Error(`Missing required header for ${fieldName}. Expected one of: ${candidates.join(", ")}`);
  }
  return -1;
}

function getCell(row, index) {
  if (index < 0) return "";
  return normalizeText(row[index] ?? "");
}

function isUserNotFound(error) {
  return String(error?.code || "") === "auth/user-not-found";
}

async function getAuthUserByEmailSafe(auth, email) {
  try {
    return await auth.getUserByEmail(email);
  } catch (error) {
    if (isUserNotFound(error)) return null;
    throw error;
  }
}

async function getAuthUserByUidSafe(auth, uid) {
  try {
    return await auth.getUser(uid);
  } catch (error) {
    if (isUserNotFound(error)) return null;
    throw error;
  }
}

function initializeFirebaseApp() {
  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault(),
      projectId: config.projectId,
    });
  }
}

async function loadWorkersFromSheet() {
  const authClient = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheetsApi = google.sheets({ version: "v4", auth: authClient });

  const metadata = await sheetsApi.spreadsheets.get({
    spreadsheetId: config.spreadsheetId,
    fields: "sheets(properties(sheetId,title))",
  });

  const targetSheet = (metadata.data.sheets || []).find((sheet) => Number(sheet?.properties?.sheetId) === config.workersSheetGid);
  if (!targetSheet) {
    throw new Error(`Workers sheet gid=${config.workersSheetGid} not found in spreadsheet ${config.spreadsheetId}.`);
  }

  const title = String(targetSheet.properties?.title || "").replace(/'/g, "''");
  const range = `'${title}'!A1:ZZ`;
  const valuesResponse = await sheetsApi.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range,
    majorDimension: "ROWS",
  });

  const rows = valuesResponse.data.values || [];
  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].map((h) => String(h || ""));
  const idxWorkerId = findHeaderIndex(headers, ["WorkerID", "WorkerId"], { fieldName: "workerId" });
  const idxName = findHeaderIndex(headers, ["Imie i nazwisko", "Imi i nazwisko", "Name"], { fieldName: "name" });
  const idxLogin = findHeaderIndex(headers, ["Login"], { required: true, fieldName: "login" });
  const idxPassword = findHeaderIndex(headers, ["Password", "Haslo", "Haslo"], { required: true, fieldName: "password" });
  const idxActive = findHeaderIndex(headers, ["Active"], { fieldName: "active" });
  const idxType = findHeaderIndex(headers, ["Typ", "Type", "Rola", "Role"], { fieldName: "type" });
  const idxEmail = findHeaderIndex(headers, ["Email", "E-mail", "Mail"], { fieldName: "email" });

  const workers = [];
  const duplicateLogins = new Map();

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const rawLogin = getCell(row, idxLogin);
    if (!rawLogin) continue;

    let login = "";
    try {
      login = normalizeLogin(rawLogin);
    } catch (error) {
      workers.push({
        line: rowIndex + 1,
        invalid: true,
        error: String(error?.message || error),
      });
      continue;
    }

    if (duplicateLogins.has(login)) {
      workers.push({
        line: rowIndex + 1,
        invalid: true,
        login,
        error: `Duplicate login in sheet. First seen at line ${duplicateLogins.get(login)}.`,
      });
      continue;
    }
    duplicateLogins.set(login, rowIndex + 1);

    workers.push({
      line: rowIndex + 1,
      workerId: getCell(row, idxWorkerId),
      name: getCell(row, idxName),
      login,
      password: getCell(row, idxPassword),
      active: parseActive(getCell(row, idxActive)),
      typeRaw: getCell(row, idxType),
      role: normalizeRole(getCell(row, idxType)),
      sheetEmail: getCell(row, idxEmail),
      invalid: false,
    });
  }

  return workers;
}

async function findExistingUserDocByLogin(db, login) {
  const query = await db.collection("users").where("login", "==", login).limit(1).get();
  if (query.empty) return null;
  const doc = query.docs[0];
  return { uid: doc.id, data: doc.data() };
}

async function migrateWorker({ db, auth, worker, nowIso, summary, dryRun }) {
  const authEmail = resolveAuthEmail(worker);
  const claims = roleClaims(worker.role);
  const contactEmail = isValidEmail(worker.sheetEmail) ? normalizeText(worker.sheetEmail).toLowerCase() : "";
  const disabled = !worker.active;
  const password = normalizeText(worker.password);

  if (!isValidEmail(authEmail)) {
    summary.errors.push({
      line: worker.line,
      login: worker.login,
      error: `Resolved auth email is invalid: ${authEmail}`,
    });
    return;
  }

  let uid = "";
  let authUser = null;
  let docByLogin = null;

  docByLogin = await findExistingUserDocByLogin(db, worker.login);
  if (docByLogin) {
    uid = docByLogin.uid;
    authUser = await getAuthUserByUidSafe(auth, uid);
  }

  if (!uid) {
    const byEmail = await getAuthUserByEmailSafe(auth, authEmail);
    if (byEmail) {
      uid = byEmail.uid;
      authUser = byEmail;
    }
  }

  if (!uid) {
    if (!password) {
      summary.errors.push({
        line: worker.line,
        login: worker.login,
        error: "Cannot create new auth user without password.",
      });
      return;
    }

    if (dryRun) {
      summary.authCreated += 1;
      summary.firestoreCreated += 1;
      summary.claimsUpdated += 1;
      summary.preview.push({
        line: worker.line,
        login: worker.login,
        authEmail,
        action: "create_auth_user_and_firestore_doc",
      });
      return;
    }

    const created = await auth.createUser({
      email: authEmail,
      password,
      displayName: worker.name || undefined,
      disabled,
    });
    uid = created.uid;
    authUser = created;
    summary.authCreated += 1;
  } else {
    const updatePayload = {};
    const currentEmail = normalizeText(authUser?.email).toLowerCase();
    const currentDisplayName = normalizeText(authUser?.displayName);
    const currentDisabled = Boolean(authUser?.disabled);

    if (currentEmail !== authEmail) updatePayload.email = authEmail;
    if (currentDisplayName !== normalizeText(worker.name)) updatePayload.displayName = worker.name || undefined;
    if (currentDisabled !== disabled) updatePayload.disabled = disabled;
    if (config.updateExistingPasswords && password) updatePayload.password = password;

    if (Object.keys(updatePayload).length) {
      if (dryRun) {
        summary.authUpdated += 1;
        summary.preview.push({
          line: worker.line,
          login: worker.login,
          authEmail,
          action: "update_auth_user",
          fields: Object.keys(updatePayload),
        });
      } else {
        await auth.updateUser(uid, updatePayload);
        summary.authUpdated += 1;
      }
    } else {
      summary.authUnchanged += 1;
    }
  }

  if (!dryRun) {
    const reloadedUser = await getAuthUserByUidSafe(auth, uid);
    const currentClaims = reloadedUser?.customClaims || {};
    const nextClaims = { ...currentClaims, roles: claims };
    const sameClaims = JSON.stringify(currentClaims.roles || []) === JSON.stringify(claims);
    if (!sameClaims) {
      await auth.setCustomUserClaims(uid, nextClaims);
      summary.claimsUpdated += 1;
    } else {
      summary.claimsUnchanged += 1;
    }
  } else {
    summary.claimsUpdated += 1;
  }

  const userDoc = {
    workerId: worker.workerId || "",
    login: worker.login,
    name: worker.name || "",
    active: worker.active,
    type: worker.typeRaw || "",
    role: worker.role,
    roles: claims,
    authEmail,
    contactEmail,
    updatedAt: dryRun ? null : FieldValue.serverTimestamp(),
    updatedAtIso: nowIso,
  };

  if (dryRun) {
    const existingDoc = docByLogin ? "update" : "create";
    if (existingDoc === "create") summary.firestoreCreated += 1;
    if (existingDoc === "update") summary.firestoreUpdated += 1;
    summary.preview.push({
      line: worker.line,
      login: worker.login,
      authEmail,
      action: `firestore_${existingDoc}`,
    });
    return;
  }

  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  const payload = { ...userDoc };
  if (!userSnap.exists) {
    payload.createdAt = FieldValue.serverTimestamp();
    payload.createdAtIso = nowIso;
    summary.firestoreCreated += 1;
  } else {
    summary.firestoreUpdated += 1;
  }
  await userRef.set(payload, { merge: true });
}

async function main() {
  initializeFirebaseApp();
  const db = getFirestore();
  const auth = getAuth();

  const workers = await loadWorkersFromSheet();
  const nowIso = new Date().toISOString();

  const summary = {
    mode: isDryRun ? "dry-run" : "apply",
    projectId: config.projectId,
    spreadsheetId: config.spreadsheetId,
    workersSheetGid: config.workersSheetGid,
    emailMode: config.emailMode,
    loginDomain: config.loginDomain,
    updateExistingPasswords: config.updateExistingPasswords,
    totalRows: workers.length,
    candidates: 0,
    skippedInvalidRows: 0,
    authCreated: 0,
    authUpdated: 0,
    authUnchanged: 0,
    firestoreCreated: 0,
    firestoreUpdated: 0,
    claimsUpdated: 0,
    claimsUnchanged: 0,
    errors: [],
    preview: [],
  };

  for (const worker of workers) {
    if (worker.invalid) {
      summary.skippedInvalidRows += 1;
      summary.errors.push({
        line: worker.line,
        login: worker.login || "",
        error: worker.error || "Invalid row.",
      });
      continue;
    }

    summary.candidates += 1;
    try {
      await migrateWorker({
        db,
        auth,
        worker,
        nowIso,
        summary,
        dryRun: isDryRun,
      });
    } catch (error) {
      summary.errors.push({
        line: worker.line,
        login: worker.login,
        error: String(error?.message || error),
      });
    }
  }

  console.log(JSON.stringify(summary, null, 2));

  if (!isDryRun && summary.errors.length) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error("migrateWorkersToFirebase_failed", error?.stack || error);
  process.exit(1);
});
