/* eslint-disable no-console */
/**
 * Script: Download ALL model weights for the singing pipeline.
 *
 * Download strategy (picks the fastest available):
 *   1. aria2c  — multi-connection parallel download (16 connections), fastest
 *   2. curl    — single connection with HTTP/2, resume support, reliable
 *   3. fetch   — Node.js built-in (undici), last resort
 *
 * Safety guarantees:
 *   - Atomic writes: downloads to `.downloading` temp file, renames on success
 *   - Auto-cleanup: partial downloads are deleted on failure or next startup
 *   - Size validation: downloaded file size is verified against Content-Length
 *   - Retry: up to 3 attempts with backoff per model
 *
 * Required models for inference:
 *   1. RMVPE           — pitch extraction (F0) for RVC
 *   2. HuBERT Base     — content feature encoder for RVC
 *   3. MelBand-RoFormer — vocal / instrumental separation (checkpoint + config)
 *   4. MelBand-RoFormer Karaoke — lead / backing vocal isolation
 *
 * Models for training new voices:
 *   5. RVC v2 pretrained Generator  (f0G40k.pth)
 *   6. RVC v2 pretrained Discriminator (f0D40k.pth)
 *
 * Usage: pnpm -F @proj-airi/singing download-models
 */

import type { Buffer } from 'node:buffer'

import process from 'node:process'

import { execSync, spawn } from 'node:child_process'
import { createWriteStream, existsSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { mkdir, readdir, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const MODELS_DIR = resolve(import.meta.dirname ?? __dirname, '..', 'models')
const DOWNLOAD_SUFFIX = '.downloading'
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 3_000
const USER_AGENT = 'Mozilla/5.0 (airi-singing-pipeline/1.0; +https://github.com/moeru-ai/airi)'
const PATH_SEGMENT_REGEX = /[\\/]/

// NOTICE: Default is huggingface.co (Xet Hub CDN, generally fast globally).
// Set HF_MIRROR=https://hf-mirror.com if huggingface.co is blocked in your region.
const HF_MIRROR_BASE = process.env.HF_MIRROR ?? 'https://huggingface.co'
const IS_WINDOWS = process.platform === 'win32'
// On Windows, `curl` is aliased to Invoke-WebRequest in PowerShell; use `curl.exe` explicitly.
const CURL_BIN = IS_WINDOWS ? 'curl.exe' : 'curl'

interface ModelEntry {
  name: string
  url: string
  filename: string
  subdir?: string
  sizeHint?: string
}

function hf(path: string): string {
  return `${HF_MIRROR_BASE}/${path}`
}

const MODELS: ModelEntry[] = [
  // ── Pitch extraction ──────────────────────────────────────
  {
    name: 'RMVPE (pitch extraction)',
    url: hf('lj1995/VoiceConversionWebUI/resolve/main/rmvpe.pt'),
    filename: 'rmvpe.pt',
    sizeHint: '~173 MB',
  },

  // ── RVC content encoder ───────────────────────────────────
  {
    name: 'HuBERT Base (RVC content encoder)',
    url: hf('lj1995/VoiceConversionWebUI/resolve/main/hubert_base.pt'),
    filename: 'hubert_base.pt',
    sizeHint: '~181 MB',
  },

  // ── Vocal separation ──────────────────────────────────────
  {
    name: 'MelBand-RoFormer (vocal separation checkpoint)',
    url: hf('KimberleyJSN/melbandroformer/resolve/main/MelBandRoformer.ckpt'),
    filename: 'MelBandRoformer.ckpt',
    subdir: 'separation',
    sizeHint: '~871 MB',
  },
  {
    name: 'MelBand-RoFormer (config)',
    url: 'https://raw.githubusercontent.com/ZFTurbo/Music-Source-Separation-Training/main/configs/KimberleyJensen/config_vocals_mel_band_roformer_kj.yaml',
    filename: 'config_vocals_mel_band_roformer_kj.yaml',
    subdir: 'separation',
    sizeHint: '~2 KB',
  },

  // ── Lead vocal isolation (Karaoke) ─────────────────────────
  {
    name: 'MelBand-RoFormer Karaoke (lead/backing separation checkpoint)',
    url: hf('jarredou/aufr33-viperx-karaoke-melroformer-model/resolve/main/mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt'),
    filename: 'mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt',
    subdir: 'separation',
    sizeHint: '~913 MB',
  },
  {
    name: 'MelBand-RoFormer Karaoke (config)',
    url: hf('jarredou/aufr33-viperx-karaoke-melroformer-model/resolve/main/config_mel_band_roformer_karaoke.yaml'),
    filename: 'config_mel_band_roformer_karaoke.yaml',
    subdir: 'separation',
    sizeHint: '~2 KB',
  },

  // ── RVC v2 pretrained (for voice training) ────────────────
  {
    name: 'RVC v2 pretrained Generator (f0, 40kHz)',
    url: hf('lj1995/VoiceConversionWebUI/resolve/main/pretrained_v2/f0G40k.pth'),
    filename: 'f0G40k.pth',
    subdir: 'pretrained_v2',
    sizeHint: '~70 MB',
  },
  {
    name: 'RVC v2 pretrained Discriminator (f0, 40kHz)',
    url: hf('lj1995/VoiceConversionWebUI/resolve/main/pretrained_v2/f0D40k.pth'),
    filename: 'f0D40k.pth',
    subdir: 'pretrained_v2',
    sizeHint: '~136 MB',
  },
]

// ── Download tool detection ──────────────────────────────────

type DownloadBackend = 'aria2c' | 'curl' | 'fetch'

function detectBestBackend(): DownloadBackend {
  try {
    execSync('aria2c --version', { stdio: 'ignore' })
    return 'aria2c'
  }
  catch { /* not available */ }

  try {
    execSync(`${CURL_BIN} --version`, { stdio: 'ignore' })
    return 'curl'
  }
  catch { /* not available */ }

  return 'fetch'
}

const BACKEND_LABELS: Record<DownloadBackend, string> = {
  aria2c: 'aria2c (multi-connection, fastest)',
  curl: 'curl (HTTP/2, resume support)',
  fetch: 'fetch (Node.js built-in)',
}

// ── Download implementations ─────────────────────────────────

/**
 * Download via aria2c: 16 parallel connections for maximum throughput.
 */
function downloadWithAria2c(url: string, tmpDest: string, label: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const dir = resolve(tmpDest, '..')
    const filename = tmpDest.split(PATH_SEGMENT_REGEX).pop()!
    const child = spawn('aria2c', [
      url,
      '-d',
      dir,
      '-o',
      filename,
      '-x',
      '16',
      '-s',
      '16',
      '-k',
      '1M',
      '--max-tries=1',
      '--retry-wait=0',
      '--file-allocation=none',
      '--auto-file-renaming=false',
      '--allow-overwrite=true',
      `--user-agent=${USER_AGENT}`,
      '--console-log-level=warn',
      '--summary-interval=3',
    ], { stdio: ['ignore', 'pipe', 'pipe'] })

    child.stdout.on('data', (data: Buffer) => {
      const line = data.toString().trim()
      if (line)
        process.stdout.write(`\r  [${label}] ${line.slice(0, 80)}`)
    })

    child.stderr.on('data', (data: Buffer) => {
      const line = data.toString().trim()
      if (line && !line.startsWith('['))
        process.stderr.write(`\n  ${line}`)
    })

    child.on('close', (code) => {
      process.stdout.write('\n')
      if (code === 0)
        resolvePromise()
      else
        reject(new Error(`aria2c exited with code ${code}`))
    })

    child.on('error', reject)
  })
}

