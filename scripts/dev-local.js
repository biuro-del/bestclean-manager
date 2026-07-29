const { execFileSync, spawn } = require('node:child_process')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')

loadRootEnvFile()

const configuredRemoteApiTarget = String(process.env.API_PROXY_TARGET || '').trim().replace(/\/+$/, '')
const configuredRemoteApiHost = String(process.env.API_PROXY_FORWARDED_HOST || '').trim()

const isWindows = process.platform === 'win32'
const npmCommand = isWindows ? 'npm.cmd' : 'npm'
const requestedBackendPort = process.env.PORT || '8080'
const backendPort = resolveBackendPort(requestedBackendPort)
const webHost = process.env.WEB_HOST || 'localhost'
const webPort = process.env.WEB_PORT || '5173'
const workerProfileStorageMode = resolveWorkerProfileStorageMode()
const workerProfileModeState = resolveWorkerProfileMode()
const workerProfileMode = workerProfileModeState.mode
const backendSystemCaSupported = nodeSupportsOption('--use-system-ca')
const backendNodeOptions = resolveBackendNodeOptions(process.env.NODE_OPTIONS, backendSystemCaSupported)
const backendTlsRejectUnauthorized = resolveBackendTlsRejectUnauthorized(backendSystemCaSupported)

const processes = []
let shuttingDown = false

function loadRootEnvFile() {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) {
    return
  }

  const raw = fs.readFileSync(envPath, 'utf8')
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      return
    }

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex <= 0) {
      return
    }

    const key = trimmed.slice(0, separatorIndex).trim()
    const rawValue = trimmed.slice(separatorIndex + 1).trim()
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) {
      return
    }

    process.env[key] = rawValue.replace(/^(['"])(.*)\1$/, '$2')
  })
}

function normalizePort(value, fallback = 8080) {
  const port = Number(value)
  if (Number.isInteger(port) && port > 0 && port < 65536) {
    return port
  }
  return fallback
}

function resolveBackendPort(value) {
  const requestedPort = normalizePort(value)
  let candidatePort = requestedPort
  while (parseWindowsNetstatListeners(String(candidatePort)).length) {
    candidatePort += 1
  }

  if (candidatePort !== requestedPort) {
    console.warn(
      `[dev] Backend port ${requestedPort} is already in use; using ${candidatePort} and passing it to Vite proxy.`,
    )
  }

  return String(candidatePort)
}

function hasEnvValue(name) {
  return Boolean(String(process.env[name] || '').trim())
}

function hasLocalDbConfig() {
  const hasDatabaseUrl = hasEnvValue('DATABASE_URL')
  const hasDatabase = hasEnvValue('DB_NAME') || hasEnvValue('PGDATABASE')
  const hasUser =
    hasEnvValue('DB_USER') ||
    hasEnvValue('PGUSER') ||
    hasEnvValue('DB_IAM_USER') ||
    hasEnvValue('CLOUD_SQL_IAM_USER')

  return hasDatabaseUrl || (hasDatabase && hasUser)
}

function hasFirebaseAdminConfig() {
  const source = detectServiceAccountSource()
  return Boolean(source && !source.startsWith('missing-file:'))
}

function detectApplicationDefaultCredentialsPath() {
  const candidates = []
  if (process.env.APPDATA) {
    candidates.push(path.join(process.env.APPDATA, 'gcloud', 'application_default_credentials.json'))
  }
  if (process.env.HOME) {
    candidates.push(path.join(process.env.HOME, '.config', 'gcloud', 'application_default_credentials.json'))
  }

  return candidates.find((candidate) => fs.existsSync(candidate)) || ''
}

function resolveWorkerProfileMode() {
  const requestedMode = String(process.env.WORKER_PROFILE_MODE || '').trim().toLowerCase()
  if (requestedMode === 'local' || requestedMode === 'direct') {
    return { mode: requestedMode, reason: 'requested' }
  }
  if (requestedMode === 'proxy' || requestedMode === 'remote') {
    return { mode: requestedMode, reason: 'requested' }
  }
  if (['dataconnect', 'data-connect', 'firebase', 'https'].includes(workerProfileStorageMode)) {
    return { mode: 'local', reason: `local ${workerProfileStorageMode} storage` }
  }
  if (hasLocalDbConfig() && hasFirebaseAdminConfig()) {
    return { mode: 'local', reason: 'local DB/Admin config detected' }
  }
  return { mode: 'proxy', reason: 'default; local DB/Admin config missing' }
}

