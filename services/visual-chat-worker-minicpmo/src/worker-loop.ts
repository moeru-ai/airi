import type { Buffer } from 'node:buffer'

import type { DecodedChunk, DecodeResult, InferenceBackend, OllamaConfig } from '@proj-airi/visual-chat-model-minicpmo'
import type { InferenceMetrics } from '@proj-airi/visual-chat-observability'

import {
  createBackend,
  decodedChunksToDecodeResult,
} from '@proj-airi/visual-chat-model-minicpmo'
import { createInferenceMetrics, createWorkerLogger, recordLatency } from '@proj-airi/visual-chat-observability'
import { INFERENCE_CYCLE_INTERVAL_MS, PREFILL_CNT_START } from '@proj-airi/visual-chat-protocol'

const log = createWorkerLogger()

export type InferenceCallback = (result: DecodeResult) => void | Promise<void>

export interface WorkerState {
  status: 'idle' | 'initializing' | 'running' | 'paused' | 'error'
  currentCnt: number
  sessionId: string | null
  metrics: InferenceMetrics
}

export class InferenceWorkerLoop {
  private backend: InferenceBackend & {
    writeTempWav: (data: Buffer, name: string) => string
    writeTempImage: (data: Buffer, name: string) => string
  }

  private intervalHandle: ReturnType<typeof setInterval> | null = null
  private state: WorkerState
  private onResult: InferenceCallback | null = null
  private processing = false
  private pendingPrefill: { wavPath: string, imagePath?: string } | null = null

  constructor(config: OllamaConfig) {
    this.backend = createBackend(config) as any
    this.state = {
      status: 'idle',
      currentCnt: PREFILL_CNT_START,
      sessionId: null,
      metrics: createInferenceMetrics(),
    }
  }

  async start(systemPrompt: string, onResult: InferenceCallback): Promise<void> {
    this.onResult = onResult
    this.state.status = 'initializing'

    await this.backend.spawn()
    await this.backend.init(systemPrompt)

    this.state.status = 'running'
    this.state.currentCnt = PREFILL_CNT_START

    this.intervalHandle = setInterval(() => {
      this.tick().catch((err) => {
        log.withTag('loop').error(`Tick error: ${err}`)
      })
    }, INFERENCE_CYCLE_INTERVAL_MS)

    log.withTag('loop').log('Worker loop started')
  }

  async stop(): Promise<void> {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle)
      this.intervalHandle = null
    }
    await this.backend.shutdown()
    this.state.status = 'idle'
    log.withTag('loop').log('Worker loop stopped')
  }

  submitMedia(wavData: Buffer, imageData?: Buffer): void {
    const wavPath = this.backend.writeTempWav(wavData, `input_${Date.now()}.wav`)
    let imagePath: string | undefined

    if (imageData)
      imagePath = this.backend.writeTempImage(imageData, `input_${Date.now()}.jpg`)

    this.pendingPrefill = {
      wavPath,
      imagePath,
    }
  }

  private async tick(): Promise<void> {
    if (this.processing || this.state.status !== 'running')
      return

    if (!this.pendingPrefill)
      return

    this.processing = true

    try {
      const payload = this.pendingPrefill
      this.pendingPrefill = null

      const prefillStart = Date.now()
      await this.backend.prefill(payload.wavPath, payload.imagePath)
      const prefillLatency = Date.now() - prefillStart
      recordLatency(this.state.metrics, prefillLatency, true, 'prefill')
      this.state.currentCnt++

      const decodeStart = Date.now()
      const chunks: DecodedChunk[] = []
      for await (const chunk of this.backend.decode())
        chunks.push(chunk)

      const result = decodedChunksToDecodeResult(chunks)
      const decodeLatency = Date.now() - decodeStart
      recordLatency(this.state.metrics, decodeLatency, true, 'decode')

      if (result.listenDetected) {
        log.withTag('loop').log('Listen signal detected — model wants to hear more input')
      }

      if (this.onResult)
        await this.onResult(result)
    }
    catch (err) {
      recordLatency(this.state.metrics, 0, false)
      log.withTag('loop').error(`Inference error: ${err}`)
    }
    finally {
      this.processing = false
    }
  }

  getState(): WorkerState {
    return { ...this.state }
  }
}
