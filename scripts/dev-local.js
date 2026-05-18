const { spawn } = require('node:child_process')

const isWindows = process.platform === 'win32'
const npmCommand = isWindows ? 'npm.cmd' : 'npm'
const backendPort = process.env.PORT || '8080'
const webHost = process.env.WEB_HOST || 'localhost'

const processes = []
let shuttingDown = false

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

console.log(`[dev] Starting backend on http://127.0.0.1:${backendPort}`)
startProcess('api', process.execPath, ['index.js'], {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: backendPort,
  ADMIN_USERS_MODE: process.env.ADMIN_USERS_MODE || 'dataconnect',
  PORTAL_DB_ROUTES_MODE: process.env.PORTAL_DB_ROUTES_MODE || 'proxy',
  PORTAL_TASKS_MODE: process.env.PORTAL_TASKS_MODE || 'local',
})

console.log(`[dev] Starting portal web on http://${webHost}:5173`)
startProcess('web', npmCommand, ['--prefix', 'web-app', 'run', 'dev', '--', '--host', webHost], {
  VITE_DEV_API_PROXY_TARGET: process.env.VITE_DEV_API_PROXY_TARGET || `http://127.0.0.1:${backendPort}`,
}, {
  shell: isWindows,
})
