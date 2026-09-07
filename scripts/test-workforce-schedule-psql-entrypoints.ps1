#requires -Version 5.1

[CmdletBinding()]
param(
  [switch] $RunLocalEphemeralSmoke,

  [ValidateNotNullOrEmpty()]
  [string] $Confirmation
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ExpectedConfirmation = 'I_CONFIRM_LOCAL_EPHEMERAL_POSTGRESQL_17_PSQL_ENTRYPOINT_SMOKE'
$DatabaseName = 'iclean-room-database'
$BootstrapSuperuser = 'workforce_schedule_smoke_superuser'
$ProvisionerRole = 'workforce_schedule_smoke_provisioner'
$TempDirectoryPrefix = 'cleanzi-workforce-schedule-psql-smoke-'
$LoopbackAddress = '127.0.0.1'

$InitDbExe = 'C:\Program Files\PostgreSQL\17\bin\initdb.exe'
$PgCtlExe = 'C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe'
$CreateDbExe = 'C:\Program Files\PostgreSQL\17\bin\createdb.exe'
$PsqlExe = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'

if (-not $RunLocalEphemeralSmoke.IsPresent -or $Confirmation -cne $ExpectedConfirmation) {
  throw "LOCAL_EPHEMERAL_SMOKE_CONFIRMATION_REQUIRED: -RunLocalEphemeralSmoke -Confirmation $ExpectedConfirmation"
}

# Refuse cloud/runtime contexts even though every connection below is hardcoded
# to a newly initialized loopback-only cluster.
if ($env:K_SERVICE -or $env:GAE_ENV -or $env:CLOUD_SQL_CONNECTION_NAME) {
  throw 'LOCAL_EPHEMERAL_SMOKE_FORBIDDEN_IN_CLOUD_RUNTIME'
}

foreach ($requiredExecutable in @($InitDbExe, $PgCtlExe, $CreateDbExe, $PsqlExe)) {
  if (-not (Test-Path -LiteralPath $requiredExecutable -PathType Leaf)) {
    throw "POSTGRESQL_17_EXECUTABLE_MISSING: $requiredExecutable"
  }
}

$RepositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$RolesEntrypoint = Join-Path $RepositoryRoot 'dataconnect\admin\20260906_workforce_schedule_roles_preprovision.psql'
$CoreEntrypoint = Join-Path $RepositoryRoot 'dataconnect\admin\20260906_workforce_schedule_core_apply.psql'

foreach ($entrypoint in @($RolesEntrypoint, $CoreEntrypoint)) {
  if (-not (Test-Path -LiteralPath $entrypoint -PathType Leaf)) {
    throw "WORKFORCE_SCHEDULE_PSQL_ENTRYPOINT_MISSING: $entrypoint"
  }
}

function Get-RandomLoopbackPort {
  do {
    $listener = [System.Net.Sockets.TcpListener]::new(
      [System.Net.IPAddress]::Parse('127.0.0.1'),
      0
    )
    try {
      $listener.Start()
      $candidate = [int] $listener.LocalEndpoint.Port
    }
    finally {
      $listener.Stop()
    }
  } while ($candidate -eq 5432)

  return $candidate
}

function Invoke-NativeChecked {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Executable,

    [Parameter(Mandatory = $true)]
    [string[]] $Arguments,

    [Parameter(Mandatory = $true)]
    [string] $FailureCode
  )

  & $Executable @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FailureCode (exit $LASTEXITCODE)"
  }
}

function Invoke-PsqlFile {
  param(
    [Parameter(Mandatory = $true)]
    [string] $User,

    [Parameter(Mandatory = $true)]
    [string] $FilePath,

    [string[]] $Variables = @()
  )

  $arguments = @(
    '-X',
    '--no-password',
    '--host', $LoopbackAddress,
    '--port', [string] $Port,
    '--username', $User,
    '--dbname', $DatabaseName
  )

  foreach ($variable in $Variables) {
    $arguments += @('-v', $variable)
  }
  $arguments += @('-f', $FilePath)

  $output = @(& $PsqlExe @arguments 2>&1)
  $exitCode = $LASTEXITCODE
  foreach ($line in $output) {
    Write-Host ([string] $line)
  }
  if ($exitCode -ne 0) {
    throw "PSQL_ENTRYPOINT_FAILED: $FilePath (exit $exitCode)"
  }

  return ($output -join [Environment]::NewLine)
}

$TempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$DataDirectoryName = $TempDirectoryPrefix + [Guid]::NewGuid().ToString('N')
$DataDirectory = [System.IO.Path]::GetFullPath((Join-Path $TempRoot $DataDirectoryName))
$ExpectedParent = $TempRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar)
$ActualParent = [System.IO.Path]::GetDirectoryName($DataDirectory).TrimEnd([System.IO.Path]::DirectorySeparatorChar)

if (-not [string]::Equals($ExpectedParent, $ActualParent, [StringComparison]::OrdinalIgnoreCase) -or
    -not [System.IO.Path]::GetFileName($DataDirectory).StartsWith($TempDirectoryPrefix, [StringComparison]::Ordinal)) {
  throw "UNSAFE_EPHEMERAL_DATA_DIRECTORY: $DataDirectory"
}

if (Test-Path -LiteralPath $DataDirectory) {
  throw "EPHEMERAL_DATA_DIRECTORY_ALREADY_EXISTS: $DataDirectory"
}

$Port = Get-RandomLoopbackPort
$ServerStarted = $false
$ServerStopped = $false
$SmokeSucceeded = $false
$BootstrapSqlPath = Join-Path $DataDirectory 'workforce-schedule-psql-smoke-bootstrap.sql'
$ServerLogPath = Join-Path $DataDirectory 'postgresql-smoke.log'

Write-Host "LOCAL_ONLY_DATA_DIRECTORY=$DataDirectory"
Write-Host "LOCAL_ONLY_LOOPBACK_PORT=$Port"