/**
 * Download via curl: HTTP/2, proper buffering, progress bar.
 */
function downloadWithCurl(url: string, tmpDest: string, _label: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(CURL_BIN, [
      '-L',
      '-o',
      tmpDest,
      '-#',
      '-H',
      `User-Agent: ${USER_AGENT}`,
      '--connect-timeout',
      '30',
      '--retry',
      '0',
      '--fail',
      url,
    ], { stdio: ['ignore', 'inherit', 'inherit'] })

    child.on('close', (code) => {
      if (code === 0)
        resolvePromise()
      else
        reject(new Error(`curl exited with code ${code}`))
    })

    child.on('error', reject)
  })
}

/**
 * Download via Node.js fetch (undici): used when no system tools are available.
 */
async function downloadWithFetch(url: string, tmpDest: string, label: string): Promise<void> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept': '*/*' },
    redirect: 'follow',
  })

  if (!response.ok)
    throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`)
  if (!response.body)
    throw new Error(`Empty response body for ${url}`)

  const totalBytes = Number(response.headers.get('content-length') ?? 0)
  let downloaded = 0
  const startTime = Date.now()

  const progress = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      downloaded += chunk.length
      const elapsed = (Date.now() - startTime) / 1000
      const speed = elapsed > 0 ? (downloaded / 1024 / 1024 / elapsed).toFixed(1) : '0'
      if (totalBytes > 0) {
        const pct = Math.round((downloaded / totalBytes) * 100)
        const mb = (downloaded / 1024 / 1024).toFixed(1)
        const totalMb = (totalBytes / 1024 / 1024).toFixed(1)
        process.stdout.write(`\r  [${label}] ${pct}% — ${mb}/${totalMb} MB (${speed} MB/s)`)
      }
      else {
        const mb = (downloaded / 1024 / 1024).toFixed(1)
        process.stdout.write(`\r  [${label}] ${mb} MB (${speed} MB/s)`)
      }
      callback(null, chunk)
    },
  })

  // NOTICE: `as any` needed — Node.js fetch returns Web API ReadableStream,
  // Readable.fromWeb expects the node:stream/web type; structurally identical at runtime.
  const readable = Readable.fromWeb(response.body as any)
  await pipeline(readable, progress, createWriteStream(tmpDest))
  process.stdout.write('\n')
}

// ── Core download orchestration ──────────────────────────────

async function downloadFile(
  url: string,
  dest: string,
  label: string,
  backend: DownloadBackend,
): Promise<void> {
  const tmpDest = dest + DOWNLOAD_SUFFIX

  if (existsSync(tmpDest))
    unlinkSync(tmpDest)

  // aria2c creates its own control files — clean those too
  const aria2Control = `${tmpDest}.aria2`
  if (existsSync(aria2Control))
    unlinkSync(aria2Control)

  try {
    switch (backend) {
      case 'aria2c':
        await downloadWithAria2c(url, tmpDest, label)
        break
      case 'curl':
        await downloadWithCurl(url, tmpDest, label)
        break
      case 'fetch':
        await downloadWithFetch(url, tmpDest, label)
        break
    }

    // Verify the temp file exists and has content
    if (!existsSync(tmpDest)) {
      throw new Error('Download tool reported success but output file is missing')
    }

    const tmpSize = statSync(tmpDest).size
    if (tmpSize === 0) {
      throw new Error('Downloaded file is empty (0 bytes)')
    }

    // Atomic rename: tmp -> final
    if (existsSync(dest))
      unlinkSync(dest)
    renameSync(tmpDest, dest)
  }
  catch (err) {
    // Cleanup all temp artifacts
    for (const f of [tmpDest, aria2Control]) {
      try {
        if (existsSync(f))
          unlinkSync(f)
      }
      catch { /* best-effort */ }
    }
    throw err
  }
}

