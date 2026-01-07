/* eslint-disable antfu/no-top-level-await */
/* eslint-disable no-console */

import type { VisionTaskAssets } from './tasks'

import fs from 'node:fs/promises'

import { Buffer } from 'node:buffer'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

import { ofetch } from 'ofetch'

import { visionTaskAssets } from './tasks'

const taskSources: Record<keyof VisionTaskAssets, string> = {
  pose: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  hands: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  face: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
}

const MAX_DOWNLOAD_RETRIES = 3
const RETRY_BACKOFF_STEP_MS = 500
const assetsRoot = fileURLToPath(new URL('./assets', import.meta.url))
const wasmSourceDir = fileURLToPath(new URL('../node_modules/@mediapipe/tasks-vision/wasm', import.meta.url))
const wasmOutputDir = fileURLToPath(new URL('./assets/wasm', import.meta.url))
const taskTargets = Object.entries(taskSources).map(([key, source]) => ({
  key: key as keyof VisionTaskAssets,
  source,
  outputPath: fileURLToPath(visionTaskAssets[key as keyof VisionTaskAssets]),
}))

async function isUsableFile(path: string) {
  try {
    const stat = await fs.stat(path)
    return stat.isFile() && stat.size > 0
  }
  catch {
    return false
  }
}

async function downloadAsset(key: string, url: string, outputPath: string) {
  let lastError: unknown
  const tempPath = `${outputPath}.download`

  for (let attempt = 1; attempt <= MAX_DOWNLOAD_RETRIES; attempt++) {
    try {
      console.log(`Downloading MediaPipe vision task asset for ${key} from ${url} (attempt ${attempt}/${MAX_DOWNLOAD_RETRIES})...`)
      const res = await ofetch(url, { responseType: 'arrayBuffer' })
      await fs.writeFile(tempPath, Buffer.from(res))
      await fs.rename(tempPath, outputPath)
      console.log(`MediaPipe vision task asset for ${key} saved to ${outputPath}`)
      return
    }
    catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`Failed to download MediaPipe vision task asset for ${key} (attempt ${attempt}/${MAX_DOWNLOAD_RETRIES}): ${message}`)
      if (attempt < MAX_DOWNLOAD_RETRIES) {
        const backoff = RETRY_BACKOFF_STEP_MS * attempt
        console.log(`Retrying ${key} download in ${backoff}ms...`)
        await delay(backoff)
      }
    }
    finally {
      await fs.rm(tempPath, { force: true })
    }
  }

  throw new Error(`Failed to download MediaPipe vision task asset for ${key} after ${MAX_DOWNLOAD_RETRIES} attempts`, {
    cause: lastError,
  })
}

await fs.mkdir(assetsRoot, { recursive: true })

for (const { key, source, outputPath } of taskTargets) {
  if (await isUsableFile(outputPath)) {
    console.log(`MediaPipe vision task asset for ${key} already exists at ${outputPath}, skipping download.`)
    continue
  }
  await downloadAsset(key, source, outputPath)

  if (!await isUsableFile(outputPath))
    throw new Error(`Failed to ensure MediaPipe vision task asset for ${key}: missing or empty file at ${outputPath}`)
}

await fs.mkdir(wasmOutputDir, { recursive: true })
await fs.cp(wasmSourceDir, wasmOutputDir, { recursive: true, force: true })

const wasmEntries = await fs.readdir(wasmOutputDir)
if (!wasmEntries.length)
  throw new Error(`Failed to ensure MediaPipe WASM assets: ${wasmOutputDir} is empty`)

console.log('All MediaPipe vision task assets are prepared.')
