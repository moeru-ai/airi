import process from 'node:process'

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/**
 * Resolves runtime environment paths and binary locations.
 *
 * Storage layout under tempDir:
 *   <tempDir>/
 *     uploads/           ← temporary upload files (cleaned after pipeline)
 *     jobs/              ← pipeline job artifacts (one subdir per job)
 *       <job-uuid>/
 *         01_prep/source.wav
 *         02_separate/vocals.wav, instrumental.wav
 *         03_pitch/f0.npy
 *         04_convert/converted_vocals.wav
 *         05_mix/final_cover.wav
 *         manifest.json
 *
 * Model weights under modelsDir:
 *   <modelsDir>/
 *     rmvpe.pt                    ← pitch extraction (auto-downloaded)
 *     hubert_base.pt              ← content encoder for RVC (auto-downloaded)
 *     separation/
 *       MelBandRoformer.ckpt      ← vocal separation weights (auto-downloaded)
 *       config_vocals_mel_band_roformer_kj.yaml
 *       mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt ← lead isolation
 *       config_mel_band_roformer_karaoke.yaml
 *     pretrained_v2/
 *       f0G40k.pth                ← RVC training base generator
 *       f0D40k.pth                ← RVC training base discriminator
 *     voice_models/               ← user-trained voice models
 *       <voiceId>/
 *         <voiceId>.pth           ← RVC model weights
 *         <voiceId>.index         ← FAISS retrieval index
 *         voice_profile.json      ← speaker embedding centroid, F0 stats
 *         validation_report.json  ← 4-axis evaluation report card
 *         meta.json               ← training metadata
 */
export interface RuntimeEnv {
  ffmpegPath: string
  pythonPath: string
  workerModulePath: string
  pythonSrcDir: string
  modelsDir: string
  voiceModelsDir: string
  tempDir: string
}

/**
 * Walk up from startDir until a directory containing package.json is found.
 * Works correctly both in source (src/adapters/runtime/) and compiled (dist/) contexts.
 */
function findPackageRoot(startDir: string): string {
  let dir = startDir
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'package.json')))
      return dir
    const parent = dirname(dir)
    if (parent === dir)
      break
    dir = parent
  }
  return startDir
}

/**
 * Resolve the Python interpreter path, preferring the local venv if it exists.
 */
function resolveVenvPython(packageRoot: string): string {
  const venvPython = process.platform === 'win32'
    ? resolve(packageRoot, 'python', '.venv', 'Scripts', 'python.exe')
    : resolve(packageRoot, 'python', '.venv', 'bin', 'python')

  if (existsSync(venvPython))
    return venvPython

  const systemCandidates = process.platform === 'win32'
    ? ['python']
    : ['python3', 'python']

  for (const candidate of systemCandidates) {
    const result = spawnSync(candidate, ['--version'], {
      stdio: 'ignore',
      shell: false,
      windowsHide: true,
    })
    if (!result.error && result.status === 0)
      return candidate
  }

  return process.platform === 'win32' ? 'python' : 'python3'
}

/**
 * Resolve the runtime environment from environment variables or defaults.
 */
export function resolveRuntimeEnv(): RuntimeEnv {
  const packageRoot = findPackageRoot(import.meta.dirname ?? __dirname)

  const modelsDir = process.env.AIRI_SINGING_MODELS_DIR
    ?? resolve(packageRoot, 'models')

  return {
    ffmpegPath: process.env.AIRI_SINGING_FFMPEG_PATH ?? 'ffmpeg',
    pythonPath: process.env.AIRI_SINGING_PYTHON_PATH
      ?? resolveVenvPython(packageRoot),
    workerModulePath: process.env.AIRI_SINGING_WORKER_MODULE
      ?? resolve(packageRoot, 'python', 'src', 'airi_singing_worker'),
    pythonSrcDir: process.env.AIRI_SINGING_PYTHON_SRC
      ?? resolve(packageRoot, 'python', 'src'),
    modelsDir,
    voiceModelsDir: resolve(modelsDir, 'voice_models'),
    tempDir: process.env.AIRI_SINGING_TEMP_DIR
      ?? resolve(packageRoot, '.singing-tmp'),
  }
}
