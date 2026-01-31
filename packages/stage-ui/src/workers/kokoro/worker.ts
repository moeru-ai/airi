/**
 * Kokoro TTS Web Worker Entry Point
 * This file is imported as a Web Worker
 */

import type { GenerateOptions } from 'kokoro-js'

import { KokoroTTS } from 'kokoro-js'

let ttsModel: KokoroTTS | null = null
let currentQuantization: string | null = null
let currentDevice: string | null = null

interface GenerateRequest {
  text: string
  voice: GenerateOptions['voice']
}

async function loadModel(quantization: string, device: string) {
  console.log('[Kokoro Worker] loadModel called with:', { quantization, device, currentQuantization, currentDevice })

  // Check if we already have the correct model loaded
  if (ttsModel && currentQuantization === quantization && currentDevice === device) {
    console.log('[Kokoro Worker] Model already loaded, skipping')
    globalThis.postMessage({
      type: 'loaded',
      voices: ttsModel.voices,
    })
    return
  }

  // Map fp32-webgpu to fp32 for the model
  const modelQuantization = quantization === 'fp32-webgpu' ? 'fp32' : quantization

  ttsModel = await KokoroTTS.from_pretrained(
    'onnx-community/Kokoro-82M-v1.0-ONNX',
    {
      dtype: modelQuantization as 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16',
      device: device as 'wasm' | 'webgpu' | 'cpu',
      progress_callback: (progress) => {
        globalThis.postMessage({
          type: 'progress',
          progress,
        })
      },
    },
  )

  // Store the current settings
  currentQuantization = quantization
  currentDevice = device

  console.log('[Kokoro Worker] Model loaded successfully, voices:', Object.keys(ttsModel.voices))

  globalThis.postMessage({
    type: 'loaded',
    voices: ttsModel.voices,
  })
}

async function generate(request: GenerateRequest) {
  const { text, voice } = request

  if (!ttsModel) {
    globalThis.postMessage({
      status: 'error',
      message: 'Kokoro TTS generation failed: No model loaded.',
    })
    return
  }

  // Generate audio from text
  const result = await ttsModel.generate(text, {
    voice,
  })

  const blob = await result.toBlob()
  const buffer: ArrayBuffer = await blob.arrayBuffer()

  // Send the audio buffer back to the main thread
  // Use transferable to avoid copying the buffer
  const transferList: ArrayBuffer[] = [buffer]
  ;(globalThis as any).postMessage(
    {
      status: 'success',
      buffer,
    },
    transferList,
  )
}

// Listen for messages from the main thread
globalThis.addEventListener('message', async (event) => {
  const { type, data } = event.data

  switch (type) {
    case 'load':
      await loadModel(data.quantization, data.device)
      break

    case 'generate':
      await generate(data as GenerateRequest)
      break

    default:
      console.warn('[Kokoro Worker] Unknown message type:', type)
  }
})
