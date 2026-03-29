/* eslint-disable no-console */
/**
 * Script: Download ALL model weights for the singing pipeline.
 *
 * Required models for a complete inference pipeline:
 *   1. RMVPE        — pitch extraction (F0) for RVC
 *   2. HuBERT Base  — content feature encoder for RVC
 *   3. MelBand-RoFormer — vocal / instrumental separation (checkpoint + config)
 *
 * Models for training new voices:
 *   4. RVC v2 pretrained Generator  (f0G40k.pth)
 *   5. RVC v2 pretrained Discriminator (f0D40k.pth)
 *
 * References:
 *   - https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI
 *   - https://github.com/ZFTurbo/Music-Source-Separation-Training
 *   - https://huggingface.co/lj1995/VoiceConversionWebUI
 *
 * Usage: pnpm -F @proj-airi/singing download-models
 */

import type { Buffer } from 'node:buffer'

import process from 'node:process'

import { createWriteStream, existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { get } from 'node:https'
import { resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'

const MODELS_DIR = resolve(import.meta.dirname ?? __dirname, '..', 'models')

interface ModelEntry {
  name: string
  url: string
  filename: string
  subdir?: string
  sizeHint?: string
}

const MODELS: ModelEntry[] = [
  // ── Pitch extraction ──────────────────────────────────────
  {
    name: 'RMVPE (pitch extraction)',
    url: 'https://hf-mirror.com/lj1995/VoiceConversionWebUI/resolve/main/rmvpe.pt',
    filename: 'rmvpe.pt',
    sizeHint: '~173 MB',
  },

  // ── RVC content encoder ───────────────────────────────────
  {
    name: 'HuBERT Base (RVC content encoder)',
    url: 'https://hf-mirror.com/lj1995/VoiceConversionWebUI/resolve/main/hubert_base.pt',
    filename: 'hubert_base.pt',
    sizeHint: '~181 MB',
  },

  // ── Vocal separation ──────────────────────────────────────
  {
    name: 'MelBand-RoFormer (vocal separation checkpoint)',
    url: 'https://hf-mirror.com/KimberleyJSN/melbandroformer/resolve/main/MelBandRoformer.ckpt',
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

  // ── RVC v2 pretrained (for voice training) ────────────────
  {
    name: 'RVC v2 pretrained Generator (f0, 40kHz)',
    url: 'https://hf-mirror.com/lj1995/VoiceConversionWebUI/resolve/main/pretrained_v2/f0G40k.pth',
    filename: 'f0G40k.pth',
    subdir: 'pretrained_v2',
    sizeHint: '~70 MB',
  },
  {
    name: 'RVC v2 pretrained Discriminator (f0, 40kHz)',
    url: 'https://hf-mirror.com/lj1995/VoiceConversionWebUI/resolve/main/pretrained_v2/f0D40k.pth',
    filename: 'f0D40k.pth',
    subdir: 'pretrained_v2',
    sizeHint: '~136 MB',
  },
]

async function downloadFile(url: string, dest: string, label: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const follow = (u: string, redirects = 0) => {
      if (redirects > 8) {
        reject(new Error('Too many redirects'))
        return
      }
      get(u, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          follow(res.headers.location, redirects + 1)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${u}`))
          return
        }

        const totalBytes = Number.parseInt(res.headers['content-length'] ?? '0', 10)
        let downloaded = 0
        const startTime = Date.now()
        const file = createWriteStream(dest)

        res.on('data', (chunk: Buffer) => {
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
        })

        pipeline(res, file).then(() => {
          process.stdout.write('\n')
          resolvePromise()
        }).catch(reject)
      }).on('error', reject)
    }
    follow(url)
  })
}

async function downloadModels(): Promise<void> {
  const forceFlag = process.argv.includes('--force')

  console.log(`\n  Singing Module — Model Download`)
  console.log(`  Target: ${MODELS_DIR}`)
  console.log(`  Force re-download: ${forceFlag}`)
  console.log(`  Models to download: ${MODELS.length}\n`)

  let downloaded = 0
  let skipped = 0

  for (const model of MODELS) {
    const dir = model.subdir ? resolve(MODELS_DIR, model.subdir) : MODELS_DIR
    await mkdir(dir, { recursive: true })
    const dest = resolve(dir, model.filename)

    if (!forceFlag && existsSync(dest)) {
      console.log(`  ✓ ${model.name}: already exists`)
      skipped++
      continue
    }

    console.log(`  ↓ ${model.name} (${model.sizeHint ?? 'unknown size'})`)
    try {
      await downloadFile(model.url, dest, model.name)
      console.log(`  ✓ ${model.name}: OK`)
      downloaded++
    }
    catch (err) {
      console.error(`  ✗ ${model.name}: FAILED`, err)
      process.exit(1)
    }
  }

  console.log(`\n  Summary: ${downloaded} downloaded, ${skipped} already existed.`)
  console.log(`  All ${MODELS.length} models ready.\n`)
}

export { type ModelEntry, MODELS }

downloadModels().catch(console.error)
