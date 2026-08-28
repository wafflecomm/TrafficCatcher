[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $rng.GetBytes($bytes)
}
finally {
    $rng.Dispose()
}

$token = -join ($bytes | ForEach-Object { $_.ToString('x2') })
if ($token -notmatch '^[0-9a-f]{64}$') {
    throw '64자리 보안 토큰 생성에 실패했습니다.'
}

Write-Output $token