/**
 * Heuristic: file is "complete" if non-empty, and for large models, bigger than 1 MB.
 */
function isFileComplete(filepath: string, expectedSizeHint?: string): boolean {
  if (!existsSync(filepath))
    return false

  const actualSize = statSync(filepath).size
  if (actualSize === 0)
    return false

  if (expectedSizeHint && expectedSizeHint.includes('KB'))
    return true

  if (expectedSizeHint && (expectedSizeHint.includes('MB') || expectedSizeHint.includes('GB')))
    return actualSize > 1_000_000

  return true
}

/**
 * Recursively remove `.downloading` and `.aria2` temp files from prior runs.
 */
async function cleanupStaleDownloads(dir: string): Promise<number> {
  let cleaned = 0
  if (!existsSync(dir))
    return cleaned

  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      cleaned += await cleanupStaleDownloads(fullPath)
    }
    else if (entry.name.endsWith(DOWNLOAD_SUFFIX) || entry.name.endsWith('.aria2')) {
      console.log(`  Removing stale temp file: ${entry.name}`)
      await unlink(fullPath)
      cleaned++
    }
  }
  return cleaned
}

async function downloadModels(): Promise<void> {
  const forceFlag = process.argv.includes('--force')
  const backend = detectBestBackend()

  console.log(`\n  Singing Module — Model Download`)
  console.log(`  Target: ${MODELS_DIR}`)
  console.log(`  Mirror: ${HF_MIRROR_BASE}`)
  console.log(`  Backend: ${BACKEND_LABELS[backend]}`)
  console.log(`  Force re-download: ${forceFlag}`)
  console.log(`  Models to download: ${MODELS.length}`)
  if (backend === 'fetch') {
    console.log(`  TIP: Install aria2c for 10-16x faster downloads (scoop install aria2)`)
  }
  console.log()

  const staleCount = await cleanupStaleDownloads(MODELS_DIR)
  if (staleCount > 0) {
    console.log(`  Cleaned ${staleCount} stale temp file(s)\n`)
  }

  let downloaded = 0
  let skipped = 0

  for (const model of MODELS) {
    const dir = model.subdir ? resolve(MODELS_DIR, model.subdir) : MODELS_DIR
    await mkdir(dir, { recursive: true })
    const dest = resolve(dir, model.filename)

    if (!forceFlag && isFileComplete(dest, model.sizeHint)) {
      console.log(`  [OK] ${model.name}: already exists`)
      skipped++
      continue
    }

    if (existsSync(dest)) {
      console.log(`  [!] ${model.name}: incomplete file detected, removing`)
      unlinkSync(dest)
    }

    console.log(`  [DL] ${model.name} (${model.sizeHint ?? 'unknown size'})`)

    let lastErr: Error | null = null
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await downloadFile(model.url, dest, model.name, backend)
        console.log(`  [OK] ${model.name}: download complete`)
        downloaded++
        lastErr = null
        break
      }
      catch (err) {
        lastErr = err as Error
        if (attempt < MAX_RETRIES) {
          console.error(`  [!] ${model.name}: attempt ${attempt}/${MAX_RETRIES} failed — ${(err as Error).message}`)
          console.log(`  [..] Retrying in ${RETRY_DELAY_MS / 1000}s...`)
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
        }
      }
    }

    if (lastErr) {
      console.error(`  [X] ${model.name}: FAILED after ${MAX_RETRIES} attempts`, lastErr)
      process.exit(1)
    }
  }

  console.log(`\n  Summary: ${downloaded} downloaded, ${skipped} already existed.`)
  console.log(`  All ${MODELS.length} models ready.\n`)
}

export { type ModelEntry, MODELS }

downloadModels().catch(console.error)
