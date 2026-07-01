$ErrorActionPreference = "Stop"

$BinDir = "C:\MCP\release-binaries\mesh"
$EnvFile = "C:\MCP\.env"

Write-Host "Loading Environment Variables..."
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match "^(.*?)=(.*)$") {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            # Set globally for future terminals (User scope by default with setx)
            setx $name $value | Out-Null
            # Set locally so the current process (and its spawned daemons) gets it immediately
            Set-Item -Path "Env:$name" -Value $value
            Write-Host " -> Loaded and setx $name"
        }
    }
} else {
    Write-Host "WARNING: No .env file found at $EnvFile" -ForegroundColor Yellow
}

$Daemons = @(
    "chronicle", "pulse", "time_machine", "lifecycle", 
    "arbitration", "batch", "provisioner", "builder", 
    "auditor", "probation", "assemblyline", "telemetry"
)

Write-Host "Starting Sovereign Mesh Daemons..." -ForegroundColor Cyan

$LogDir = "C:\MCP\mesh_logs"
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
}

foreach ($daemon in $Daemons) {
    $exePath = "$BinDir\$daemon.exe"
    $jsPath = "$BinDir\$daemon.js"
    $logFile = "$LogDir\$daemon.log"
    
    if (Test-Path $exePath) {
        Write-Host " [IGNITE] Go Daemon: $daemon (Logging to $logFile)"
        Start-Process -FilePath $exePath -NoNewWindow -RedirectStandardOutput $logFile -RedirectStandardError "$logFile.err"
        Start-Sleep -Milliseconds 500
    } elseif (Test-Path $jsPath) {
        Write-Host " [IGNITE] Node Daemon: $daemon (Logging to $logFile)"
        Start-Process -FilePath "node" -ArgumentList $jsPath -NoNewWindow -RedirectStandardOutput $logFile -RedirectStandardError "$logFile.err"
        Start-Sleep -Milliseconds 500
    } else {
        Write-Host " [MISSING] Could not find executable for $daemon" -ForegroundColor Red
    }
}

Write-Host "Mesh Cluster is ONLINE!" -ForegroundColor Green