function resolveWorkerProfileStorageMode() {
  const requestedMode = String(
    process.env.WORKER_PROFILE_STORAGE_MODE ||
      process.env.WORKER_PROFILE_DB_MODE ||
      process.env.WORKER_PROFILE_DATA_MODE ||
      '',
  )
    .trim()
    .toLowerCase()
  if (requestedMode) {
    return requestedMode
  }
  return 'database'
}

function withNodeOption(value, option) {
  const parts = String(value || '')
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (!parts.includes(option)) {
    parts.push(option)
  }

  return parts.join(' ')
}

function withoutNodeOption(value, option) {
  return String(value || '')
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part && part !== option)
    .join(' ')
}

function nodeSupportsOption(option) {
  try {
    execFileSync(process.execPath, [option, '--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function resolveBackendNodeOptions(value, systemCaSupported = nodeSupportsOption('--use-system-ca')) {
  const option = '--use-system-ca'
  if (systemCaSupported) {
    return withNodeOption(value, option)
  }

  const normalized = withoutNodeOption(value, option)
  console.warn(`[dev] Current Node does not support ${option}; backend will start without that NODE_OPTIONS flag.`)
  return normalized
}

function resolveBackendTlsRejectUnauthorized(systemCaSupported) {
  const backendExplicit = String(process.env.DEV_BACKEND_TLS_REJECT_UNAUTHORIZED || '').trim()
  if (backendExplicit) {
    return backendExplicit
  }

  const explicit = String(process.env.NODE_TLS_REJECT_UNAUTHORIZED || '').trim()
  if (explicit) {
    return explicit
  }

  if (systemCaSupported || hasEnvValue('NODE_EXTRA_CA_CERTS')) {
    return ''
  }

  const strictFallback = String(process.env.DEV_LOCAL_TLS_FALLBACK || '').trim().toLowerCase()
  if (strictFallback === 'strict' || strictFallback === 'off' || strictFallback === '0') {
    return ''
  }

  return '0'
}

function detectServiceAccountSource() {
  const defaultPath = path.join(process.cwd(), 'serviceAccountKey.json')
  const filePath = String(
    process.env.FIREBASE_SERVICE_ACCOUNT_FILE ||
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      '',
  ).trim()

  if (filePath) {
    return fs.existsSync(path.resolve(process.cwd(), filePath)) ? `file:${filePath}` : `missing-file:${filePath}`
  }
  if (fs.existsSync(defaultPath)) {
    return 'file:serviceAccountKey.json'
  }
  if (hasEnvValue('FIREBASE_SERVICE_ACCOUNT_JSON') || hasEnvValue('GOOGLE_APPLICATION_CREDENTIALS_JSON')) {
    return 'env-json'
  }
  if (hasEnvValue('FIREBASE_SERVICE_ACCOUNT_BASE64')) {
    return 'env-base64'
  }
  const firebaseAdminAuthClient = String(
    process.env.FIREBASE_ADMIN_AUTH_CLIENT ||
      process.env.FIREBASE_ADMIN_CREDENTIAL ||
      process.env.FIREBASE_AUTH_CLIENT ||
      '',
  )
    .trim()
    .toLowerCase()
  if (firebaseAdminAuthClient === 'gcloud' || firebaseAdminAuthClient === 'gcloud-auth') {
    return 'gcloud-auth'
  }
  const adcPath = detectApplicationDefaultCredentialsPath()
  if (adcPath) {
    return `application-default:${adcPath}`
  }
  return ''
}

function checkBackendHealth(port) {
  const request = http.get(
    {
      hostname: '127.0.0.1',
      port,
      path: '/healthz',
      timeout: 1500,
    },
    (response) => {
      response.resume()
      if (response.statusCode === 200) {
        console.log(`[dev] backend health -> ok on http://127.0.0.1:${port}/healthz`)
        return
      }
      console.warn(`[dev] backend health -> HTTP ${response.statusCode} on http://127.0.0.1:${port}/healthz`)
    },
  )
  request.on('timeout', () => {
    request.destroy()
    console.warn(`[dev] backend health -> timeout on http://127.0.0.1:${port}/healthz`)
  })
  request.on('error', (error) => {
    console.warn(`[dev] backend health -> unavailable on http://127.0.0.1:${port}/healthz (${error?.message || error})`)
  })
}

function checkFirebaseTls(nodeOptions, tlsRejectUnauthorized) {
  const script = [
    "const https = require('node:https')",
    'let done = false',
    "function finish(code, message) { if (done) return; done = true; if (message) { (code ? console.error : console.log)(message) } process.exit(code) }",
    "const req = https.get('https://identitytoolkit.googleapis.com/', { timeout: 5000 }, (response) => { response.resume(); finish(0, `HTTP ${response.statusCode}`) })",
    "req.on('timeout', () => { req.destroy(); finish(1, 'TLS_CHECK_TIMEOUT') })",
    "req.on('error', (error) => finish(1, `${error?.code || 'ERROR'}: ${error?.message || error}`))",
  ].join('; ')

  const child = spawn(process.execPath, ['-e', script], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_OPTIONS: nodeOptions,
      ...(tlsRejectUnauthorized ? { NODE_TLS_REJECT_UNAUTHORIZED: tlsRejectUnauthorized } : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  })

  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (data) => {
    stdout += String(data ?? '')
  })
  child.stderr.on('data', (data) => {
    stderr += String(data ?? '')
  })
  child.on('exit', (code) => {
    const output = String(stderr || stdout || '').trim()
    if (code === 0) {
      console.log(`[dev] Firebase TLS -> ok (${output || 'identitytoolkit.googleapis.com reachable'})`)
      return
    }

    const lowered = output.toLowerCase()
    if (
      lowered.includes('unable_to_verify_leaf_signature') ||
      lowered.includes('unable to verify') ||
      lowered.includes('self-signed') ||
      lowered.includes('certificate')
    ) {
      console.warn(
        `[dev] Firebase TLS -> certificate error (${output}). Backend uses NODE_OPTIONS="${nodeOptions}" and NODE_TLS_REJECT_UNAUTHORIZED="${tlsRejectUnauthorized || ''}". If it still fails, add the corporate CA with NODE_EXTRA_CA_CERTS.`,
      )
      return
    }

    console.warn(`[dev] Firebase TLS -> failed (${output || `exit ${code ?? 1}`})`)
  })
}

function parseWindowsNetstatListeners(port) {
  let output = ''
  try {
    output = execFileSync('netstat.exe', ['-ano', '-p', 'tcp'], { encoding: 'utf8' })
  } catch {
    return []
  }

  return output
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 5 && parts[0] === 'TCP' && parts[3] === 'LISTENING')
    .filter((parts) =>
      parts[1] === `127.0.0.1:${port}` ||
      parts[1] === `0.0.0.0:${port}` ||
      parts[1] === `[::1]:${port}` ||
      parts[1] === `[::]:${port}`,
    )
    .map((parts) => ({
      address: parts[1],
      pid: parts[4],
    }))
}

function readWindowsProcessInfo(pid) {
  if (!pid) {
    return null
  }

  try {
    const command = `Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" | Select-Object -First 1 ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress`
    const output = execFileSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8' }).trim()
    return output ? JSON.parse(output) : null
  } catch {
    return null
  }
}

function assertDevWebPortAvailable(port) {
  if (!isWindows) {
    return
  }

  const listeners = parseWindowsNetstatListeners(port)
  if (!listeners.length) {
    return
  }

  console.error(`[dev] Cannot start portal web on ${webHost}:${port}; the dev port is already in use.`)
  console.error(`[dev] This can make http://${webHost}:${port} resolve to an old Vite process and send requests through stale proxy config.`)
  for (const listener of listeners) {
    const processInfo = readWindowsProcessInfo(listener.pid)
    const commandLine = String(processInfo?.CommandLine || '').trim()
    const executablePath = String(processInfo?.ExecutablePath || '').trim()
    console.error(`[dev] Conflict: ${listener.address} is LISTENING on PID ${listener.pid}.`)
    if (executablePath) console.error(`[dev] Executable: ${executablePath}`)
    if (commandLine) console.error(`[dev] Command: ${commandLine}`)
  }
  console.error(`[dev] Stop the conflicting process, then run root npm run dev again. Use http://${webHost}:${port}.`)
  process.exit(1)
}

function prefixOutput(name, stream, data) {
  const text = String(data ?? '')
  text
    .split(/\r?\n/)
    .filter(Boolean)
    .forEach((line) => {
      stream.write(`[${name}] ${line}\n`)
    })
}

function startProcess(name, command, args, env = {}, options = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env,
    },
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: Boolean(options.shell),
  })

  processes.push({ name, child })
  child.stdout.on('data', (data) => prefixOutput(name, process.stdout, data))
  child.stderr.on('data', (data) => prefixOutput(name, process.stderr, data))
  child.on('exit', (code, signal) => {
    if (!shuttingDown) {
      const reason = signal || `code ${code ?? 0}`
      console.log(`[dev] ${name} exited with ${reason}; stopping dev stack.`)
      shutdown(code || 1)
    }
  })

  return child
}

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return
  }
  shuttingDown = true

  for (const { child } of processes) {
    if (!child.killed) {
      child.kill()
    }
  }

  setTimeout(() => process.exit(exitCode), 250)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

