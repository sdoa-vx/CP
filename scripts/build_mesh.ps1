$ErrorActionPreference = "Stop"

$BinDir = "C:\MCP\release-binaries\mesh"
if (!(Test-Path $BinDir)) {
    New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
}

$GoDaemons = @(
    "probation", "provisioner", "builder", "lifecycle", 
    "arbitration", "batch", "triage_effects", "chronicle", 
    "pulse", "time_machine", "telemetry"
)

Write-Host "Building Go Daemons..."
foreach ($daemon in $GoDaemons) {
    $daemonDir = "C:\MCP\mesh\$daemon"
    if (Test-Path $daemonDir) {
        Write-Host " -> Compiling $daemon"
        Push-Location $daemonDir
        go build -o "$BinDir\$daemon.exe" ./src/...
        Pop-Location
    } else {
        Write-Host " -> Skipped $daemon (not found)" -ForegroundColor Yellow
    }
}

$TsDaemons = @(
    "assemblyline", "auditor", "fisp"
)

Write-Host "Building TS Daemons..."
foreach ($daemon in $TsDaemons) {
    $daemonDir = "C:\MCP\mesh\$daemon"
    if (Test-Path $daemonDir) {
        Write-Host " -> Compiling $daemon"
        Push-Location $daemonDir
        npx esbuild src/main.ts --bundle --platform=node --outfile="$BinDir\$daemon.js"
        Pop-Location
    } else {
        Write-Host " -> Skipped $daemon (not found)" -ForegroundColor Yellow
    }
}

Write-Host "Mesh Build Complete!" -ForegroundColor Green
