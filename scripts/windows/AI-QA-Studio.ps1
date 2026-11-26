<#
  AI QA Studio - one-click install, update and run for Windows.

  Double-click AI-QA-Studio.cmd (repo root), or run:
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\AI-QA-Studio.ps1

  What it does (each step is skipped when already done, so it is safe to run again):
    1. Installs missing tools: Node.js, Git, Ollama, n8n, cloudflared (portable).
    2. Gets the code (clone, or fast-forward pull) for live (main) and staging (staging).
    3. Per copy: creates apps\server\.env with fresh secrets, installs packages,
       updates the database and builds the web app (only when the code changed).
    4. Downloads the AI model and sets up n8n (credential + workflows, activated).
    5. Starts everything in the background (keeps running after this window closes)
       and opens the public link, but only after the admin account exists.

  Options:
    -Root <folder>   Where everything lives. Default: the folder that holds this repo,
                     or Documents\AI-QA-Studio when the script runs on its own.
    -Stop            Stop the public link, both servers and n8n, then exit.
    -NoUpdate        Do not git pull (quick start, e.g. at login).
    -NoStaging       Skip the staging copy.
    -NoTunnel        Do not start the public link.
    -AutoStart       Also start AI QA Studio automatically when you sign in to Windows.
    -RemoveAutoStart Remove that again.
#>
[CmdletBinding()]
param(
    [string]$Root,
    [switch]$Stop,
    [switch]$NoUpdate,
    [switch]$NoStaging,
    [switch]$NoTunnel,
    [switch]$AutoStart,
    [switch]$RemoveAutoStart
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$RepoUrl     = 'https://github.com/Harley0211/ai-qa-studio.git'
$Model       = 'qwen3-vl:2b-instruct'
$CredId      = 'PPTA7Tlvv48ZL9Pd'      # credential id referenced by the workflow files
$LiveWfId    = 'AqsLiveGenerate1'      # fixed ids, so re-running updates instead of duplicating
$StageWfId   = 'AqsStageGenerat1'
$LivePath    = 'ai-qa-studio/generate'
$StagePath   = 'ai-qa-studio-staging/generate'
$SetupVersion = '1'

# ---------------------------------------------------------------- layout
$ScriptRepo = $null
if ($PSScriptRoot) {
    $guess = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
    if (Test-Path (Join-Path $guess 'apps\server\package.json')) { $ScriptRepo = $guess }
}
if (-not $Root) {
    if ($ScriptRepo) { $Root = Split-Path $ScriptRepo -Parent }
    else { $Root = Join-Path $HOME 'Documents\AI-QA-Studio' }
}
$Root     = [IO.Path]::GetFullPath($Root)
$LiveDir  = if ($ScriptRepo -and ((Split-Path $ScriptRepo -Parent) -eq $Root)) { $ScriptRepo } else { Join-Path $Root 'ai-qa-studio' }
$StageDir = Join-Path $Root 'ai-qa-studio-staging'
$RunDir   = Join-Path $Root 'run'
$LogDir   = Join-Path $RunDir 'logs'
$StateDir = Join-Path $RunDir 'state'
$ToolsDir = Join-Path $Root 'tools'
$LinkFile = Join-Path $RunDir 'PUBLIC-LINK.txt'
New-Item -ItemType Directory -Force $Root, $RunDir, $LogDir, $StateDir, $ToolsDir | Out-Null

# ---------------------------------------------------------------- helpers
function Write-Step([string]$Text) { Write-Host ''; Write-Host "==> $Text" -ForegroundColor Cyan }
function Write-Ok([string]$Text)   { Write-Host "    $Text" -ForegroundColor Green }
function Write-Info([string]$Text) { Write-Host "    $Text" }
function Write-Warn2([string]$Text){ Write-Host "    ! $Text" -ForegroundColor Yellow }

function Update-PathFromSystem {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user    = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machine;$user;$env:Path"
}

# Runs a program, streams its output (minus n8n license chatter) and returns it.
function Invoke-Tool {
    param([string]$Exe, [string[]]$ArgList = @(), [switch]$AllowFail, [switch]$Silent)
    $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try {
        $out = & $Exe @ArgList 2>&1 | ForEach-Object { "$_" } |
            Where-Object { $_ -notmatch 'license SDK|License is about|Reloaded license|renewOnInit' }
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $old }
    if (-not $Silent) { $out | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray } }
    if ($code -and -not $AllowFail) { throw "$Exe $($ArgList -join ' ') failed (exit code $code)" }
    return ($out -join "`n")
}

