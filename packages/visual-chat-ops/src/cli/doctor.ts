import type { CheckResult } from './shared'

import process from 'node:process'

import { execSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import {
  checkOllamaHealth,
  checkOllamaModel,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
} from './shared'

function checkCommand(name: string, cmd: string, required: boolean = true): CheckResult {
  try {
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
    return { name, ok: true, detail: output.split('\n')[0], required }
  }
  catch {
    return { name, ok: false, detail: 'not found', required }
  }
}

export async function doctor() {
  console.info('=== AIRI Visual Chat Environment Doctor ===\n')

  const syncChecks: CheckResult[] = [
    checkCommand('Node.js', 'node --version', true),
    checkCommand('pnpm', 'pnpm --version', true),
    checkCommand('git', 'git --version', true),
    checkCommand('GPU (nvidia-smi)', 'nvidia-smi --query-gpu=name --format=csv,noheader', false),
    {
      name: 'Fixed pipeline',
      ok: true,
      detail: 'ollama-lite',
      required: true,
    },
    {
      name: 'Fixed model target',
      ok: true,
      detail: `${DEFAULT_OLLAMA_MODEL} via ${DEFAULT_OLLAMA_BASE_URL}`,
      required: true,
    },
  ]

  const asyncChecks = await Promise.all([
    checkOllamaHealth(),
    checkOllamaModel(),
  ])

  const checks = [...syncChecks, ...asyncChecks]
  let hasRequiredFailure = false

  for (const check of checks) {
    const icon = check.ok ? '[OK]' : check.required ? '[!!]' : '[--]'
    const suffix = !check.ok && !check.required ? ' (optional)' : ''
    console.info(`  ${icon} ${check.name}: ${check.detail}${suffix}`)
    if (!check.ok && check.required)
      hasRequiredFailure = true
  }

  console.info()

  if (hasRequiredFailure) {
    console.info('Some required checks failed. Resolve the fixed Ollama Visual Chat path first.')
    console.info()
    console.info('Required local path:')
    console.info(`  Ollama at ${DEFAULT_OLLAMA_BASE_URL}`)
    console.info(`  Model: ${DEFAULT_OLLAMA_MODEL}`)
    console.info()
    console.info('Then start AIRI bridge services with:')
    console.info('  pnpm -F @proj-airi/visual-chat-ops start:local')
    process.exitCode = 1
  }
  else {
    console.info('All checks passed. AIRI Visual Chat can start on the fixed local pipeline.')
  }
}

function isDirectExecution(): boolean {
  const entryPath = process.argv[1]
  return !!entryPath && pathToFileURL(entryPath).href === import.meta.url
}

if (isDirectExecution()) {
  void doctor()
}
