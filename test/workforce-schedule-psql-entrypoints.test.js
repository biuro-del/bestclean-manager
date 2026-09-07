'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const harnessPath = path.join(
  __dirname,
  '..',
  'scripts',
  'test-workforce-schedule-psql-entrypoints.ps1',
)
const harness = fs.readFileSync(harnessPath, 'utf8')

test('smoke jest jawnie opt-in i blokuje uruchomienie w runtime chmurowym', () => {
  const topLevelParameters = harness.slice(
    harness.indexOf('param('),
    harness.indexOf('Set-StrictMode'),
  )
  assert.match(harness, /\[switch\]\s*\$RunLocalEphemeralSmoke/)
  assert.match(harness, /I_CONFIRM_LOCAL_EPHEMERAL_POSTGRESQL_17_PSQL_ENTRYPOINT_SMOKE/)
  assert.match(harness, /-not \$RunLocalEphemeralSmoke\.IsPresent/)
  assert.match(harness, /\$Confirmation -cne \$ExpectedConfirmation/)
  assert.match(harness, /\$env:K_SERVICE/)
  assert.match(harness, /\$env:GAE_ENV/)
  assert.match(harness, /\$env:CLOUD_SQL_CONNECTION_NAME/)
  assert.match(harness, /LOCAL_EPHEMERAL_SMOKE_FORBIDDEN_IN_CLOUD_RUNTIME/)
  assert.doesNotMatch(topLevelParameters, /Mandatory\s*=\s*\$true/i)
  assert.doesNotMatch(topLevelParameters, /\$(?:Host|Port|Database|DatabaseUrl|ConnectionString)\b/i)
  assert.doesNotMatch(harness, /\b(?:gcloud|firebase)(?:\.cmd|\.exe)?\b/i)
})

test('uzywa wylacznie pelnych sciezek binarnych PostgreSQL 17', () => {
  for (const executable of ['initdb', 'pg_ctl', 'createdb', 'psql']) {
    assert.match(
      harness,
      new RegExp(
        `\\$[A-Za-z]+Exe = 'C:\\\\Program Files\\\\PostgreSQL\\\\17\\\\bin\\\\${executable}\\.exe'`,
        'i',
      ),
    )
  }
  assert.match(harness, /Test-Path -LiteralPath \$requiredExecutable -PathType Leaf/)
})

test('klaster jest nowy, losowy, w TEMP i dostepny tylko przez loopback', () => {
  assert.match(harness, /cleanzi-workforce-schedule-psql-smoke-/)
  assert.match(harness, /\[Guid\]::NewGuid\(\)\.ToString\('N'\)/)
  assert.match(harness, /\[System\.IO\.Path\]::GetTempPath\(\)/)
  assert.match(harness, /UNSAFE_EPHEMERAL_DATA_DIRECTORY/)
  assert.match(harness, /EPHEMERAL_DATA_DIRECTORY_ALREADY_EXISTS/)
  assert.match(harness, /New-Item -ItemType Directory -Path \$DataDirectory/)
  assert.doesNotMatch(harness, /New-Item[^\r\n]*-LiteralPath/)
  assert.match(harness, /TcpListener/)
  assert.match(harness, /IPAddress\]::Parse\('127\.0\.0\.1'\)/)
  assert.match(harness, /while \(\$candidate -eq 5432\)/)
  assert.match(harness, /listen_addresses = '127\.0\.0\.1'/)
  assert.match(harness, /--auth-local', 'trust'/)
  assert.match(harness, /--auth-host', 'trust'/)
  assert.match(harness, /\$LoopbackAddress = '127\.0\.0\.1'/)
})

test('tworzy dokladnie lokalna baze i minimalne zrodla dla Grafiku', () => {
  assert.match(harness, /\$DatabaseName = 'iclean-room-database'/)
  assert.match(harness, /\$DatabaseName\s*\n\s*\)/)
  for (const relation of [
    'organizations',
    'organization_member',
    'organization_subscription',
    'worker',
    'client',
  ]) {
    assert.match(harness, new RegExp(`create table public\\.${relation} \\(`, 'i'))
  }
  assert.match(
    harness,
    /create role workforce_schedule_smoke_provisioner\s+login createrole noinherit nosuperuser nocreatedb noreplication nobypassrls/i,
  )
  assert.match(harness, /grant usage, create on schema public[\s\S]*with grant option/i)
  assert.match(harness, /grant select, references on table public\.organizations[\s\S]*with grant option/i)
  assert.match(harness, /grant select, update on table public\.worker, public\.client[\s\S]*with grant option/i)
  assert.doesNotMatch(harness, /create role workforce_schedule_smoke_provisioner[\s\S]{0,180}\bsuperuser\b(?!\s*=\s*false)/i)
})

