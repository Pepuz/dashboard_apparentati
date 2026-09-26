# Renews the Developer Mode session of the TV registered in ares-cli as "tv", only in the
# last $ThresholdHours hours before it expires. Setup: README, section "Fase 2".
param([int]$ThresholdHours = 240)

$ErrorActionPreference = 'Stop'
$logFile = Join-Path $PSScriptRoot 'renew.log'
$nextCheckFile = Join-Path $PSScriptRoot 'next-check.txt'
# Windows PowerShell 5.1 may not offer TLS 1.2 by default.
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

function Write-Log($message) {
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm') $message" | Add-Content $logFile
}

function Save-NextCheck($hours) {
    (Get-Date).AddHours($hours).ToUniversalTime().ToString('o') | Set-Content $nextCheckFile
}

function Invoke-Ares {
    $tool, $rest = $args
    # A single argument comes out as a string, which splatting would drop.
    $rest = @($rest)
    # With 'Stop', Windows PowerShell 5.1 turns any stderr line of a native command into an exception.
    $ErrorActionPreference = 'Continue'
    # Full path: the scheduled task must not depend on the user's PATH.
    $output = & (Join-Path $env:APPDATA "npm\$tool.cmd") @rest 2>&1 | ForEach-Object { "$_" }
    if ($LASTEXITCODE -ne 0) { throw "$tool failed: $($output -join ' ')" }
    $output
}

function Test-Port($ip) {
    $client = New-Object Net.Sockets.TcpClient
    try { $client.ConnectAsync($ip, 9922).Wait(2000) } catch { $false } finally { $client.Dispose() }
}

# Port 9922 is Developer Mode's SSH.
# ponytail: first host answering in the /24 of the last known address, enough at home; if another
# device listens on 9922, SSH with the TV's key fails there and the host must be fixed by hand.
function Find-Tv($knownIp) {
    if (Test-Port $knownIp) { return $knownIp }
    $prefix = $knownIp -replace '\.\d+$'
    $probes = foreach ($i in 1..254) {
        $client = New-Object Net.Sockets.TcpClient
        @{ Ip = "$prefix.$i"; Client = $client; Task = $client.ConnectAsync("$prefix.$i", 9922) }
    }
    Start-Sleep -Seconds 2
    $found = $probes | Where-Object { $_.Task.Status -eq 'RanToCompletion' } | Select-Object -First 1
    $probes | ForEach-Object { $_.Client.Dispose() }
    if ($found) { $found.Ip }
}

function Get-Token {
    Invoke-Ares ares-novacom --device tv --run 'cat /var/luna/preferences/devmode_enabled' |
        Where-Object { $_ -match '^[0-9A-Za-z]+$' } | Select-Object -Last 1
}

# Community endpoint, the one webosbrew's Dev Manager uses: errorMsg holds the time left as h:mm:ss.
function Get-RemainingHours($token) {
    $url = "https://developer.lge.com/secure/CheckDevModeSession.dev?sessionToken=$token"
    $session = (Invoke-WebRequest -UseBasicParsing $url).Content | ConvertFrom-Json
    if ($session.result -ne 'success') { throw "CheckDevModeSession: $($session.errorMsg)" }
    $h, $m, $s = $session.errorMsg -split ':'
    [int]$h + [int]$m / 60 + [int]$s / 3600
}

function Invoke-Renewal {
    $nextCheck = (Get-Content $nextCheckFile -ErrorAction SilentlyContinue) -as [datetime]
    if ($nextCheck -and (Get-Date) -lt $nextCheck) { return 0 }
    $firstRun = -not $nextCheck

    $devices = (Invoke-Ares ares-setup-device --listfull) -join "`n" | ConvertFrom-Json
    $knownIp = ($devices | Where-Object { $_.name -eq 'tv' }).deviceinfo.ip
    if (-not $knownIp) { throw 'no device named "tv" in ares-setup-device' }
    $ip = Find-Tv $knownIp
    if (-not $ip) {
        Write-Log "TV not reachable at $knownIp or elsewhere in its /24: off or on another network"
        return 1
    }
    if ($ip -ne $knownIp) {
        Invoke-Ares ares-setup-device --modify tv -i "host=$ip" | Out-Null
        Write-Log "TV address changed: $knownIp -> $ip"
    }

    $token = $null
    $before = $null
    try { $token = Get-Token; $before = Get-RemainingHours $token } catch { Write-Log "WARN time left unknown: $_" }
    if (-not $firstRun -and $before -gt $ThresholdHours) {
        Save-NextCheck ($before - $ThresholdHours)
        Write-Log ('OK no renewal needed, {0:0.0} h left' -f $before)
        return 0
    }

    Invoke-Ares ares-launch --device tv com.palmdts.devmode --params "{'extend':true}" | Out-Null
    $after = $null
    if ($token) {
        foreach ($i in 1..12) {
            Start-Sleep -Seconds 10
            try { $after = Get-RemainingHours $token } catch { continue }
            if ($after -gt $before -and $after -gt $ThresholdHours) { break }
        }
    }
    # Developer Mode stays in the foreground and refuses to be closed: cover it with the dashboard.
    Invoke-Ares ares-launch --device tv com.apparentati.dashboard | Out-Null

    if ($after -gt $before -and $after -gt $ThresholdHours) {
        Save-NextCheck ($after - $ThresholdHours)
        Write-Log ('OK renewed at {0}: {1:0.0} -> {2:0.0} h left' -f $ip, $before, $after)
        return 0
    }
    if ($null -eq $after) {
        # No way to verify: trust the launch, verified by hand on this TV, for a full session.
        Save-NextCheck (1000 - $ThresholdHours)
        Write-Log "WARN renewal launched at $ip but not confirmed"
        return 0
    }
    Save-NextCheck 24
    Write-Log ('FAIL renewal launched at {0} but {1:0.0} h left, next try in 24 h' -f $ip, $after)
    return 1
}

# Dot-sourcing (the test) only loads the functions.
if ($MyInvocation.InvocationName -ne '.') {
    try { exit (Invoke-Renewal) } catch { Write-Log "ERROR $_"; exit 1 }
}
