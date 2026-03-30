import process from 'node:process'

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const PYTHON_PACKAGE_CACHE_TTL_MS = 60_000
const LINE_BREAK_REGEX = /\r?\n/g

const REQUIRED_PYTHON_RUNTIME_IMPORTS = [
  { id: 'airi_singing_worker', stmt: 'import airi_singing_worker' },
  { id: 'torch', stmt: 'import torch' },
  { id: 'rvc_python', stmt: 'from rvc_python.lib.audio import load_audio' },
  { id: 'torchcrepe', stmt: 'import torchcrepe' },
  { id: 'mel_band_roformer', stmt: 'import mel_band_roformer' },
  { id: 'fairseq', stmt: 'from fairseq import checkpoint_utils' },
  { id: 'faiss', stmt: 'import faiss' },
  { id: 'scipy', stmt: 'import scipy' },
  { id: 'librosa', stmt: 'import librosa' },
] as const

interface PythonRuntimePackageCacheEntry {
  checkedAt: number
  result: PythonRuntimePackageCheck
}

export interface PythonRuntimePackageCheck {
  installed: boolean
  missing: string[]
}

const pythonRuntimePackageCache = new Map<string, PythonRuntimePackageCacheEntry>()

/**
 * Verify that the Python runtime can import the core ML/runtime dependencies required by singing jobs.
 */
export async function checkPythonRuntimePackages(
  pythonPath: string,
  pythonSrcDir?: string,
  forceRecheck = false,
): Promise<PythonRuntimePackageCheck> {
  const cacheKey = `${pythonPath}::${pythonSrcDir ?? ''}`
  const cached = pythonRuntimePackageCache.get(cacheKey)
  if (!forceRecheck && cached && (Date.now() - cached.checkedAt) < PYTHON_PACKAGE_CACHE_TTL_MS)
    return cached.result

  const script = REQUIRED_PYTHON_RUNTIME_IMPORTS.map(({ id, stmt }) => `
try:
    ${stmt}
except Exception:
    print("MISSING:${id}")
`).join('\n')

  let result: PythonRuntimePackageCheck

  try {
    const { stdout } = await execFileAsync(pythonPath, ['-c', script], {
      timeout: 60_000,
      windowsHide: true,
      env: {
        ...process.env,
        ...(pythonSrcDir ? { PYTHONPATH: pythonSrcDir } : {}),
      },
    })
    const stdoutText = stdout.toString()

    const missing = stdoutText
      .split(LINE_BREAK_REGEX)
      .map(line => line.trim())
      .filter(line => line.startsWith('MISSING:'))
      .map(line => line.slice('MISSING:'.length))

    result = {
      installed: missing.length === 0,
      missing,
    }
  }
  catch {
    result = {
      installed: false,
      missing: REQUIRED_PYTHON_RUNTIME_IMPORTS.map(pkg => pkg.id),
    }
  }

  pythonRuntimePackageCache.set(cacheKey, {
    checkedAt: Date.now(),
    result,
  })
  return result
}
