import process from 'node:process'

import { execSync, spawn as nodeSpawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const DEFAULT_MODEL = 'openbmb/minicpm-v4.5:latest'
const OLLAMA_BASE_URL = 'http://localhost:11434'

export interface PullModelsOptions {
  model?: string
  force?: boolean
  listOnly?: boolean
}

function has(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }).trim().split('\n')[0]
  }
  catch {
    return null
  }
}

async function isOllamaServing(): Promise<boolean> {
  const baseUrl = process.env.OLLAMA_HOST || OLLAMA_BASE_URL
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  }
  catch {
    return false
  }
}

function spawnStreamed(cmd: string, args: string[], cwd: string): Promise<number> {
  return new Promise((resolve) => {
    const child = nodeSpawn(cmd, args, { cwd, stdio: 'inherit' })
    child.on('close', code => resolve(code ?? 1))
    child.on('error', () => resolve(1))
  })
}

async function listModels(): Promise<string[]> {
  const baseUrl = process.env.OLLAMA_HOST || OLLAMA_BASE_URL
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok)
      return []

    const data = await res.json() as { models?: Array<{ name: string }> }
    return data.models?.map(model => model.name) ?? []
  }
  catch {
    return []
  }
}

export async function pullModels(options: PullModelsOptions = {}) {
  const model = options.model
    || process.argv.find((_, index, argv) => argv[index - 1] === '--model')
    || DEFAULT_MODEL
  const force = options.force || process.argv.includes('--force')
  const listOnly = options.listOnly || process.argv.includes('--list')

  if (listOnly) {
    console.info('Available models on Ollama:')
    console.info(`  Default:  ${DEFAULT_MODEL}`)
    console.info()
    console.info('Usage:')
    console.info('  pnpm -F @proj-airi/visual-chat-ops pull-models')
    console.info(`  pnpm -F @proj-airi/visual-chat-ops pull-models --model ${DEFAULT_MODEL}`)
    console.info()
    console.info('Alternative MiniCPM-compatible models:')
    console.info('  openbmb/minicpm-v4.5:latest  MiniCPM-V 4.5 vision-language')
    console.info('  openbmb/minicpm-o2.6        MiniCPM-o 2.6 multimodal chat')
    console.info('  qwen3-vl:8b                 Qwen3 VL 8B vision')
    console.info('  llava:13b                   LLaVA 13B vision')
    return
  }

  console.info('=== AIRI Visual Chat Pull Model ===\n')
  console.info(`  Model: ${model}\n`)

  if (!has('ollama --version')) {
    console.info('  Ollama not found. Run setup first:')
    console.info('    pnpm -F @proj-airi/visual-chat-ops setup-engine')
    process.exitCode = 1
    return
  }

  if (!await isOllamaServing()) {
    console.info('  Ollama is not running. Start it with:')
    console.info('    ollama serve')
    console.info()
    console.info('  Or run:')
    console.info('    pnpm -F @proj-airi/visual-chat-ops setup-engine')
    process.exitCode = 1
    return
  }

  const existing = await listModels()
  const alreadyPulled = existing.some(item => item.startsWith(model.split(':')[0]))
  if (alreadyPulled && !force) {
    console.info(`  Model already available: ${model}`)
    console.info('  Use --force to re-pull.')
    console.info('\n  Ready! Start with:')
    console.info('    pnpm -F @proj-airi/visual-chat-ops start:local')
    return
  }

  console.info(`  Pulling ${model} via Ollama...`)
  console.info('  Ollama handles download, quantization, and GPU optimization automatically.\n')

  const code = await spawnStreamed('ollama', ['pull', model], process.cwd())

  if (code !== 0) {
    console.info('\n  Pull failed. Check your network connection and try again.')
    console.info(`  Manual: ollama pull ${model}`)
    process.exitCode = 1
    return
  }

  console.info('\n=== Model ready ===')
  console.info(`  Model:  ${model}`)
  console.info('  Start:  pnpm -F @proj-airi/visual-chat-ops start:local\n')
}

function isDirectExecution(): boolean {
  const entryPath = process.argv[1]
  return !!entryPath && pathToFileURL(entryPath).href === import.meta.url
}

if (isDirectExecution()) {
  void pullModels()
}
