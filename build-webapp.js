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

function main() {
  const target = normalizeTarget(process.env.APP_TARGET)
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'

  console.log(`[build-webapp] APP_TARGET=${target}`)
  installWebAppDependencies(npmCmd)

  run(npmCmd, ['run', 'build:portal'], { cwd: webAppDir })
}

main()