function Test-Port([int]$Port) {
    [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Wait-Port([int]$Port, [int]$Seconds, [string]$Name) {
    $end = (Get-Date).AddSeconds($Seconds)
    while (-not (Test-Port $Port)) {
        if ((Get-Date) -gt $end) { throw "$Name did not start within $Seconds s. See $LogDir\$Name.log" }
        Start-Sleep 2
    }
}

function Stop-Port([int]$Port) {
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -Confirm:$false -ErrorAction SilentlyContinue }
    $end = (Get-Date).AddSeconds(20)
    while ((Test-Port $Port) -and (Get-Date) -lt $end) { Start-Sleep 1 }
}

# Starts a program hidden, owned by Windows (WMI) so it outlives this window.
function Start-Detached([string]$Name, [string]$WorkDir, [string]$Command) {
    $log = Join-Path $LogDir "$Name.log"
    Add-Content -Path $log -Value "`r`n===== $(Get-Date -Format s) start =====" -Encoding UTF8
    $ps  = "Set-Location -LiteralPath '$WorkDir'; $Command *>> '$log'"
    $enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($ps))
    $r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
        CommandLine      = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -EncodedCommand $enc"
        CurrentDirectory = $WorkDir
    }
    if ($r.ReturnValue -ne 0) { throw "Could not start $Name (WMI code $($r.ReturnValue))" }
}

function Get-State([string]$Key) {
    $f = Join-Path $StateDir "$Key.txt"
    if (Test-Path $f) { (Get-Content $f -Raw).Trim() } else { '' }
}
function Set-State([string]$Key, [string]$Value) {
    Set-Content -Path (Join-Path $StateDir "$Key.txt") -Value $Value -Encoding ASCII
}

function Get-FileHashText([string[]]$Paths) {
    ($Paths | Where-Object { $_ } | ForEach-Object { if (Test-Path $_) { (Get-FileHash $_ -Algorithm SHA256).Hash } else { 'none' } }) -join '|'
}

function Install-WithWinget([string]$Id, [string]$Label) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw "winget is missing. Install 'App Installer' from the Microsoft Store, then run this again. (Needed for $Label.)"
    }
    Write-Info "Installing $Label (a Windows permission prompt may appear: click Yes)..."
    Invoke-Tool winget @('install', '--id', $Id, '-e', '--silent', '--accept-package-agreements', '--accept-source-agreements') -AllowFail | Out-Null
    Update-PathFromSystem
}

function Find-First([string[]]$Candidates) {
    foreach ($c in $Candidates) { if ($c -and (Test-Path $c)) { return $c } }
    return $null
}

# ---------------------------------------------------------------- tool lookup
function Get-GitExe {
    $c = Get-Command git -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    Find-First @("$env:LOCALAPPDATA\Programs\Git\cmd\git.exe", "$env:ProgramFiles\Git\cmd\git.exe", "${env:ProgramFiles(x86)}\Git\cmd\git.exe")
}
function Get-OllamaExe {
    $c = Get-Command ollama -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    Find-First @("$env:LOCALAPPDATA\Programs\Ollama\ollama.exe", "$env:ProgramFiles\Ollama\ollama.exe")
}
function Get-CloudflaredExe {
    Find-First @("${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe", "$env:ProgramFiles\cloudflared\cloudflared.exe",
                 "$HOME\Documents\QA-Portable\tools\cloudflared\cloudflared.exe", "$ToolsDir\cloudflared\cloudflared.exe")
}
function Get-N8nCmd {
    $prefix = (Invoke-Tool 'npm.cmd' @('prefix', '-g') -Silent -AllowFail).Trim()
    Find-First @("$prefix\n8n.cmd", "$env:APPDATA\npm\n8n.cmd")
}

