$ErrorActionPreference = "Stop"

Write-Host "=== Fryn Windows Builder ===" -ForegroundColor Cyan

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  throw "Bun nao foi encontrado. Instale Bun 1.3.14 ou superior e execute novamente."
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
$configPath = "$root\packages\desktop\fryn-backend.json"
$config = Get-Content $configPath -Raw | ConvertFrom-Json

if (-not $config.backendUrl -or $config.backendUrl -eq "http://127.0.0.1:8787") {
  $backendUrl = Read-Host "Informe a URL do backend Fryn (ex.: https://fryn-api.seudominio.com)"
  if ([string]::IsNullOrWhiteSpace($backendUrl)) { throw "URL do backend obrigatoria." }
  @{ backendUrl = $backendUrl.TrimEnd('/') } | ConvertTo-Json | Set-Content $configPath -Encoding utf8
}

Write-Host "[1/3] Instalando dependencias..."
bun install

Write-Host "[2/3] Compilando Fryn..."
Push-Location "$root\packages\desktop"
bun run build

Write-Host "[3/3] Gerando instalador Windows x64..."
bun run package:win
Pop-Location

$source = "$root\packages\desktop\dist\Fryn-Setup.exe"
$target = "$root\Fryn-Setup.exe"
if (-not (Test-Path $source)) {
  throw "Build terminou sem gerar $source"
}
Copy-Item $source $target -Force
Write-Host "Pronto: $target" -ForegroundColor Green