assertDevWebPortAvailable(webPort)

console.log(`[dev] Starting backend on http://127.0.0.1:${backendPort}`)
console.log(`[dev] /api -> http://127.0.0.1:${backendPort}`)
console.log(`[dev] worker-profile -> ${workerProfileMode} (${workerProfileModeState.reason})`)
console.log(`[dev] worker-profile storage -> ${workerProfileStorageMode}`)
if (workerProfileMode === 'proxy') {
  console.warn(
    `[dev] worker-profile proxy -> ${configuredRemoteApiTarget || 'disabled'}. Set API_PROXY_TARGET or use local DB/Firebase Admin config.`,
  )
} else {
  if (!hasLocalDbConfig() && !['dataconnect', 'data-connect', 'firebase', 'https'].includes(workerProfileStorageMode)) {
    console.warn('[dev] worker-profile local DB config -> missing; edit/delete returns DB_CONFIG_MISSING until DB env is set.')
  }
  if (!hasFirebaseAdminConfig()) {
    console.warn(
      '[dev] worker-profile Firebase Admin config -> missing; Auth update/delete returns FIREBASE_ADMIN_CREDENTIALS_MISSING until a service account is set.',
    )
  }
}
console.log(`[dev] generic DB proxy -> ${configuredRemoteApiTarget || 'disabled'}`)
console.log(`[dev] backend NODE_OPTIONS -> ${backendNodeOptions}`)
if (backendTlsRejectUnauthorized === '0' && String(process.env.NODE_TLS_REJECT_UNAUTHORIZED || '').trim() !== '0') {
  console.warn('[dev] Backend local Google/Firebase TLS verification -> disabled only for the backend process by an explicit local override or legacy fallback. Use NODE_EXTRA_CA_CERTS or disable local HTTPS scanning for a stricter setup.')
}
const serviceAccountSource = detectServiceAccountSource()
if (serviceAccountSource) {
  console.log(`[dev] Firebase Admin service account -> ${serviceAccountSource}`)
} else {
  console.warn('[dev] Firebase Admin service account -> missing; worker profile edit/delete in Firebase Auth will not work locally.')
}
startProcess('api', process.execPath, ['index.js'], {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: backendPort,
  API_PROXY_TARGET: configuredRemoteApiTarget,
  API_PROXY_FORWARDED_HOST: configuredRemoteApiHost,
  ADMIN_USERS_MODE: process.env.ADMIN_USERS_MODE || 'direct',
  PORTAL_DB_ROUTES_MODE: process.env.PORTAL_DB_ROUTES_MODE || 'direct',
  PORTAL_SCHEDULE_ORDERS_MODE: process.env.PORTAL_SCHEDULE_ORDERS_MODE || 'direct',
  PORTAL_TASKS_MODE: process.env.PORTAL_TASKS_MODE || 'direct',
  WORKER_PROFILE_MODE: workerProfileMode === 'proxy' ? 'direct' : workerProfileMode,
  WORKER_PROFILE_STORAGE_MODE: workerProfileStorageMode,
  WORKER_PROFILE_DB_MODE: workerProfileStorageMode,
  MOBILE_SERVICE_EXECUTION_CORRELATION_ENABLED:
    process.env.MOBILE_SERVICE_EXECUTION_CORRELATION_ENABLED || 'false',
  NODE_OPTIONS: backendNodeOptions,
  ...(backendTlsRejectUnauthorized ? { NODE_TLS_REJECT_UNAUTHORIZED: backendTlsRejectUnauthorized } : {}),
})

console.log(`[dev] Starting portal web on http://${webHost}:${webPort}`)
startProcess('web', npmCommand, ['--prefix', 'web-app', 'run', 'dev', '--', '--host', webHost, '--port', webPort], {
  VITE_DEV_API_PROXY_TARGET: `http://127.0.0.1:${backendPort}`,
  VITE_DEV_WORKER_API_PROXY_TARGET: `http://127.0.0.1:${backendPort}`,
  VITE_WORKER_PASSWORD_SET_ENDPOINT: '',
  VITE_WORKER_PROFILE_UPDATE_ENDPOINT: '',
  VITE_WORKER_PROFILE_DELETE_ENDPOINT: '',
}, {
  shell: isWindows,
})

setTimeout(() => checkBackendHealth(backendPort), 1500)
setTimeout(() => checkFirebaseTls(backendNodeOptions, backendTlsRejectUnauthorized), 1800)
