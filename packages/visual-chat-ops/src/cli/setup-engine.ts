import process from 'node:process'

import { execSync, spawn as nodeSpawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { platform } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const OLLAMA_DEFAULT_URL = 'http://localhost:11434'
const OLLAMA_MODEL = 'openbmb/minicpm-v4.5:latest'
const QUOTE_PATTERN = /"/g

function has(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }).trim().split('\n')[0]
  }
  catch {
    return null
  }
}

function spawnStreamed(cmd: string, args: string[], cwd: string): Promise<number> {
  return new Promise((resolve) => {
    const child = nodeSpawn(cmd, args, { cwd, stdio: 'inherit' })
    child.on('close', code => resolve(code ?? 1))
    child.on('error', () => resolve(1))
  })
}

function findOllama(): string | null {
  if (has('ollama --version'))
    return 'ollama'

  if (platform() === 'win32') {
    const candidates = [
      join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'),
      join(process.env.ProgramFiles || 'C:\\Program Files', 'Ollama', 'ollama.exe'),
    ]
    for (const candidate of candidates) {
      if (existsSync(candidate))
        return `"${candidate}"`
    }
  }
  else if (platform() === 'darwin') {
    const candidates = [
      '/opt/homebrew/bin/ollama',
      '/usr/local/bin/ollama',
    ]
    for (const candidate of candidates) {
      if (existsSync(candidate))
        return candidate
    }
  }

  return null
}

async function installOllama(): Promise<string | null> {
  const os = platform()
  console.info('\n  Installing Ollama...\n')

  if (os === 'win32' && has('winget --version')) {
    const code = await spawnStreamed('winget', [
      'install',
      'Ollama.Ollama',
      '--accept-package-agreements',
      '--accept-source-agreements',
    ], process.cwd())
    if (code === 0)
      return findOllama()
  }
  else if (os === 'darwin' && has('brew --version')) {
    const code = await spawnStreamed('brew', ['install', 'ollama'], process.cwd())
    if (code === 0)
      return findOllama()
  }
  else if (os !== 'win32' && os !== 'darwin') {
    const code = await spawnStreamed('sh', ['-c', 'curl -fsSL https://ollama.com/install.sh | sh'], process.cwd())
    if (code === 0)
      return findOllama()
  }

  return null
}

async function isOllamaServing(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  }
  catch {
    return false
  }
}

async function startOllamaServe(ollamaCmd: string): Promise<boolean> {
  console.info('  Starting Ollama service...')

  const child = nodeSpawn(ollamaCmd, ['serve'], {
    stdio: 'ignore',
    detached: true,
  })
  child.unref()

  for (let index = 0; index < 15; index++) {
    await new Promise(resolve => setTimeout(resolve, 2000))
    if (await isOllamaServing(OLLAMA_DEFAULT_URL)) {
      console.info('  Ollama service is running.')
      return true
    }
  }

  return false
}

async function checkGpuInfo(): Promise<string> {
  const nvidiaGpu = has('nvidia-smi') !== null
  const isMac = platform() === 'darwin'

  if (nvidiaGpu)
    return 'CUDA (auto-detected by Ollama)'
  if (isMac)
    return 'Metal (auto-detected by Ollama)'
  return 'CPU'
}

export async function setupEngine() {
  console.info('=== AIRI Visual Chat Inference Engine Setup ===\n')

  const os = platform()
  const gpuLabel = await checkGpuInfo()
  console.info(`  Platform:     ${os} (${process.arch})`)
  console.info(`  GPU backend:  ${gpuLabel}`)
  console.info(`  Model:        ${OLLAMA_MODEL}\n`)

  let ollamaCmd = findOllama()
  if (ollamaCmd) {
    console.info(`  [OK] Ollama found: ${ollamaCmd}`)
  }
  else {
    console.info('  [--] Ollama not found, installing...')
    ollamaCmd = await installOllama()

    if (!ollamaCmd) {
      console.info('\n  Auto-install failed. Please install manually:')
      if (os === 'win32')
        console.info('    winget install Ollama.Ollama')
      else if (os === 'darwin')
        console.info('    brew install ollama')
      else
        console.info('    curl -fsSL https://ollama.com/install.sh | sh')

      console.info('    Then re-run: pnpm -F @proj-airi/visual-chat-ops setup-engine')
      process.exitCode = 1
      return
    }

    console.info(`  [OK] Ollama installed: ${ollamaCmd}`)
  }

  const baseUrl = process.env.OLLAMA_HOST || OLLAMA_DEFAULT_URL
  const serving = await isOllamaServing(baseUrl)

  if (serving) {
    console.info(`  [OK] Ollama is serving at ${baseUrl}`)
  }
  else {
    console.info(`  [--] Ollama is not serving at ${baseUrl}`)
    const started = await startOllamaServe(ollamaCmd.replace(QUOTE_PATTERN, ''))
    if (!started) {
      console.info('\n  Could not start Ollama. Please start it manually:')
      console.info('    ollama serve')
      console.info('  Then re-run this command.')
      process.exitCode = 1
      return
    }
  }

  console.info('\n=== Setup complete ===')
  console.info(`  Ollama:  ${ollamaCmd}`)
  console.info(`  GPU:     ${gpuLabel}`)
  console.info(`  API:     ${baseUrl}`)
  console.info(`\n  Next: pnpm -F @proj-airi/visual-chat-ops pull-models --model ${OLLAMA_MODEL}`)
  console.info('  Then: pnpm -F @proj-airi/visual-chat-ops start:local\n')
}

function isDirectExecution(): boolean {
  const entryPath = process.argv[1]
  return !!entryPath && pathToFileURL(entryPath).href === import.meta.url
}

if (isDirectExecution()) {
  void setupEngine()
}
