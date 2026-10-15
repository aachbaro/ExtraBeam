param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$logs = Join-Path $root '.dev'
New-Item -ItemType Directory -Path $logs -Force | Out-Null

function Test-LocalPort([int]$Port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $task = $client.ConnectAsync('127.0.0.1', $Port)
        return ($task.Wait(300) -and $client.Connected)
    } catch { return $false } finally { $client.Dispose() }
}

function Start-LocalServer($Name, $Exe, $Arguments, $Directory, [int]$Port) {
    if (Test-LocalPort $Port) {
        Write-Host "$Name : port $Port deja actif, conserve."
        return
    }
    $out = Join-Path $logs "$Name.out.log"
    $err = Join-Path $logs "$Name.err.log"
    $process = Start-Process -FilePath $Exe -ArgumentList $Arguments -WorkingDirectory $Directory -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
    $deadline = (Get-Date).AddSeconds(120)
    do {
        if (Test-LocalPort $Port) {
            Write-Host "$Name : http://127.0.0.1:$Port"
            return
        }
        if ($process.HasExited) { break }
        Start-Sleep -Milliseconds 300
    } while ((Get-Date) -lt $deadline)
    Get-Content $err -Tail 25 -ErrorAction SilentlyContinue | Write-Host
    throw "$Name ne demarre pas. Consulter $out et $err"
}

try {
    $python = @('backend\venv\Scripts\python.exe', 'backend\.venv\Scripts\python.exe', '.venv\Scripts\python.exe') |
        ForEach-Object { Join-Path $root $_ } | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $python) { throw 'Environnement Python absent. Creer backend\venv et installer backend\requirements.txt.' }
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    if (-not (Test-Path (Join-Path $root 'frontend\node_modules\vite\bin\vite.js'))) { throw 'Dependances frontend absentes : executer npm ci dans frontend.' }
    Start-LocalServer 'backend' $python 'manage.py runserver 127.0.0.1:8002 --noreload' (Join-Path $root 'backend') 8002
    Start-LocalServer 'frontend' $node 'node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5180 --strictPort' (Join-Path $root 'frontend') 5180
    if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:5180' }
    Write-Host "Rivebelle est lance. Journaux : $logs"
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
}
