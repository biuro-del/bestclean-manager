const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const webAppDir = path.join(__dirname, 'web-app')

function normalizeTarget(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (raw && !raw.startsWith('portal')) {
    console.warn(`[build-webapp] APP_TARGET=${raw} is no longer supported; building portal only.`)
  }
  return 'portal'
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  })

  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
}

function isTruthy(value) {
  return String(value || '').trim().toLowerCase() === 'true'
}

function webAppDepsLookInstalled() {
  const viteBin = path.join(webAppDir, 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite')
  return fs.existsSync(viteBin)
}

function installWebAppDependencies(npmCmd) {
  if (isTruthy(process.env.FORCE_WEBAPP_INSTALL)) {
    run(npmCmd, ['ci', '--no-audit', '--no-fund'], { cwd: webAppDir })
    return
  }

  if (isTruthy(process.env.SKIP_WEBAPP_INSTALL) || webAppDepsLookInstalled()) {
    console.log('[build-webapp] web-app dependencies already installed; skipping npm ci')
    return
  }

  run(npmCmd, ['ci', '--no-audit', '--no-fund'], { cwd: webAppDir })
}

function loadPublicBuildVariables() {
  // App Hosting injects BUILD variables during its managed build. A Firebase
  // Hosting preview runs this script directly, so copy only explicit public
  // VITE_* BUILD values from the tracked configuration. Secret values are
  // deliberately excluded and a caller-provided environment value wins.
  const configPath = path.join(__dirname, 'apphosting.yaml')
  const source = fs.readFileSync(configPath, 'utf8')
  const entries = source.split(/^  - variable: /m).slice(1)

  for (const entry of entries) {
    const [nameLine] = entry.split(/\r?\n/, 1)
    const name = String(nameLine || '').trim()
    if (!name.startsWith('VITE_') || process.env[name]) continue

    const valueMatch = entry.match(/^    value:\s*(.+)\s*$/m)
    const hasBuildAvailability = /^      - BUILD\s*$/m.test(entry)
    if (!valueMatch || !hasBuildAvailability) continue

    process.env[name] = valueMatch[1].trim().replace(/^(["'])(.*)\1$/, '$2')
    console.log(`[build-webapp] loaded public BUILD variable ${name}`)
  }
}

function main() {
  const target = normalizeTarget(process.env.APP_TARGET)
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'

  console.log(`[build-webapp] APP_TARGET=${target}`)
  installWebAppDependencies(npmCmd)
  loadPublicBuildVariables()

  run(npmCmd, ['run', 'build:portal'], { cwd: webAppDir })
}

main()
