/* eslint-disable no-console */
/**
 * Script: Set up the Python virtual environment for the singing worker.
 *
 * 1. Creates / syncs venv via `uv sync`
 * 2. Detects GPU (nvidia-smi) and picks the correct PyTorch index URL
 * 3. Installs torch + torchaudio with the right CUDA / CPU variant
 * 4. Installs remaining optional deps (librosa, etc.)
 *
 * Usage: pnpm -F @proj-airi/singing sync-python
 */

import process from 'node:process'

import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

const pythonDir = resolve(import.meta.dirname ?? __dirname, '..', 'python')

const CUDA_VERSION_RE = /CUDA Version:\s*(\d+)\.(\d+)/

function run(cmd: string, label: string): void {
  console.log(`  [sync] ${label}`)
  try {
    execSync(cmd, { cwd: pythonDir, stdio: 'inherit' })
  }
  catch (err) {
    console.error(`  [sync] FAILED: ${label}`)
    throw err
  }
}

function getOutput(cmd: string): string | null {
  try {
    return execSync(cmd, { cwd: pythonDir, stdio: 'pipe', encoding: 'utf-8' }).trim()
  }
  catch {
    return null
  }
}

interface TorchVariant {
  label: string
  indexUrl: string
}

function detectTorchVariant(): TorchVariant {
  const smiOutput = getOutput('nvidia-smi')
  if (!smiOutput) {
    return { label: 'CPU-only', indexUrl: 'https://download.pytorch.org/whl/cpu' }
  }

  const cudaMatch = smiOutput.match(CUDA_VERSION_RE)
  if (!cudaMatch) {
    return { label: 'CPU-only (nvidia-smi found but no CUDA version)', indexUrl: 'https://download.pytorch.org/whl/cpu' }
  }

  const major = Number.parseInt(cudaMatch[1], 10)
  const minor = Number.parseInt(cudaMatch[2], 10)
  const cudaVersion = major * 10 + minor

  if (cudaVersion >= 124)
    return { label: `CUDA ${major}.${minor} → cu124`, indexUrl: 'https://download.pytorch.org/whl/cu124' }
  if (cudaVersion >= 121)
    return { label: `CUDA ${major}.${minor} → cu121`, indexUrl: 'https://download.pytorch.org/whl/cu121' }
  if (cudaVersion >= 118)
    return { label: `CUDA ${major}.${minor} → cu118`, indexUrl: 'https://download.pytorch.org/whl/cu118' }

  console.warn(`  [sync] CUDA ${major}.${minor} is older than 11.8, falling back to CPU torch`)
  return { label: `CPU-only (CUDA ${major}.${minor} too old)`, indexUrl: 'https://download.pytorch.org/whl/cpu' }
}

async function main(): Promise<void> {
  console.log(`\n  Singing Module — Python Environment Setup`)
  console.log(`  Target: ${pythonDir}\n`)

  run('uv sync', 'Syncing base dependencies (numpy, soundfile)...')

  const variant = detectTorchVariant()
  console.log(`\n  [sync] PyTorch variant: ${variant.label}`)
  run(
    `uv pip install torch torchaudio --extra-index-url ${variant.indexUrl}`,
    `Installing torch + torchaudio (${variant.label})...`,
  )

  const optionalDeps = [
    { name: 'librosa', pkg: 'librosa>=0.10' },
  ]

  for (const dep of optionalDeps) {
    console.log(`  [sync] Installing ${dep.name}...`)
    try {
      execSync(`uv pip install "${dep.pkg}"`, { cwd: pythonDir, stdio: 'inherit' })
    }
    catch {
      console.warn(`  [sync] WARNING: Failed to install ${dep.name} — some features may be unavailable`)
    }
  }

  const torchCheck = getOutput('uv run python -c "import torch; print(f\'torch {torch.__version__}, CUDA available: {torch.cuda.is_available()}\')"')
  if (torchCheck) {
    console.log(`\n  [sync] Torch verification: ${torchCheck}`)
  }
  else {
    console.warn('  [sync] WARNING: Could not verify torch installation')
  }

  console.log('\n  [sync] Python environment setup complete.\n')
}

main().catch((err) => {
  console.error('\n  [sync] Setup failed:', err)
  process.exit(1)
})
