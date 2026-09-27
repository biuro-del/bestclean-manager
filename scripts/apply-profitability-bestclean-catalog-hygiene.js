#!/usr/bin/env node
'use strict'

const {
  resolveOptions,
  runApply,
  runAudit,
  safeFailureReport,
} = require('./lib/profitability-bestclean-catalog-hygiene')

async function main({
  argv = process.argv.slice(2),
  deps,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  let dependencies = deps
  try {
    const options = resolveOptions(argv)
    if (options.help) {
      stdout.write(
        'Usage: node scripts/apply-profitability-bestclean-catalog-hygiene.js '
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
    const result = options.mode === 'apply'
      ? await runApply(options, dependencies)
      : await runAudit(options, dependencies)
    stdout.write(`${JSON.stringify(result)}\n`)
    return 0
  } catch (error) {
    stderr.write(`${JSON.stringify(safeFailureReport(error))}\n`)
    return 1
  }
}

if (require.main === module) {
  main().then((exitCode) => { process.exitCode = exitCode })
}

module.exports = { main }
