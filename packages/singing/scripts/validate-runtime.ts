/* eslint-disable no-console */
/**
 * Script: Validate that runtime dependencies are available.
 * Checks FFmpeg, Python 3.10+, uv, and optionally torch/CUDA.
 *
 * Usage: pnpm -F @proj-airi/singing validate
 */

import process from 'node:process'

import { execSync } from 'node:child_process'

const PYTHON_VERSION_RE = /Python 3\.(\d+)/

interface CheckResult {
  name: string
  ok: boolean
  info?: string
  required: boolean
}

function getCommandOutput(cmd: string): string | null {
  try {
    return execSync(cmd, { stdio: 'pipe', encoding: 'utf-8' }).trim()
  }
  catch {
    return null
  }
}

const results: CheckResult[] = []

const ffmpegVersion = getCommandOutput('ffmpeg -version')
results.push({
  name: 'FFmpeg',
  ok: ffmpegVersion !== null,
  info: ffmpegVersion?.split('\n')[0],
  required: true,
})

const pythonVersion = getCommandOutput('python --version')
const pythonOk = pythonVersion !== null && PYTHON_VERSION_RE.test(pythonVersion)
  && Number.parseInt(pythonVersion.match(PYTHON_VERSION_RE)?.[1] ?? '0') >= 10
results.push({
  name: 'Python >= 3.10',
  ok: pythonOk,
  info: pythonVersion ?? undefined,
  required: true,
})

const uvVersion = getCommandOutput('uv --version')
results.push({
  name: 'uv (Python package manager)',
  ok: uvVersion !== null,
  info: uvVersion ?? undefined,
  required: true,
})

const torchCheck = getCommandOutput('python -c "import torch; print(f\'torch {torch.__version__}, CUDA: {torch.cuda.is_available()}\')"')
results.push({
  name: 'PyTorch',
  ok: torchCheck !== null,
  info: torchCheck ?? 'not installed (GPU acceleration unavailable)',
  required: false,
})

console.log('\n  Singing Module — Runtime Validation\n')

let allRequiredPassed = true
for (const r of results) {
  const status = r.ok ? 'OK' : (r.required ? 'MISSING' : 'OPTIONAL')
  const icon = r.ok ? '+' : (r.required ? 'x' : '-')
  console.log(`  [${icon}] ${r.name}: ${status}${r.info ? ` — ${r.info}` : ''}`)
  if (r.required && !r.ok)
    allRequiredPassed = false
}

console.log('')
if (!allRequiredPassed) {
  console.log('  Some required dependencies are missing. See above.\n')
  process.exit(1)
}
console.log('  All required dependencies available.\n')