try {
  New-Item -ItemType Directory -Path $DataDirectory -ErrorAction Stop | Out-Null

  Invoke-NativeChecked -Executable $InitDbExe -FailureCode 'INITDB_FAILED' -Arguments @(
    '--pgdata', $DataDirectory,
    '--username', $BootstrapSuperuser,
    '--encoding', 'UTF8',
    '--no-locale',
    '--auth-local', 'trust',
    '--auth-host', 'trust'
  )

  Add-Content -LiteralPath (Join-Path $DataDirectory 'postgresql.conf') -Encoding UTF8 -Value @(
    "listen_addresses = '127.0.0.1'",
    "port = $Port"
  )

  Invoke-NativeChecked -Executable $PgCtlExe -FailureCode 'PG_CTL_START_FAILED' -Arguments @(
    '-D', $DataDirectory,
    '-l', $ServerLogPath,
    '-w',
    '-t', '60',
    'start'
  )
  $ServerStarted = $true

  Invoke-NativeChecked -Executable $CreateDbExe -FailureCode 'CREATEDB_FAILED' -Arguments @(
    '--host', $LoopbackAddress,
    '--port', [string] $Port,
    '--username', $BootstrapSuperuser,
    '--no-password',
    '--maintenance-db', 'postgres',
    $DatabaseName
  )

  $bootstrapSql = @'
\set ON_ERROR_STOP on

revoke create on schema public from public;

create table public.organizations (
  org_id varchar(64) primary key,
  owner_worker_id varchar(128),
  organization_kind varchar(32) not null,
  status varchar(16) not null,
  onboarding_status varchar(32) not null,
  deleted_at timestamptz
);

create table public.organization_member (
  org_id varchar(64) not null references public.organizations(org_id),
  uid varchar(128) not null,
  role varchar(32) not null,
  worker_id varchar(128) not null,
  status varchar(16) not null,
  primary key (org_id, uid)
);

create table public.organization_subscription (
  org_id varchar(64) primary key references public.organizations(org_id),
  plan_code varchar(32) not null,
  status varchar(16) not null,
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz
);

create table public.worker (
  org_id varchar(64) not null references public.organizations(org_id),
  login varchar(80) not null,
  login_normalized varchar(80) not null,
  worker_id varchar(128) not null,
  worker_id_normalized varchar(128) not null,
  full_name varchar(240),
  auth_uid varchar(128),
  role varchar(64),
  active boolean not null,
  status varchar(16) not null,
  primary key (org_id, worker_id_normalized)
);

create table public.client (
  org_id varchar(64) not null references public.organizations(org_id),
  client_id varchar(64) not null,
  name varchar(180),
  status varchar(32),
  primary key (org_id, client_id)
);

create role workforce_schedule_smoke_provisioner
  login createrole noinherit nosuperuser nocreatedb noreplication nobypassrls;

grant usage, create on schema public
  to workforce_schedule_smoke_provisioner with grant option;
grant select, references on table public.organizations
  to workforce_schedule_smoke_provisioner with grant option;
grant select on table
  public.organization_member,
  public.organization_subscription
  to workforce_schedule_smoke_provisioner with grant option;
grant select, update on table public.worker, public.client
  to workforce_schedule_smoke_provisioner with grant option;

\echo 'WORKFORCE_SCHEDULE_PSQL_SMOKE_BOOTSTRAPPED'
'@

  [System.IO.File]::WriteAllText(
    $BootstrapSqlPath,
    $bootstrapSql,
    [System.Text.UTF8Encoding]::new($false)
  )

  $bootstrapOutput = Invoke-PsqlFile `
    -User $BootstrapSuperuser `
    -FilePath $BootstrapSqlPath
  if ($bootstrapOutput -notmatch '(?m)^WORKFORCE_SCHEDULE_PSQL_SMOKE_BOOTSTRAPPED\s*$') {
    throw 'BOOTSTRAP_SUCCESS_MARKER_MISSING'
  }

  $rolesOutput = Invoke-PsqlFile `
    -User $ProvisionerRole `
    -FilePath $RolesEntrypoint `
    -Variables @(
      "workforce_schedule_expected_database=$DatabaseName",
      "workforce_schedule_expected_provisioning_admin=$ProvisionerRole",
      'workforce_schedule_role_provision_confirmation=PROVISION_WORKFORCE_SCHEDULE_ROLES_ONLY_20260906'
    )
  if ($rolesOutput -notmatch '(?m)^WORKFORCE_SCHEDULE_ROLES_PREPROVISIONED\s*$') {
    throw 'ROLES_PREPROVISION_SUCCESS_MARKER_MISSING'
  }

  $coreOutput = Invoke-PsqlFile `
    -User 'migration_runner' `
    -FilePath $CoreEntrypoint `
    -Variables @(
      "workforce_schedule_expected_database=$DatabaseName",
      'workforce_schedule_expected_migration_runner=migration_runner',
      'workforce_schedule_core_confirmation=APPLY_WORKFORCE_SCHEDULE_CORE_ONLY_20260906'
    )
  if ($coreOutput -notmatch '(?m)^WORKFORCE_SCHEDULE_CORE_MIGRATION_APPLIED\s*$') {
    throw 'CORE_MIGRATION_SUCCESS_MARKER_MISSING'
  }

  $SmokeSucceeded = $true
  Write-Host 'WORKFORCE_SCHEDULE_PSQL_ENTRYPOINT_SMOKE_PASSED'
}
finally {
  $PostmasterPidPath = Join-Path $DataDirectory 'postmaster.pid'
  if ($ServerStarted -or (Test-Path -LiteralPath $PostmasterPidPath)) {
    & $PgCtlExe -D $DataDirectory -m fast -w -t 60 stop
    $ServerStopped = ($LASTEXITCODE -eq 0)
    if (-not $ServerStopped) {
      Write-Warning "PG_CTL_STOP_FAILED; EPHEMERAL_DATA_PRESERVED=$DataDirectory"
    }
  }

  if ($SmokeSucceeded -and $ServerStopped) {
    $VerifiedDataDirectory = [System.IO.Path]::GetFullPath($DataDirectory)
    $VerifiedParent = [System.IO.Path]::GetDirectoryName($VerifiedDataDirectory).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
    $VerifiedName = [System.IO.Path]::GetFileName($VerifiedDataDirectory)
    $VerifiedItem = Get-Item -LiteralPath $VerifiedDataDirectory -Force
    if (-not [string]::Equals($ExpectedParent, $VerifiedParent, [StringComparison]::OrdinalIgnoreCase) -or
        -not $VerifiedName.StartsWith($TempDirectoryPrefix, [StringComparison]::Ordinal) -or
        (($VerifiedItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)) {
      throw "REFUSING_UNSAFE_EPHEMERAL_CLEANUP: $VerifiedDataDirectory"
    }

    Remove-Item -LiteralPath $VerifiedDataDirectory -Recurse -Force
    Write-Host 'EPHEMERAL_DATA_DIRECTORY_REMOVED_AFTER_SUCCESS'
  }
  else {
    Write-Warning "EPHEMERAL_DATA_PRESERVED_FOR_DIAGNOSIS=$DataDirectory"
  }
}