test('wykonuje dokladne entrypointy przez psql -X --no-password we wlasciwej kolejnosci', () => {
  assert.match(
    harness,
    /\$RolesEntrypoint = Join-Path \$RepositoryRoot 'dataconnect\\admin\\20260906_workforce_schedule_roles_preprovision\.psql'/,
  )
  assert.match(
    harness,
    /\$CoreEntrypoint = Join-Path \$RepositoryRoot 'dataconnect\\admin\\20260906_workforce_schedule_core_apply\.psql'/,
  )
  assert.match(harness, /'-X',[\s\S]*'--no-password'/)
  assert.match(harness, /\$arguments \+= @\('-f', \$FilePath\)/)
  const rolesPosition = harness.indexOf('$rolesOutput = Invoke-PsqlFile')
  const corePosition = harness.indexOf('$coreOutput = Invoke-PsqlFile')
  assert.ok(rolesPosition > 0)
  assert.ok(corePosition > rolesPosition)
  assert.match(
    harness.slice(rolesPosition, corePosition),
    /-User \$ProvisionerRole[\s\S]*-FilePath \$RolesEntrypoint/,
  )
  assert.match(
    harness.slice(corePosition),
    /-User 'migration_runner'[\s\S]*-FilePath \$CoreEntrypoint/,
  )
  assert.match(harness, /workforce_schedule_expected_database=\$DatabaseName/)
  assert.match(harness, /workforce_schedule_expected_provisioning_admin=\$ProvisionerRole/)
  assert.match(harness, /PROVISION_WORKFORCE_SCHEDULE_ROLES_ONLY_20260906/)
  assert.match(harness, /workforce_schedule_expected_migration_runner=migration_runner/)
  assert.match(harness, /APPLY_WORKFORCE_SCHEDULE_CORE_ONLY_20260906/)
})

test('wymaga markerow obu entrypointow i sprzata tylko po pelnym sukcesie', () => {
  const rolesMarker = harness.indexOf('WORKFORCE_SCHEDULE_ROLES_PREPROVISIONED')
  const coreMarker = harness.indexOf('WORKFORCE_SCHEDULE_CORE_MIGRATION_APPLIED')
  const successAssignment = harness.indexOf('$SmokeSucceeded = $true')
  assert.ok(rolesMarker > 0)
  assert.ok(coreMarker > rolesMarker)
  assert.ok(successAssignment > coreMarker)
  assert.match(harness, /ROLES_PREPROVISION_SUCCESS_MARKER_MISSING/)
  assert.match(harness, /CORE_MIGRATION_SUCCESS_MARKER_MISSING/)
  assert.match(harness, /WORKFORCE_SCHEDULE_PSQL_ENTRYPOINT_SMOKE_PASSED/)
  assert.match(harness, /finally \{/)
  assert.match(harness, /\$ServerStarted -or \(Test-Path -LiteralPath \$PostmasterPidPath\)/)
  assert.match(harness, /& \$PgCtlExe -D \$DataDirectory -m fast -w -t 60 stop/)
  assert.match(harness, /if \(\$SmokeSucceeded -and \$ServerStopped\)/)
  assert.match(harness, /REFUSING_UNSAFE_EPHEMERAL_CLEANUP/)
  assert.match(harness, /FileAttributes\]::ReparsePoint/)
  assert.match(harness, /Remove-Item -LiteralPath \$VerifiedDataDirectory -Recurse -Force/)
  assert.match(harness, /EPHEMERAL_DATA_PRESERVED_FOR_DIAGNOSIS=\$DataDirectory/)
  assert.doesNotMatch(harness, /Stop-Service|Restart-Service|Get-Service/i)
})
