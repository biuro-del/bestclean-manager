const { spawnSync } = require('node:child_process')
const path = require('node:path')

const webAppDir = path.join(__dirname, 'web-app')

function normalizeTarget(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (raw.startsWith('mobile')) return 'mobile'
  if (raw.startsWith('portal')) return 'portal'
  return 'both'
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

function main() {
  const target = normalizeTarget(process.env.APP_TARGET)
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'

  console.log(`[build-webapp] APP_TARGET=${target}`)
  run(npmCmd, ['ci', '--no-audit', '--no-fund'], { cwd: webAppDir })

  if (target === 'mobile') {
    run(npmCmd, ['run', 'build:mobile'], { cwd: webAppDir })
    return
  }

  if (target === 'portal') {
    run(npmCmd, ['run', 'build:portal'], { cwd: webAppDir })
    return
  }

  run(npmCmd, ['run', 'build:both'], { cwd: webAppDir })
}

main()
