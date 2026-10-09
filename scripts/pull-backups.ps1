<#
scripts/pull-backups.ps1 - copy the server's nightly dumps onto this Windows PC.

The server's own backups (scripts/backup-db.sh) sit on the same disk as the
database. This pulls them to a machine that fails independently, with nothing
to configure on the server beyond the SSH access you already use.

  powershell -ExecutionPolicy Bypass -File scripts\pull-backups.ps1

Schedule it daily, after the server's 04:00 dump (one line, run once):

  schtasks /Create /SC DAILY /ST 09:00 /TN "Stardom backup pull" /TR "powershell -ExecutionPolicy Bypass -File C:\dev\Stars_of_dominion\scripts\pull-backups.ps1"

Every fetched file is checked as complete gzip before it counts; a broken copy
is deleted so the next run fetches it again. The result goes to pull.log in the
destination folder.
#>
param(
    [string]$Server = $(if ($env:STARDOM_SSH) { $env:STARDOM_SSH } else { 'logo@192.168.2.3' }),
    [string]$RemoteDir = '~/backups',
    [string]$Dest = "$env:USERPROFILE\StardomBackups",
    [int]$KeepDays = 60
)

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
$log = Join-Path $Dest 'pull.log'
function Log($msg) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg" | Add-Content -Path $log -Encoding utf8; Write-Output $msg }

function Test-Gzip([string]$path) {
    try {
        $fs = [IO.File]::OpenRead($path)
        $gz = New-Object IO.Compression.GZipStream($fs, [IO.Compression.CompressionMode]::Decompress)
        $buf = New-Object byte[] 1048576
        while ($gz.Read($buf, 0, $buf.Length) -gt 0) { }
        return $true
    } catch { return $false } finally { if ($gz) { $gz.Dispose() }; if ($fs) { $fs.Dispose() } }
}

# BatchMode: fail instead of hanging on a password prompt when run unattended.
$listing = & ssh -o BatchMode=yes -o ConnectTimeout=15 $Server "ls -1 $RemoteDir/stardom-*.sql.gz 2>/dev/null"
if ($LASTEXITCODE -ne 0 -and -not $listing) { Log "FAILED cannot list $Server`:$RemoteDir (server off, or SSH key not set up for unattended use?)"; exit 1 }

$fetched = 0; $failed = 0
foreach ($remote in @($listing)) {
    if (-not $remote) { continue }
    $name = Split-Path $remote -Leaf
    $local = Join-Path $Dest $name
    if (Test-Path $local) { continue }
    $partial = "$local.partial"
    & scp -q -o BatchMode=yes "${Server}:$remote" $partial
    if ($LASTEXITCODE -eq 0 -and (Test-Gzip $partial)) {
        Move-Item -Force $partial $local
        Log "OK $name ($([math]::Round((Get-Item $local).Length / 1KB)) KB)"
        $fetched++
    } else {
        Remove-Item -Force -ErrorAction SilentlyContinue $partial
        Log "FAILED $name did not arrive intact; will retry next run"
        $failed++
    }
}

Get-ChildItem -Path $Dest -Filter 'stardom-*.sql.gz' |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } |
    Remove-Item -Force

$newest = Get-ChildItem -Path $Dest -Filter 'stardom-*.sql.gz' | Sort-Object Name -Descending | Select-Object -First 1
if (-not $newest) { Log 'WARN no backups held locally'; exit 1 }
Log "done: $fetched new, $failed failed; newest $($newest.Name)"
if ($newest.Name -lt "stardom-$((Get-Date).AddDays(-2).ToString('yyyy-MM-dd'))") { Log "WARN newest dump is more than two days old - is the server's cron job running?" }
if ($failed -gt 0) { exit 2 }
exit 0
