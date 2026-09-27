#!/usr/bin/env node
'use strict'

const {
  resolveOptions,
  runApply,
  runAudit,
  safeFailureReport,
} = require('./lib/profitability-runtime-credentials-activation')

async function main({
  argv = process.argv.slice(2),
  deps,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  let dependencies = deps
  let signalController = null
  let signalHandler = null
  try {
    const options = resolveOptions(argv)
    if (options.help) {
      stdout.write(
        'Usage: node scripts/activate-profitability-runtime-credentials-production.js '
        + '[--apply --expected-head <sha> --confirmation <token>]\n',
      )
      return 0
    }
    if (options.mode === 'apply') {
      signalController = new AbortController()
      signalHandler = () => signalController.abort()
      process.on('SIGINT', signalHandler)
      process.on('SIGTERM', signalHandler)
    }
    if (!dependencies) {
      const { createProfitabilityRuntimeCredentialDependencies } = require(
        './lib/profitability-runtime-credentials-production-adapters'
      )
      dependencies = createProfitabilityRuntimeCredentialDependencies({
        signal: signalController?.signal,
      })
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
    if (!signalController) {
      try { await dependencies?.close?.() } catch {}
    }
  }
}

if (require.main === module) {
  main().then((exitCode) => { process.exitCode = exitCode })
}

module.exports = { main }
