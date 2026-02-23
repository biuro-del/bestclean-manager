const { spawnSync } = require('node:child_process')

function normalizeTarget(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (raw.startsWith('both') || raw === 'all') return 'both'
  return raw.startsWith('mobile') ? 'mobile' : 'portal'
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
}

const target = normalizeTarget(process.env.APP_TARGET || process.env.VITE_APP_TARGET || 'both')
const buildScript = `build:${target}`
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

run(npmCommand, ['--prefix', 'web-app', 'ci'])
run(npmCommand, ['--prefix', 'web-app', 'run', buildScript])
