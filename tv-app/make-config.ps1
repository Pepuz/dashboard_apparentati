# Generates tv-app/config.js (git-ignored) from the repo's .env.
$ErrorActionPreference = 'Stop'

$envFile = Join-Path $PSScriptRoot '..\.env'
$values = @{}
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([A-Z_]+)\s*=\s*(.*?)\s*$') {
        $values[$Matches[1]] = $Matches[2].Trim('"', "'")
    }
}

$url = "$($values['SUPABASE_URL'])".TrimEnd('/')
$key = "$($values['SUPABASE_PUBLISHABLE_KEY'])"
if ($url -notmatch '^https://') { throw "SUPABASE_URL in $envFile must start with https://" }
# The TV package is public by design: refuse secret or legacy keys.
if ($key -notlike 'sb_publishable_*') { throw "SUPABASE_PUBLISHABLE_KEY in $envFile must start with sb_publishable_" }

@"
var CONFIG = {
  supabaseUrl: '$url',
  supabasePublishableKey: '$key'
};
"@ | Set-Content -Encoding utf8 (Join-Path $PSScriptRoot 'config.js')
