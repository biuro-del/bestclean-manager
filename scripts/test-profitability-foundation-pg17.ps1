#requires -Version 5.1

[CmdletBinding()]
param(
  [switch] $RunLocalEphemeralSmoke,

  [ValidateNotNullOrEmpty()]
  [string] $Confirmation
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ExpectedConfirmation = 'I_CONFIRM_LOCAL_EPHEMERAL_POSTGRESQL_17_PROFITABILITY_FOUNDATION_SMOKE'
$DatabaseName = 'iclean-room-database'
$BootstrapSuperuser = 'profitability_harness_superuser'
$TempDirectoryPrefix = 'cleanzi-profitability-foundation-pg17-'
$LoopbackAddress = '127.0.0.1'

$InitDbExe = 'C:\Program Files\PostgreSQL\17\bin\initdb.exe'
$PgCtlExe = 'C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe'
$CreateDbExe = 'C:\Program Files\PostgreSQL\17\bin\createdb.exe'
$PsqlExe = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
$NodeExe = (Get-Command node -ErrorAction Stop).Source

if (-not $RunLocalEphemeralSmoke.IsPresent -or $Confirmation -cne $ExpectedConfirmation) {
  throw "LOCAL_EPHEMERAL_SMOKE_CONFIRMATION_REQUIRED: -RunLocalEphemeralSmoke -Confirmation $ExpectedConfirmation"
}

if ($env:K_SERVICE -or $env:GAE_ENV -or $env:CLOUD_SQL_CONNECTION_NAME) {
  throw 'LOCAL_EPHEMERAL_SMOKE_FORBIDDEN_IN_CLOUD_RUNTIME'
}

foreach ($requiredExecutable in @($InitDbExe, $PgCtlExe, $CreateDbExe, $PsqlExe, $NodeExe)) {
  if (-not (Test-Path -LiteralPath $requiredExecutable -PathType Leaf)) {
    throw "POSTGRESQL_FOUNDATION_EXECUTABLE_MISSING: $requiredExecutable"
  }
}

$RepositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$HarnessPath = Join-Path $RepositoryRoot 'scripts\test-profitability-foundation-pg17.js'
if (-not (Test-Path -LiteralPath $HarnessPath -PathType Leaf)) {
  throw "PROFITABILITY_FOUNDATION_HARNESS_MISSING: $HarnessPath"
}

function Get-RandomLoopbackPort {
  do {
    $listener = [System.Net.Sockets.TcpListener]::new(
      [System.Net.IPAddress]::Parse($LoopbackAddress),
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
    [Parameter(Mandatory = $true)] [string] $Executable,
    [Parameter(Mandatory = $true)] [string[]] $Arguments,
    [Parameter(Mandatory = $true)] [string] $FailureCode
  )

  & $Executable @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FailureCode (exit=$LASTEXITCODE)"
  }
}

function Resolve-SafeEphemeralDirectory {
  param([Parameter(Mandatory = $true)] [string] $Candidate)

  $resolved = [System.IO.Path]::GetFullPath($Candidate)
  $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  if (-not $resolved.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "UNSAFE_EPHEMERAL_DATA_DIRECTORY: $resolved"
  }
  if (-not ([System.IO.Path]::GetFileName($resolved)).StartsWith(
    $TempDirectoryPrefix,
    [System.StringComparison]::OrdinalIgnoreCase
  )) {
    throw "UNSAFE_EPHEMERAL_DATA_DIRECTORY_PREFIX: $resolved"
  }
  return $resolved
}

$UniqueSuffix = [Guid]::NewGuid().ToString('N')
$DataDirectory = Resolve-SafeEphemeralDirectory (
  Join-Path ([System.IO.Path]::GetTempPath()) "$TempDirectoryPrefix$UniqueSuffix"
)
$Port = Get-RandomLoopbackPort
$ServerStarted = $false
$ServerStopped = $false
$SmokeSucceeded = $false
$PostmasterPidPath = Join-Path $DataDirectory 'postmaster.pid'

try {
  if (Test-Path -LiteralPath $DataDirectory) {
    throw "EPHEMERAL_DATA_DIRECTORY_ALREADY_EXISTS: $DataDirectory"
  }
  New-Item -ItemType Directory -Path $DataDirectory | Out-Null

  Invoke-NativeChecked -Executable $InitDbExe -Arguments @(
    '-D', $DataDirectory,
    '-U', $BootstrapSuperuser,
    '--auth-local', 'trust',
    '--auth-host', 'trust',
    '--encoding', 'UTF8',
    '--no-locale'
  ) -FailureCode 'PROFITABILITY_FOUNDATION_INITDB_FAILED'

  Add-Content -LiteralPath (Join-Path $DataDirectory 'postgresql.conf') -Value @(
    "listen_addresses = '$LoopbackAddress'",
    "port = $Port",
    "max_connections = 20",
    "fsync = off",
    "synchronous_commit = off",
    "full_page_writes = off"
  )

  Invoke-NativeChecked -Executable $PgCtlExe -Arguments @(
    '-D', $DataDirectory,
    '-w',
    '-t', '60',
    'start'
  ) -FailureCode 'PROFITABILITY_FOUNDATION_PG_CTL_START_FAILED'
  $ServerStarted = $true

  Invoke-NativeChecked -Executable $CreateDbExe -Arguments @(
    '--host', $LoopbackAddress,
    '--port', [string] $Port,
    '--username', $BootstrapSuperuser,
    '--owner', $BootstrapSuperuser,
    $DatabaseName
  ) -FailureCode 'PROFITABILITY_FOUNDATION_CREATEDB_FAILED'

  $env:TEST_PROFITABILITY_FOUNDATION_DATABASE_URL = (
    "postgresql://$BootstrapSuperuser@$LoopbackAddress`:$Port/$DatabaseName"
  )
  $env:TEST_PROFITABILITY_FOUNDATION_EPHEMERAL_CONFIRMATION = (
    'I_CONFIRM_THIS_IS_A_DISPOSABLE_LOCAL_POSTGRESQL_17_FOUNDATION_DATABASE'
  )
  $env:TEST_PROFITABILITY_FOUNDATION_PSQL_PATH = $PsqlExe

  Invoke-NativeChecked -Executable $NodeExe -Arguments @(
    $HarnessPath,
    '--run-pg17-harness'
  ) -FailureCode 'PROFITABILITY_FOUNDATION_PG17_HARNESS_FAILED'

  $SmokeSucceeded = $true
  Write-Output 'PROFITABILITY_FOUNDATION_PG17_EPHEMERAL_SMOKE_PASSED'
}
finally {
  Remove-Item Env:TEST_PROFITABILITY_FOUNDATION_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:TEST_PROFITABILITY_FOUNDATION_EPHEMERAL_CONFIRMATION -ErrorAction SilentlyContinue
  Remove-Item Env:TEST_PROFITABILITY_FOUNDATION_PSQL_PATH -ErrorAction SilentlyContinue

  if ($ServerStarted -or (Test-Path -LiteralPath $PostmasterPidPath)) {
    & $PgCtlExe -D $DataDirectory -m fast -w -t 60 stop
    $ServerStopped = ($LASTEXITCODE -eq 0)
  }
  else {
    $ServerStopped = $true
  }

  if ($SmokeSucceeded -and $ServerStopped) {
    $VerifiedDataDirectory = Resolve-SafeEphemeralDirectory $DataDirectory
    $directoryInfo = Get-Item -LiteralPath $VerifiedDataDirectory -Force
    if (($directoryInfo.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "REFUSING_UNSAFE_EPHEMERAL_CLEANUP: $VerifiedDataDirectory"
    }
    Remove-Item -LiteralPath $VerifiedDataDirectory -Recurse -Force
  }
  elseif (Test-Path -LiteralPath $DataDirectory) {
    Write-Warning "EPHEMERAL_DATA_PRESERVED_FOR_DIAGNOSIS=$DataDirectory"
  }
}