# ---------------------------------------------------------------- stop
function Stop-All {
    Write-Step 'Stopping AI QA Studio'
    Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -Confirm:$false
    foreach ($p in 4000, 4100, 5678) { Stop-Port $p }
    Remove-Item $LinkFile -ErrorAction SilentlyContinue
    Write-Ok 'Stopped: public link, live server, staging server, n8n. (Ollama keeps running.)'
}

function Set-AutoStart([bool]$On) {
    $lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'AI QA Studio.lnk'
    if (-not $On) { Remove-Item $lnk -ErrorAction SilentlyContinue; Write-Ok 'Auto-start removed.'; return }
    $script = Join-Path $LiveDir 'scripts\windows\AI-QA-Studio.ps1'
    $sh = New-Object -ComObject WScript.Shell
    $s = $sh.CreateShortcut($lnk)
    $s.TargetPath = 'powershell.exe'
    $s.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File `"$script`" -Root `"$Root`" -NoUpdate"
    $s.WorkingDirectory = $Root
    $s.WindowStyle = 7
    $s.Save()
    Write-Ok "AI QA Studio will start when you sign in to Windows ($lnk)."
}

if ($Stop) { Stop-All; return }
if ($RemoveAutoStart) { Set-AutoStart $false; return }

Start-Transcript -Path (Join-Path $LogDir 'setup.log') -Append | Out-Null
try {
Write-Host ''
Write-Host '  AI QA Studio - install / update / run' -ForegroundColor White
Write-Host "  Folder: $Root"

# ================================================================ 1. tools
Write-Step 'Checking tools'
Update-PathFromSystem

# Node.js 20.12+
$nodeOk = $false
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd -and (Test-Path "$ToolsDir\node\node.exe")) { $env:Path = "$ToolsDir\node;$env:Path"; $nodeCmd = Get-Command node -ErrorAction SilentlyContinue }
if ($nodeCmd) { $v = [version]((& node -v).TrimStart('v')); $nodeOk = $v -ge [version]'20.12.0' }
if (-not $nodeOk) {
    Install-WithWinget 'OpenJS.NodeJS.LTS' 'Node.js'
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeCmd) { $v = [version]((& node -v).TrimStart('v')); $nodeOk = $v -ge [version]'20.12.0' }
    if (-not $nodeOk) {
        Write-Info 'Using a portable Node.js instead (no administrator rights needed)...'
        $idx = Invoke-RestMethod 'https://nodejs.org/dist/index.json'
        $ver = ($idx | Where-Object { $_.lts } | Select-Object -First 1).version
        $zip = Join-Path $env:TEMP "node-$ver-win-x64.zip"
        Invoke-WebRequest "https://nodejs.org/dist/$ver/node-$ver-win-x64.zip" -OutFile $zip -UseBasicParsing
        $tmp = Join-Path $env:TEMP "node-extract-$ver"
        Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
        Expand-Archive $zip -DestinationPath $tmp -Force
        Remove-Item "$ToolsDir\node" -Recurse -Force -ErrorAction SilentlyContinue
        Move-Item (Join-Path $tmp "node-$ver-win-x64") "$ToolsDir\node"
        $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
        if ($userPath -notlike "*$ToolsDir\node*") { [Environment]::SetEnvironmentVariable('Path', "$ToolsDir\node;$userPath", 'User') }
        $env:Path = "$ToolsDir\node;$env:Path"
    }
}
$NodeExe = (Get-Command node).Source
Write-Ok "Node.js $(& node -v)"

# Git
$GitExe = Get-GitExe
if (-not $GitExe) { Install-WithWinget 'Git.Git' 'Git'; $GitExe = Get-GitExe }
if (-not $GitExe) { throw 'Git could not be installed. Install it from https://git-scm.com and run this again.' }
$env:Path = "$(Split-Path $GitExe);$env:Path"
Write-Ok "Git ($GitExe)"

# Ollama
$OllamaExe = Get-OllamaExe
if (-not $OllamaExe) { Install-WithWinget 'Ollama.Ollama' 'Ollama (the local AI)'; $OllamaExe = Get-OllamaExe }
if (-not $OllamaExe) { throw 'Ollama could not be installed. Install it from https://ollama.com and run this again.' }
Write-Ok "Ollama ($OllamaExe)"

# n8n
$N8nCmd = Get-N8nCmd
if (-not $N8nCmd) {
    Write-Info 'Installing n8n (takes a few minutes)...'
    Invoke-Tool 'npm.cmd' @('install', '-g', 'n8n', '--no-audit', '--no-fund') | Out-Null
    $N8nCmd = Get-N8nCmd
}
if (-not $N8nCmd) { throw 'n8n could not be installed (npm install -g n8n).' }
Write-Ok "n8n ($N8nCmd)"

# cloudflared (portable, no admin needed)
$CfExe = Get-CloudflaredExe
if (-not $CfExe -and -not $NoTunnel) {
    Write-Info 'Downloading cloudflared (for the public link)...'
    New-Item -ItemType Directory -Force "$ToolsDir\cloudflared" | Out-Null
    $CfExe = "$ToolsDir\cloudflared\cloudflared.exe"
    Invoke-WebRequest 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $CfExe -UseBasicParsing
    $sig = Get-AuthenticodeSignature $CfExe
    if ($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch 'Cloudflare') {
        Remove-Item $CfExe -Force; throw 'Downloaded cloudflared is not signed by Cloudflare; removed it.'
    }
}
if ($CfExe) { Write-Ok "cloudflared ($CfExe)" }

# ================================================================ 2. code
Write-Step 'Getting the code'
if (-not (Test-Path (Join-Path $LiveDir '.git'))) {
    Invoke-Tool $GitExe @('clone', $RepoUrl, $LiveDir) | Out-Null
} elseif (-not $NoUpdate) {
    $dirty = Invoke-Tool $GitExe @('-C', $LiveDir, 'status', '--porcelain', '--untracked-files=no') -Silent
    if ($dirty) { Write-Warn2 'Live copy has local changes; not updating it.' }
    else { Invoke-Tool $GitExe @('-C', $LiveDir, 'pull', '--ff-only') -AllowFail | Out-Null }
}
Write-Ok "Live:    $LiveDir ($((Invoke-Tool $GitExe @('-C', $LiveDir, 'rev-parse', '--abbrev-ref', 'HEAD') -Silent).Trim()))"

if (-not $NoStaging) {
    if (-not (Test-Path (Join-Path $StageDir '.git'))) {
        Invoke-Tool $GitExe @('-C', $LiveDir, 'fetch', 'origin') -AllowFail | Out-Null
        $hasRemote = Invoke-Tool $GitExe @('-C', $LiveDir, 'branch', '-r', '--list', 'origin/staging') -Silent
        $hasLocal  = Invoke-Tool $GitExe @('-C', $LiveDir, 'branch', '--list', 'staging') -Silent
        if ($hasLocal)      { Invoke-Tool $GitExe @('-C', $LiveDir, 'worktree', 'add', $StageDir, 'staging') | Out-Null }
        elseif ($hasRemote) { Invoke-Tool $GitExe @('-C', $LiveDir, 'worktree', 'add', '--track', '-b', 'staging', $StageDir, 'origin/staging') | Out-Null }
        else                { Invoke-Tool $GitExe @('-C', $LiveDir, 'worktree', 'add', '-b', 'staging', $StageDir) | Out-Null }
    } elseif (-not $NoUpdate) {
        $dirty = Invoke-Tool $GitExe @('-C', $StageDir, 'status', '--porcelain', '--untracked-files=no') -Silent
        if ($dirty) { Write-Warn2 'Staging copy has local changes; not updating it.' }
        else { Invoke-Tool $GitExe @('-C', $StageDir, 'pull', '--ff-only') -AllowFail | Out-Null }
    }
    Write-Ok "Staging: $StageDir"
}

# ================================================================ 3. app setup
function New-Secret { (& $NodeExe -e "console.log(require('crypto').randomBytes(32).toString('hex'))").Trim() }

function Get-EnvValue([string]$EnvFile, [string]$Name) {
    $m = Select-String -Path $EnvFile -Pattern "^$Name=(.*)$" | Select-Object -First 1
    if ($m) { $m.Matches[0].Groups[1].Value.Trim().Trim('"') } else { '' }
}

function Initialize-Copy([string]$Dir, [string]$Name, [int]$Port, [bool]$IsLive) {
    Write-Step "Setting up $Name (port $Port)"
    $server  = Join-Path $Dir 'apps\server'
    $envFile = Join-Path $server '.env'

    # .env
    if (-not (Test-Path $envFile)) {
        $t = [IO.File]::ReadAllText((Join-Path $server '.env.example'))
        if ($IsLive) {
            $req = New-Secret; $sign = New-Secret
            $t = $t -replace '(?m)^CORS_ORIGIN=.*$', 'CORS_ORIGIN=http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4000,http://localhost:4000' `
                    -replace '(?m)^WEB_DIST_DIR=.*$', 'WEB_DIST_DIR=../web/dist' `
                    -replace '(?m)^PUBLIC_HOSTS=.*$', 'PUBLIC_HOSTS=.trycloudflare.com'
        } else {
            # Staging shares the secrets with live, so one n8n credential serves both.
            $liveEnv = Join-Path $LiveDir 'apps\server\.env'
            $req = Get-EnvValue $liveEnv 'N8N_REQUEST_SECRET'; $sign = Get-EnvValue $liveEnv 'EVIDENCE_SIGNING_SECRET'
            $t = $t -replace '(?m)^PORT=.*$', 'PORT=4100' `
                    -replace '(?m)^DATABASE_URL=.*$', 'DATABASE_URL="file:./staging.db"' `
                    -replace '(?m)^PUBLIC_BACKEND_URL=.*$', 'PUBLIC_BACKEND_URL=http://127.0.0.1:4100' `
                    -replace '(?m)^CORS_ORIGIN=.*$', 'CORS_ORIGIN=http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4100,http://localhost:4100' `
                    -replace '(?m)^WEB_DIST_DIR=.*$', 'WEB_DIST_DIR=../web/dist' `
                    -replace '(?m)^PUBLIC_HOSTS=.*$', 'PUBLIC_HOSTS=' `
                    -replace '(?m)^N8N_WEBHOOK_URL=.*$', "N8N_WEBHOOK_URL=http://127.0.0.1:5678/webhook/$StagePath"
        }
        $t = $t -replace '(?m)^N8N_REQUEST_SECRET=.*$', "N8N_REQUEST_SECRET=$req" `
                -replace '(?m)^EVIDENCE_SIGNING_SECRET=.*$', "EVIDENCE_SIGNING_SECRET=$sign"
        [IO.File]::WriteAllText($envFile, $t)
        Write-Ok 'Created apps\server\.env with new secrets'
    }
    # n8n listens on 127.0.0.1 only; "localhost" can resolve to IPv6 and miss it.
    $t = [IO.File]::ReadAllText($envFile)
    if ($t -match 'http://localhost:5678') { [IO.File]::WriteAllText($envFile, ($t -replace 'http://localhost:5678', 'http://127.0.0.1:5678')) }

    if (-not $IsLive) {
        $stageDb = Join-Path $server 'prisma\staging.db'
        $liveDb  = Join-Path $LiveDir 'apps\server\prisma\dev.db'
        if (-not (Test-Path $stageDb) -and (Test-Path $liveDb)) { Copy-Item $liveDb $stageDb; Write-Ok 'Copied the live database for staging' }
    }

    # Install / migrate / build only when the code changed since the last good setup.
    $head  = (Invoke-Tool $GitExe @('-C', $Dir, 'rev-parse', 'HEAD') -Silent).Trim()
    $stamp = "$SetupVersion|$head"
    $need  = ((Get-State "build-$Name") -ne $stamp) -or
             -not (Test-Path (Join-Path $Dir 'node_modules')) -or
             -not (Test-Path (Join-Path $Dir 'apps\web\dist\index.html'))
    if (-not $need) { Write-Ok 'Up to date'; return }

    if (Test-Port $Port) { Write-Info 'Stopping the running server to update it...'; Stop-Port $Port }
    Push-Location $Dir
    try {
        Write-Info 'Installing packages...'
        Invoke-Tool 'npm.cmd' @('install', '--no-audit', '--no-fund') | Out-Null
        Write-Info 'Updating the database...'
        Invoke-Tool 'npm.cmd' @('run', 'db:generate') -Silent | Out-Null
        Push-Location $server
        try { Invoke-Tool 'npx.cmd' @('prisma', 'migrate', 'deploy') | Out-Null } finally { Pop-Location }
        Write-Info 'Building the web app...'
        Invoke-Tool 'npm.cmd' @('run', 'build') -Silent | Out-Null
    } finally { Pop-Location }
    Set-State "build-$Name" $stamp
    Write-Ok 'Installed, database updated, web app built'
}

