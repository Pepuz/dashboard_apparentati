# Checks the decisions of renew-devmode.ps1 with ares-cli, the TV and LG's service faked.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'renew-devmode.ps1')

$dir = Join-Path ([IO.Path]::GetTempPath()) 'renew-devmode-test'
New-Item -ItemType Directory -Force $dir | Out-Null
$logFile = Join-Path $dir 'renew.log'
$nextCheckFile = Join-Path $dir 'next-check.txt'

function Invoke-Ares {
    $script:calls += $args -join ' '
    switch ($args[0]) {
        'ares-setup-device' { '[{"name":"tv","deviceinfo":{"ip":"192.0.2.10"}}]' }
        'ares-novacom' { '[Info] Set target device : tv'; 'abc123' }
    }
}
function Test-Port { $true }
function Start-Sleep { }
# Hours left on successive calls, the last one repeating; $null fakes the service being down.
function Get-RemainingHours {
    $value, $rest = $script:hours
    if ($rest) { $script:hours = $rest }
    if ($null -eq $value) { throw 'service down' }
    $value
}

function Test-Case($name, $nextCheck, $hours, $exitCode, $launches, $nextInHours) {
    Remove-Item $logFile, $nextCheckFile -ErrorAction SilentlyContinue
    if ($nextCheck) { $nextCheck.ToUniversalTime().ToString('o') | Set-Content $nextCheckFile }
    $script:calls = @()
    $script:hours = $hours
    $result = Invoke-Renewal
    $launched = @($script:calls -like '*com.palmdts.devmode*').Count
    $offset = (((Get-Content $nextCheckFile) -as [datetime]) - (Get-Date)).TotalHours
    if ($result -ne $exitCode -or $launched -ne $launches -or [math]::Abs($offset - $nextInHours) -gt 0.1) {
        throw "${name}: exit $result, $launched launches, next check in $offset h"
    }
    "ok  $name"
}

Test-Case 'waits for the next check' ((Get-Date).AddHours(5)) @() 0 0 5
Test-Case 'first run renews at once' $null @(812, 999.9) 0 1 759.9
Test-Case 'no launch with time left' ((Get-Date).AddHours(-1)) @(500) 0 0 260
Test-Case 'launch without effect retries in 24 h' ((Get-Date).AddHours(-1)) @(100, 99.9) 1 1 24
Test-Case 'service down trusts the launch' ((Get-Date).AddHours(-1)) @($null) 0 1 760
Remove-Item -Recurse -Force $dir
