# Prints the phone app link from the repo's .env: Supabase URL and publishable key travel in the fragment, which browsers never send to GitHub Pages.
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
# The app accepts only this shape (parseLink in app.js): fail here rather than hand out a link it rejects.
if ($url -cnotmatch '^https://[a-z0-9-]+\.supabase\.co$') { throw "SUPABASE_URL in $envFile must look like https://<project-ref>.supabase.co" }
# The link is shared with every roommate: refuse secret or legacy keys.
if ($key -notlike 'sb_publishable_*') { throw "SUPABASE_PUBLISHABLE_KEY in $envFile must start with sb_publishable_" }

'https://pepuz.github.io/dashboard_apparentati/mobile-app/#url=' + [uri]::EscapeDataString($url) + '&key=' + [uri]::EscapeDataString($key)
