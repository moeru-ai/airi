/**
 * Kokoro TTS Web Worker Entry Point
 * This file is imported as a Web Worker
 */

import type { KokoroQuantization } from './constants'

import { KokoroTTS } from 'kokoro-js'

let ttsModel: any = null
let isLoading = false
let currentQuantization: string | null = null
let currentDevice: string | null = null

interface GenerateRequest {
  text: string
  voice: string
  quantization: KokoroQuantization
  device: 'wasm' | 'cpu' | 'webgpu'
  requestId: number
}

async function loadModel(quantization: string, device: string) {
  // Check if we already have the correct model loaded
  if (ttsModel && currentQuantization === quantization && currentDevice === device && !isLoading) {
    return
  }

  // If we have a different model loaded, unload it first
  if (ttsModel && (currentQuantization !== quantization || currentDevice !== device)) {
    ttsModel = null
    currentQuantization = null
    currentDevice = null
  }

  if (isLoading) {
    return
  }

  isLoading = true

  try {
    globalThis.postMessage({
      status: 'loading',
      message: 'Loading Kokoro TTS model...',
    })

    // Map fp32-webgpu to fp32 for the model
    const modelQuantization = quantization === 'fp32-webgpu' ? 'fp32' : quantization

    ttsModel = await KokoroTTS.from_pretrained(
      'onnx-community/Kokoro-82M-v1.0-ONNX',
      {
        dtype: modelQuantization as any,
        device: device as any,
      },
    )

    // Store the current settings
    currentQuantization = quantization
    currentDevice = device

    globalThis.postMessage({
      status: 'ready',
      message: 'Kokoro TTS model loaded',
    })
  }
  catch (error) {
    globalThis.postMessage({
      status: 'error',
      message: `Failed to load Kokoro TTS model: ${error}`,
    })
  }
  finally {
    isLoading = false
  }
}

async function generate(request: GenerateRequest) {
  const { text, voice, quantization, device, requestId } = request

  try {
    // Ensure model is loaded with the correct settings
    if (!ttsModel || currentQuantization !== quantization || currentDevice !== device) {
      await loadModel(quantization, device)
    }

    globalThis.postMessage({
      status: 'generating',
      message: 'Generating audio...',
    })

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
        status: 'complete',
        buffer,
        requestId,
      },
      transferList,
    )
  }
  catch (error) {
    globalThis.postMessage({
      status: 'error',
      message: `Kokoro TTS generation failed: ${error}`,
      requestId,
    })
  }
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
