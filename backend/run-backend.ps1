# Run Django with the project venv (no need to `Activate.ps1` first)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$py = Join-Path $PSScriptRoot "venv\Scripts\python.exe"
if (-not (Test-Path $py)) {
    Write-Host "Virtual env not found. Create it and install deps:" -ForegroundColor Yellow
    Write-Host "  python -m venv venv" -ForegroundColor Gray
    Write-Host "  .\venv\Scripts\pip install -r requirements.txt" -ForegroundColor Gray
    exit 1
}
& $py manage.py runserver @args
