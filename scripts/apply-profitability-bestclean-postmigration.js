#!/usr/bin/env node
'use strict'

const {
  resolveOptions,
  runApply,
  runAudit,
  safeFailureReport,
} = require('./lib/profitability-bestclean-postmigration')

async function main({
  argv = process.argv.slice(2),
  deps,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  let dependencies = deps
  let applyOwnsCleanup = false
  let signalController = null
  let signalHandler = null
  try {
    const options = resolveOptions(argv)
    if (options.help) {
      stdout.write(
        'Usage: node scripts/apply-profitability-bestclean-postmigration.js '
        + '[--apply --expected-head <sha> --confirmation <token>]\n',
      )
      return 0
    }
    if (!dependencies) {
      const { createProfitabilityBestcleanPostmigrationDependencies } = require(
        './lib/profitability-bestclean-postmigration-adapters'
      )
      dependencies = createProfitabilityBestcleanPostmigrationDependencies()
    }
    applyOwnsCleanup = options.mode === 'apply'
    if (applyOwnsCleanup) {
      signalController = new AbortController()
      signalHandler = () => signalController.abort()
      process.on('SIGINT', signalHandler)
      process.on('SIGTERM', signalHandler)
    }
    const result = options.mode === 'apply'
      ? await runApply(options, dependencies, { signal: signalController.signal })
      : await runAudit(options, dependencies)
    stdout.write(`${JSON.stringify(result)}\n`)
    return 0
  } catch (error) {
    stderr.write(`${JSON.stringify(safeFailureReport(error))}\n`)
    return 1
  } finally {
    if (signalHandler) {
      process.removeListener('SIGINT', signalHandler)
      process.removeListener('SIGTERM', signalHandler)
    }
    if (!applyOwnsCleanup) {
      try { await dependencies?.close?.() } catch {}
    }
  }
}

if (require.main === module) {
  main().then((exitCode) => { process.exitCode = exitCode })
}

module.exports = { main }
