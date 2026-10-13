# PERSONAL: Prepares the local AI model for AIRI on Windows. See personal/README.md.
#
# 1. Makes sure that Ollama is installed and running.
# 2. Downloads the chat model that local-mode.json names.
#
# Run it from the repository root:
#   powershell -ExecutionPolicy Bypass -File personal\setup-local.ps1

$ErrorActionPreference = 'Stop'

$configPath = Join-Path $PSScriptRoot '..\apps\stage-tamagotchi\src\renderer\personal\local-mode.json'
$config = Get-Content -Raw -Path $configPath | ConvertFrom-Json
$model = $config.ollama.model
$baseUrl = $config.ollama.baseUrl
# The app uses the OpenAI-compatible '/v1/' path. The Ollama status API is at the server root.
$serverUrl = $baseUrl -replace '/v1/?$', ''

function Test-OllamaServer {
  try {
    Invoke-RestMethod -Uri "$serverUrl/api/tags" -TimeoutSec 3 | Out-Null
    return $true
  }
  catch {
    return $false
  }
}

Write-Host "AIRI local mode setup"
Write-Host "Chat model: $model"
Write-Host ""

if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Host "Ollama is not installed. Installing it with winget..."
    winget install --id Ollama.Ollama --exact --accept-source-agreements --accept-package-agreements
    # winget changes PATH for new terminals only. Read it again for this one.
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  }
  else {
    Write-Host "Ollama is not installed, and winget is not available."
    Write-Host "Download Ollama from https://ollama.com/download, install it, then run this script again."
    exit 1
  }
}

if (-not (Test-OllamaServer)) {
  Write-Host "Starting the Ollama server..."
  Start-Process -FilePath 'ollama' -ArgumentList 'serve' -WindowStyle Hidden
  $deadline = (Get-Date).AddSeconds(30)
  while (-not (Test-OllamaServer)) {
    if ((Get-Date) -gt $deadline) {
      Write-Host "The Ollama server did not start at $serverUrl. Open the Ollama app, then run this script again."
      exit 1
    }
    Start-Sleep -Seconds 1
  }
}

Write-Host "Downloading $model. The first download can take several minutes..."
ollama pull $model
if ($LASTEXITCODE -ne 0) {
  Write-Host "The download of $model failed. Make sure that the model name in local-mode.json is correct."
  exit 1
}

Write-Host ""
Write-Host "Done. Ollama is ready with $model."
Write-Host "Start AIRI. The app downloads the voice model the first time that it speaks."
