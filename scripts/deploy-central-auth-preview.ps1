[CmdletBinding()]
param(
  [string]$Channel = 'central-auth-p0',
  [string]$Project = 'iclean-room',
  [string]$Expires = '7d'
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$appHostingPath = Join-Path $repositoryRoot 'apphosting.yaml'
$webAppPath = Join-Path $repositoryRoot 'web-app'

# These are public browser build inputs only. Secrets must never be copied into
# a Hosting preview build or this helper.
$publicBuildVariables = @(
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_DATACONNECT_LOCATION',
  'VITE_DATACONNECT_SERVICE',
  'VITE_DATACONNECT_CONNECTOR',
  'VITE_FIREBASE_APPCHECK_SITE_KEY',
  'VITE_CENTRAL_REGISTRATION_GOOGLE_CLIENT_ID',
  'VITE_CENTRAL_REGISTRATION_TURNSTILE_SITE_KEY',
  'VITE_CENTRAL_REGISTRATION_ISSUER_READY'
)

$publicValues = @{}
$currentVariable = ''
foreach ($line in Get-Content -LiteralPath $appHostingPath) {
  if ($line -match '^\s*-\s+variable:\s*(\S+)\s*$') {
    $currentVariable = $Matches[1]
    continue
  }
  if ($currentVariable -and $line -match '^\s+value:\s*(.+?)\s*$') {
    $publicValues[$currentVariable] = $Matches[1].Trim().Trim('"').Trim("'")
    $currentVariable = ''
  }
}

foreach ($name in $publicBuildVariables) {
  if (-not $publicValues.ContainsKey($name) -or -not $publicValues[$name]) {
    throw "Brak publicznej zmiennej BUILD $name w apphosting.yaml."
  }
  [Environment]::SetEnvironmentVariable($name, $publicValues[$name], 'Process')
}

Push-Location $webAppPath
try {
  & npm run build
  if ($LASTEXITCODE -ne 0) {
    throw "Portal build failed with exit code $LASTEXITCODE."
  }
}
finally {
  Pop-Location
}

& firebase hosting:channel:deploy $Channel --project $Project --expires $Expires
if ($LASTEXITCODE -ne 0) {
  throw "Hosting channel deploy failed with exit code $LASTEXITCODE."
}
