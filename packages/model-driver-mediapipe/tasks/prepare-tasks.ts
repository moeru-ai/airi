/* eslint-disable antfu/no-top-level-await */
/* eslint-disable no-console */

import type { VisionTaskAssets } from './tasks'

import fs from 'node:fs/promises'

import { Buffer } from 'node:buffer'
import { fileURLToPath } from 'node:url'

import { ofetch } from 'ofetch'

import { visionTaskAssets } from './tasks'

const taskSources: Record<keyof VisionTaskAssets, string> = {
  pose: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  hands: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  face: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
}

await fs.mkdir(fileURLToPath(new URL('./assets', import.meta.url)), { recursive: true })

await Promise.all(Object.entries(taskSources).map(
  async ([key, url]) => {
    console.log(`Downloading MediaPipe vision task asset for ${key} from ${url}...`)
    const res = await ofetch(url, { responseType: 'arrayBuffer' })
    const outputPath = fileURLToPath(visionTaskAssets[key as keyof VisionTaskAssets])
    await fs.writeFile(outputPath, Buffer.from(res))
    console.log(`MediaPipe vision task asset for ${key} saved to ${outputPath}`)
  },
))

const wasmSourceDir = fileURLToPath(new URL('../node_modules/@mediapipe/tasks-vision/wasm', import.meta.url))
const wasmOutputDir = fileURLToPath(new URL('./assets/wasm', import.meta.url))
await fs.mkdir(wasmOutputDir, { recursive: true })
await fs.cp(wasmSourceDir, wasmOutputDir, { recursive: true, force: true })

await Promise.all(Object.entries(visionTaskAssets).map(
  async ([key, url]) => {
    const path = fileURLToPath(url)
    try {
      await fs.access(path, fs.constants.R_OK)
    }
    catch (err) {
      throw new Error(`Failed to ensure MediaPipe vision task asset for ${key}: ${err}`)
    }
    const stat = await fs.stat(path)
    if (!stat.isFile()) {
      throw new Error(`Failed to ensure MediaPipe vision task asset for ${key}: not a file: ${path}`)
    }
  },
))

const wasmEntries = await fs.readdir(wasmOutputDir)
if (!wasmEntries.length)
  throw new Error(`Failed to ensure MediaPipe WASM assets: ${wasmOutputDir} is empty`)

console.log('All MediaPipe vision task assets are prepared.')
