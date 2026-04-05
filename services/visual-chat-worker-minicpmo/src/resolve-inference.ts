import process from 'node:process'

import { execSync } from 'node:child_process'

export function isOllamaAvailable(): boolean {
  try {
    execSync('ollama --version', { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] })
    return true
  }
  catch {
    return false
  }
}

export async function isOllamaServing(baseUrl = 'http://localhost:11434'): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  }
  catch {
    return false
  }
}

export async function detectOllama(logWarn: (msg: string) => void): Promise<{
  available: boolean
  baseUrl: string
  model: string
}> {
  const baseUrl = process.env.OLLAMA_HOST || 'http://localhost:11434'
  const model = process.env.OLLAMA_MODEL || 'openbmb/minicpm-v4.5:latest'

  if (await isOllamaServing(baseUrl)) {
    return { available: true, baseUrl, model }
  }

  if (isOllamaAvailable()) {
    logWarn(`Ollama is installed but not serving at ${baseUrl}. Run: ollama serve`)
  }
  else {
    logWarn('Ollama is not installed. Run: pnpm -F @proj-airi/visual-chat-ops setup-engine')
  }

  return { available: false, baseUrl, model }
}
