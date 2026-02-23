/* eslint-disable require-jsdoc, max-len, indent */
const {setGlobalOptions} = require("firebase-functions/v2");
const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin");
const {Pool} = require("pg");

setGlobalOptions({maxInstances: 10});

if (!admin.apps.length) {
  admin.initializeApp();
}

const DB_HOST = defineSecret("DB_HOST");
const DB_NAME = defineSecret("DB_NAME");
const DB_USER = defineSecret("DB_USER");
const DB_PASS = defineSecret("DB_PASS");
const DB_PORT = defineSecret("DB_PORT");
const CORS_ALLOWED_ORIGINS = defineSecret("CORS_ALLOWED_ORIGINS");

const defaultAllowedOrigins = [
  /^https?:\/\/localhost(?::\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i,
  /^https:\/\/[a-z0-9-]+\.web\.app$/i,
  /^https:\/\/[a-z0-9-]+\.firebaseapp\.com$/i,
];

let dbPool = null;

function jsonError(response, statusCode, code, message) {
  response.status(statusCode).json({
    error: {
      code,
      message,
    },
  });
}

function withDebugMessage(baseMessage, error) {
  if (String(process.env.FUNCTIONS_EMULATOR || "").toLowerCase() === "true") {
    const details = String((error && error.message) || "").trim();
    return details ? `${baseMessage} (${details})` : baseMessage;
  }
  return baseMessage;
}

function getSecretValue(secretRef, fallbackName) {
  const envValue = String(process.env[fallbackName] || "").trim();
  const isEmulator = String(process.env.FUNCTIONS_EMULATOR || "").toLowerCase() === "true";
  if (isEmulator && envValue) {
    return envValue;
  }

  try {
    const value = String(secretRef.value() || "").trim();
    if (value) {
      return value;
    }
  } catch (error) {
    // Secret may be unavailable locally.
  }

  return envValue;
}

function parseExtraAllowedOrigins() {
  const csv = getSecretValue(CORS_ALLOWED_ORIGINS, "CORS_ALLOWED_ORIGINS");
  if (!csv) {
    return [];
  }

  return csv
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isOriginAllowed(origin) {
  if (!origin) {
    return true;
  }

  if (defaultAllowedOrigins.some((pattern) => pattern.test(origin))) {
    return true;
  }

  const extraAllowedOrigins = parseExtraAllowedOrigins();
  return extraAllowedOrigins.some((allowedOrigin) => allowedOrigin === origin);
}

function applyCors(request, response) {
  const origin = String(request.headers.origin || "").trim();
  response.set("Vary", "Origin");
  response.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.set("Access-Control-Max-Age", "3600");

  if (!origin) {
    return true;
  }

  if (!isOriginAllowed(origin)) {
    return false;
  }

  response.set("Access-Control-Allow-Origin", origin);
  return true;
}

function parseJsonBody(request) {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  if (typeof request.body === "string" && request.body.trim()) {
    return JSON.parse(request.body);
  }

  return {};
}

function extractBearerToken(request) {
  const authHeader = String(request.headers.authorization || "").trim();
  if (!authHeader) {
    return "";
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return "";
  }

  return String(match[1] || "").trim();
}

function extractOrgIdFromEmail(emailValue) {
  const email = String(emailValue || "").trim().toLowerCase();
  const match = email.match(/^[a-z0-9._%+-]+@([a-z0-9_-]+)\.pl$/i);
  if (!match) {
    return "";
  }

  return String(match[1] || "").toLowerCase();
}

function normalizeRole(roleValue) {
  const role = String(roleValue || "").trim().toUpperCase();
  if (role === "ADMIN" || role === "MANAGER" || role === "WORKER") {
    return role;
  }
  if (role === "COORD" || role === "COORDINATOR") {
    return "WORKER";
  }

  return "WORKER";
}

function getDbPool() {
  if (dbPool) {
    return dbPool;
  }

  const host = getSecretValue(DB_HOST, "DB_HOST");
  const database = getSecretValue(DB_NAME, "DB_NAME");
  const user = getSecretValue(DB_USER, "DB_USER");
  const password = getSecretValue(DB_PASS, "DB_PASS");
  const portRaw = getSecretValue(DB_PORT, "DB_PORT");
  const port = Number(portRaw || "5432");

  if (!host || !database || !user || !password || !Number.isFinite(port)) {
    throw new Error("Brak konfiguracji DB_HOST/DB_NAME/DB_USER/DB_PASS/DB_PORT.");
  }

  dbPool = new Pool({
    host,
    database,
    user,
    password,
    port,
    max: 5,
    idleTimeoutMillis: 15000,
    connectionTimeoutMillis: 10000,
    ssl: String(process.env.DB_SSL || "").trim().toLowerCase() === "true" ?
      {rejectUnauthorized: false} :
      undefined,
  });

  return dbPool;
}

async function findWorkerByEmail(client, orgId, loginEmail) {
  const loginFromEmail = String(loginEmail || "").trim().toLowerCase().split("@")[0] || "";
  const sql = `
    SELECT login, role
    FROM worker
    WHERE LOWER(org_id) = LOWER($1)
      AND COALESCE(active, true) = true
      AND (
        LOWER(login_email) = LOWER($2)
        OR LOWER(email) = LOWER($2)
        OR LOWER(login) = LOWER($3)
      )
    ORDER BY CASE WHEN LOWER(login_email) = LOWER($2) THEN 0 ELSE 1 END
    LIMIT 1
  `;

  const result = await client.query(sql, [orgId, loginEmail, loginFromEmail]);
  return result.rows[0] || null;
}

async function findWorkerByCredentials(client, orgId, loginEmail, password) {
  const sql = `
    SELECT login, role, full_name
    FROM worker
    WHERE org_id = $1
      AND login_email = $2
      AND password = $3
      AND active = true
    LIMIT 1
  `;

  const result = await client.query(sql, [orgId, loginEmail, password]);
  return result.rows[0] || null;
}

async function upsertOrganizationMember(client, orgId, uid, role) {
  const sql = `
    INSERT INTO organization_member (org_id, uid, role, created_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (org_id, uid)
    DO UPDATE SET role = EXCLUDED.role
  `;

  await client.query(sql, [orgId, uid, role]);
}

async function ensureOrganizationExists(client, orgId) {
  const normalizedOrgId = String(orgId || "").trim().toLowerCase();
  if (!normalizedOrgId) {
    return;
  }

  const sql = `
    INSERT INTO organizations (org_id, name, status, created_at)
    VALUES ($1, $2, 'ACTIVE', NOW())
    ON CONFLICT (org_id) DO NOTHING
  `;

  await client.query(sql, [normalizedOrgId, normalizedOrgId]);
}

function readLoginBody(body) {
  const safeBody = body && typeof body === "object" ? body : {};
  return {
    email: String(safeBody.email || "").trim().toLowerCase(),
    password: String(safeBody.password || "").trim(),
  };
}

function isValidWorkerEmail(email) {
  return /^[a-z0-9._%+-]+@[a-z0-9_-]+\.pl$/i.test(String(email || ""));
}

function buildWorkerUid(orgId, workerLogin) {
  return `w:${orgId}:${workerLogin}`;
}

function extractLoginFromEmail(emailValue) {
  const normalizedEmail = String(emailValue || "").trim().toLowerCase();
  if (!normalizedEmail.includes("@")) {
    return "";
  }
  return String(normalizedEmail.split("@")[0] || "").trim();
}

exports.authBootstrapMembership = onRequest(
    {
      region: "europe-west3",
      secrets: [DB_HOST, DB_NAME, DB_USER, DB_PASS, DB_PORT, CORS_ALLOWED_ORIGINS],
    },
    async (request, response) => {
      if (!applyCors(request, response)) {
        return jsonError(response, 403, "CORS_FORBIDDEN", "Niedozwolone origin.");
      }

      if (request.method === "OPTIONS") {
        response.status(204).send("");
        return;
      }

      if (request.method !== "POST") {
        return jsonError(response, 405, "METHOD_NOT_ALLOWED", "Uzyj metody POST.");
      }

      const bearer = extractBearerToken(request);
      if (!bearer) {
        return jsonError(response, 401, "UNAUTHENTICATED", "Brak tokenu Bearer.");
      }

      let decodedToken;
      try {
        const shouldCheckRevoked = String(process.env.FUNCTIONS_EMULATOR || "").toLowerCase() !== "true";
        decodedToken = await admin.auth().verifyIdToken(bearer, shouldCheckRevoked);
      } catch (error) {
        return jsonError(response, 401, "UNAUTHENTICATED", withDebugMessage("Niepoprawny token Firebase.", error));
      }

      const uid = String(decodedToken.uid || "").trim();
      const email = String(decodedToken.email || "").trim().toLowerCase();
      if (!uid || !email) {
        return jsonError(response, 400, "INVALID_TOKEN", "Token nie zawiera uid/email.");
      }

      let body;
      try {
        body = parseJsonBody(request);
      } catch (error) {
        return jsonError(response, 400, "INVALID_JSON", "Nieprawidlowe body JSON.");
      }

      const bodyOrgId = String((body && body.orgId) || "").trim().toLowerCase();
      const orgId = bodyOrgId || extractOrgIdFromEmail(email);
      if (!orgId) {
        return jsonError(response, 400, "INVALID_ORG", "Nie mozna ustalic orgId z adresu email.");
      }

      let client = null;
      try {
        const db = getDbPool();
        client = await db.connect();
      } catch (error) {
        console.error("authBootstrapMembership db connect failed", error);
        return jsonError(response, 500, "DB_CONNECTION_ERROR", withDebugMessage("Nie udalo sie polaczyc z baza danych.", error));
      }

      try {
        const worker = await findWorkerByEmail(client, orgId, email);
        const fallbackLogin = extractLoginFromEmail(email);
        const workerLogin = String((worker && worker.login) || fallbackLogin).trim();
        if (!workerLogin) {
          return jsonError(response, 403, "WORKER_NOT_FOUND", "Brak aktywnego pracownika dla tego email/orgId.");
        }

        const role = normalizeRole((worker && worker.role) || "WORKER");
        await ensureOrganizationExists(client, orgId);
        await upsertOrganizationMember(client, orgId, uid, role);

        response.status(200).json({
          ok: true,
          uid,
          orgId,
          role,
          workerLogin,
          workerResolved: Boolean(worker),
        });
      } catch (error) {
        console.error("authBootstrapMembership failed", error);
        return jsonError(response, 500, "INTERNAL", withDebugMessage("Nie udalo sie utworzyc powiazania organizacji.", error));
      } finally {
        if (client) {
          client.release();
        }
      }
    },
);

exports.authWorkerLogin = onRequest(
    {
      region: "europe-west3",
      secrets: [DB_HOST, DB_NAME, DB_USER, DB_PASS, DB_PORT, CORS_ALLOWED_ORIGINS],
    },
    async (request, response) => {
      if (!applyCors(request, response)) {
        return jsonError(response, 403, "CORS_FORBIDDEN", "Niedozwolone origin.");
      }

      if (request.method === "OPTIONS") {
        response.status(204).send("");
        return;
      }

      if (request.method !== "POST") {
        return jsonError(response, 405, "METHOD_NOT_ALLOWED", "Uzyj metody POST.");
      }

      let body;
      try {
        body = parseJsonBody(request);
      } catch (error) {
        return jsonError(response, 400, "INVALID_JSON", "Nieprawidlowe body JSON.");
      }

      const {email, password} = readLoginBody(body);
      if (!email || !password) {
        return jsonError(response, 400, "INVALID_INPUT", "Podaj email i haslo.");
      }

      if (!isValidWorkerEmail(email)) {
        return jsonError(response, 400, "INVALID_EMAIL", "Email musi miec format login@orgid.pl.");
      }

      const orgId = extractOrgIdFromEmail(email);
      if (!orgId) {
        return jsonError(response, 400, "INVALID_ORG", "Nie mozna ustalic orgId z adresu email.");
      }

      let client = null;
      try {
        const db = getDbPool();
        client = await db.connect();
      } catch (error) {
        console.error("authWorkerLogin db connect failed", error);
        return jsonError(response, 500, "DB_CONNECTION_ERROR", withDebugMessage("Nie udalo sie polaczyc z baza danych.", error));
      }

      try {
        const worker = await findWorkerByCredentials(client, orgId, email, password);
        if (!worker) {
          return jsonError(response, 401, "INVALID_CREDENTIALS", "Niepoprawny login lub haslo.");
        }

        const workerLogin = String(worker.login || "").trim();
        if (!workerLogin) {
          return jsonError(response, 500, "INVALID_WORKER", "Brak login pracownika w tabeli worker.");
        }

        const role = normalizeRole(worker.role);
        const uid = buildWorkerUid(orgId, workerLogin);
        await ensureOrganizationExists(client, orgId);
        await upsertOrganizationMember(client, orgId, uid, role);

        const token = await admin.auth().createCustomToken(uid, {
          orgId,
          role,
          workerLogin,
        });

        response.status(200).json({
          ok: true,
          token,
          orgId,
          role,
          uid,
          workerLogin,
          workerName: String(worker.full_name || "").trim(),
        });
      } catch (error) {
        console.error("authWorkerLogin failed", error);
        return jsonError(response, 500, "INTERNAL", withDebugMessage("Nie udalo sie zalogowac pracownika.", error));
      } finally {
        if (client) {
          client.release();
        }
      }
    },
);