Initialize-Copy $LiveDir 'live' 4000 $true
if (-not $NoStaging) { Initialize-Copy $StageDir 'staging' 4100 $false }

# ================================================================ 4. AI model
Write-Step 'AI model (Ollama)'
if (-not (Test-Port 11434)) { Start-Detached 'ollama' $HOME "& '$OllamaExe' serve"; Wait-Port 11434 60 'ollama' }
$models = Invoke-Tool $OllamaExe @('list') -Silent -AllowFail
if ($models -notmatch [regex]::Escape($Model)) {
    Write-Info "Downloading $Model (about 2 GB, first time only)..."
    & $OllamaExe pull $Model
    if ($LASTEXITCODE) { throw "ollama pull $Model failed" }
}
Write-Ok "$Model ready"

# ================================================================ 5. n8n workflows
Write-Step 'n8n workflows'
$liveEnvFile = Join-Path $LiveDir 'apps\server\.env'
$secret = Get-EnvValue $liveEnvFile 'N8N_REQUEST_SECRET'
if ($secret.Length -lt 32) { throw "N8N_REQUEST_SECRET in $liveEnvFile is missing or shorter than 32 characters." }

$liveWfFile  = Join-Path $LiveDir 'n8n\ai-qa-studio-generation.workflow.json'
$stageWfFile = Join-Path $StageDir 'n8n\staging\ai-qa-studio-generation.STAGING.workflow.json'
# Stamp the sources, not the generated staging file (it gets a random webhook id each time).
$stageSources = if ($NoStaging) { @() } else { @((Join-Path $StageDir 'n8n\ai-qa-studio-generation.workflow.json'), (Join-Path $StageDir 'n8n\make-staging-workflow.mjs')) }
$n8nStamp = "$SetupVersion|" + (Get-FileHashText (@($liveWfFile, $liveEnvFile) + $stageSources)) + "|staging=$(-not $NoStaging)"

if ((Get-State 'n8n') -eq $n8nStamp) {
    Write-Ok 'Already set up'
} else {
    if (-not $NoStaging) {
        Push-Location $StageDir
        try { Invoke-Tool $NodeExe @('n8n/make-staging-workflow.mjs') -Silent | Out-Null } finally { Pop-Location }
    }
    $tmp = Join-Path $env:TEMP "aqs-n8n-$PID"
    New-Item -ItemType Directory -Force $tmp | Out-Null
    try {
        if (Test-Port 5678) { Write-Info 'Stopping n8n to update its workflows...'; Stop-Port 5678 }

        # Credential: header X-AQS-Request-Secret = N8N_REQUEST_SECRET (same id the workflows reference)
        $credJson = '[{"id":"' + $CredId + '","name":"Header Auth account","type":"httpHeaderAuth","data":{"name":"X-AQS-Request-Secret","value":"' + $secret + '"}}]'
        [IO.File]::WriteAllText("$tmp\cred.json", $credJson)
        Invoke-Tool $N8nCmd @('import:credentials', "--input=$tmp\cred.json") -Silent | Out-Null
        Remove-Item "$tmp\cred.json" -Force
        Write-Ok 'Credential imported'

        # Workflows with fixed ids
        $setId = "const fs=require('fs');const [src,dst,id]=process.argv.slice(1);const w=JSON.parse(fs.readFileSync(src,'utf8'));w.id=id;delete w.active;fs.writeFileSync(dst,JSON.stringify(w));"
        $mine = @(@{ Id = $LiveWfId; File = $liveWfFile; Path = $LivePath })
        if (-not $NoStaging) { $mine += @{ Id = $StageWfId; File = $stageWfFile; Path = $StagePath } }
        foreach ($w in $mine) {
            & $NodeExe -e $setId $w.File "$tmp\$($w.Id).json" $w.Id
            Invoke-Tool $N8nCmd @('import:workflow', "--input=$tmp\$($w.Id).json") -Silent | Out-Null
        }
        Write-Ok 'Workflows imported'

        # Turn off other workflows that use the same webhook addresses (older copies).
        Invoke-Tool $N8nCmd @('export:workflow', '--all', "--output=$tmp\all.json") -Silent -AllowFail | Out-Null
        if (Test-Path "$tmp\all.json") {
            $find = "const fs=require('fs');const [f,...a]=process.argv.slice(1);const mine=a.slice(0,a.length/2),paths=a.slice(a.length/2);let w=JSON.parse(fs.readFileSync(f,'utf8'));if(!Array.isArray(w))w=[w];for(const x of w){if(mine.includes(x.id))continue;const p=(x.nodes||[]).filter(n=>/webhook/i.test(n.type)).map(n=>n.parameters&&n.parameters.path);if(p.some(q=>paths.includes(q)))console.log(x.id+' '+x.name);}"
            $ids = @($mine | ForEach-Object { $_.Id }); $paths = @($mine | ForEach-Object { $_.Path })
            $others = & $NodeExe -e $find "$tmp\all.json" @($ids + $paths)
            foreach ($o in @($others | Where-Object { $_ })) {
                $oid = ($o -split ' ', 2)[0]
                Invoke-Tool $N8nCmd @('unpublish:workflow', "--id=$oid") -Silent -AllowFail | Out-Null
                Write-Info "Turned off older workflow: $o"
            }
        }

        foreach ($w in $mine) {
            $out = Invoke-Tool $N8nCmd @('publish:workflow', "--id=$($w.Id)") -Silent -AllowFail
            if ($out -match 'conflict') {
                # A stopped n8n can keep stale webhook rows; one start/stop clears them.
                Write-Info 'Clearing old webhook registrations (starting n8n once)...'
                Start-Detached 'n8n' $HOME "`$env:N8N_LISTEN_ADDRESS='127.0.0.1'; & '$N8nCmd' start"
                Wait-Port 5678 180 'n8n'; Start-Sleep 5; Stop-Port 5678
                $out = Invoke-Tool $N8nCmd @('publish:workflow', "--id=$($w.Id)") -Silent -AllowFail
            }
            if ($out -match 'conflict') { throw "n8n: webhook $($w.Path) is used by another workflow. Open http://127.0.0.1:5678, turn the old one off, then run this again." }
        }
        Write-Ok 'Workflows activated'
        Set-State 'n8n' $n8nStamp
    } finally { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
}

# ================================================================ 6. start
Write-Step 'Starting AI QA Studio'
if (Test-Port 5678) { Write-Ok 'n8n already running' } else {
    Start-Detached 'n8n' $HOME "`$env:N8N_LISTEN_ADDRESS='127.0.0.1'; & '$N8nCmd' start"
    Wait-Port 5678 180 'n8n'; Write-Ok 'n8n started'
}
if (Test-Port 4000) { Write-Ok 'Live server already running' } else {
    Start-Detached 'live-server' (Join-Path $LiveDir 'apps\server') "& '$NodeExe' src/server.js"
    Wait-Port 4000 90 'live-server'; Write-Ok 'Live server started'
}
if (-not $NoStaging) {
    if (Test-Port 4100) { Write-Ok 'Staging server already running' } else {
        Start-Detached 'staging-server' (Join-Path $StageDir 'apps\server') "& '$NodeExe' src/server.js"
        Wait-Port 4100 90 'staging-server'; Write-Ok 'Staging server started'
    }
}

# The first person to open a fresh install becomes admin: create it locally before going public.
$status = Invoke-RestMethod 'http://127.0.0.1:4000/api/auth/status'
if ($status.setupRequired) {
    Write-Host ''
    Write-Host '    FIRST RUN: create the admin account in the browser window that just opened.' -ForegroundColor Yellow
    Write-Host '    The public link starts after that. (Waiting up to 30 minutes...)' -ForegroundColor Yellow
    Start-Process 'http://127.0.0.1:4000'
    $end = (Get-Date).AddMinutes(30)
    while ($status.setupRequired -and (Get-Date) -lt $end) {
        Start-Sleep 5; $status = Invoke-RestMethod 'http://127.0.0.1:4000/api/auth/status'
    }
    if ($status.setupRequired) { Write-Warn2 'No admin account yet, so the public link was NOT started. Run this again after creating it.'; $NoTunnel = $true }
    else { Write-Ok 'Admin account created' }
}

$url = $null
if (-not $NoTunnel -and $CfExe) {
    if (Get-Process cloudflared -ErrorAction SilentlyContinue) {
        if (Test-Path $LinkFile) { $url = (Get-Content $LinkFile -Raw).Trim() }
        Write-Ok 'Public link already running'
    } else {
        $cfLog = Join-Path $LogDir 'tunnel.log'
        Remove-Item $cfLog -ErrorAction SilentlyContinue
        Start-Detached 'tunnel-console' $HOME "& '$CfExe' tunnel --no-autoupdate --logfile '$cfLog' --url http://127.0.0.1:4000"
        $end = (Get-Date).AddSeconds(90)
        while (-not $url -and (Get-Date) -lt $end) {
            Start-Sleep 3
            $m = Select-String -Path $cfLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($m) { $url = $m.Matches[0].Value }
        }
        if ($url) { Set-Content -Path $LinkFile -Value $url -Encoding ASCII; Write-Ok 'Public link started' }
        else { Write-Warn2 "The public link did not come up. See $cfLog (company networks sometimes block it)." }
    }
}

if ($AutoStart) { Set-AutoStart $true }

# ================================================================ summary
Write-Host ''
Write-Host '  ============================================================' -ForegroundColor Green
Write-Host '   AI QA Studio is running' -ForegroundColor Green
Write-Host '  ============================================================' -ForegroundColor Green
Write-Host '   Live (this PC):     http://127.0.0.1:4000'
if (-not $NoStaging) { Write-Host '   Staging (this PC):  http://127.0.0.1:4100' }
Write-Host '   n8n:                http://127.0.0.1:5678'
if ($url) {
    Write-Host "   PUBLIC LINK:        $url" -ForegroundColor Yellow
    Write-Host "                       (copied to the clipboard; also in $LinkFile)"
    try { Set-Clipboard -Value $url } catch {}
}
Write-Host ''
Write-Host '   It keeps running after you close this window. Do not let the PC sleep.'
Write-Host '   Stop everything: AI-QA-Studio-Stop.cmd    Logs: ' -NoNewline; Write-Host $LogDir
Write-Host ''
}
catch {
    Write-Host ''
    Write-Host "  SETUP FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Full log: $(Join-Path $LogDir 'setup.log')" -ForegroundColor Red
    Stop-Transcript | Out-Null
    exit 1
}
Stop-Transcript | Out-Null
