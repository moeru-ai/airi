import type { KeywordEntry, KeywordSpotter, KWSModelPack } from '@sherpaw/kws'

import KwsWorker from '@sherpaw/kws/worker?worker'

import { createKeywordSpotter } from '@sherpaw/kws'

/** Owns the microphone graph and one Sherpaw Worker while Wake Word mode is active. */
export class KeywordListener {
  private context?: AudioContext
  private source?: MediaStreamAudioSourceNode
  private worklet?: AudioWorkletNode
  private silentOutput?: GainNode
  private spotter?: KeywordSpotter
  private keywords: KeywordEntry[] = []
  private paused = false
  private generation = 0
  private pendingAudio: Float32Array[] = []
  private processing = false
  private pcmBatch = new Float32Array(1600)
  private pcmBatchOffset = 0

  constructor(
    private readonly model: KWSModelPack,
    private readonly workletUrl: string,
    private readonly onWake: (label: string) => void,
    private readonly onError: (error: unknown) => void,
  ) {}

  /** Starts the 16 kHz graph after at least one valid keyword is available. */
  async start(stream: MediaStream, keywords: readonly KeywordEntry[]): Promise<void> {
    this.stop()
    if (keywords.length === 0)
      return

    const generation = this.generation
    this.keywords = [...keywords]
    try {
      const spotter = await createKeywordSpotter({ model: this.model, keywords }, { worker: new KwsWorker() })
      if (generation !== this.generation)
        return spotter.dispose()
      this.spotter = spotter

      const context = new AudioContext({ sampleRate: 16_000, latencyHint: 'interactive' })
      this.context = context
      await context.audioWorklet.addModule(this.workletUrl)
      if (generation !== this.generation)
        return

      this.worklet = new AudioWorkletNode(context, 'vad-audio-worklet-processor')
      this.worklet.port.onmessage = (event: MessageEvent<{ buffer: Float32Array }>) => {
        if (generation !== this.generation || this.paused || !event.data.buffer)
          return

        // Sherpaw accepts finite, normalized PCM. Collect 100 ms before each Worker call.
        for (const value of event.data.buffer) {
          this.pcmBatch[this.pcmBatchOffset++] = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0
          if (this.pcmBatchOffset !== this.pcmBatch.length)
            continue

          this.pendingAudio.push(this.pcmBatch)
          this.pcmBatch = new Float32Array(1600)
          this.pcmBatchOffset = 0
          if (this.pendingAudio.length > 10) {
            // A decoder more than one second behind must not wake a character from stale audio.
            this.pendingAudio = []
            void this.spotter?.reset().catch((error) => {
              if (generation === this.generation)
                this.onError(error)
            })
            return
          }
          void this.processAudio(generation)
        }
      }
      this.source = context.createMediaStreamSource(stream)
      this.silentOutput = context.createGain()
      this.silentOutput.gain.value = 0
      this.source.connect(this.worklet)
      this.worklet.connect(this.silentOutput)
      this.silentOutput.connect(context.destination)
      if (context.state === 'suspended')
        await context.resume()
    }
    catch (error) {
      this.stop()
      throw error
    }
  }

  private async processAudio(generation: number): Promise<void> {
    if (this.processing)
      return
    this.processing = true
    try {
      while (generation === this.generation && !this.paused && this.pendingAudio.length > 0) {
        const samples = this.pendingAudio.shift()
        if (!samples || !this.spotter)
          break
        const hits = await this.spotter.processAudio(samples, this.context?.sampleRate ?? 16_000)
        if (generation !== this.generation || this.paused)
          break
        const hit = hits[0]
        if (hit) {
          await this.pause()
          this.onWake(hit.label)
          break
        }
      }
    }
    catch (error) {
      if (generation === this.generation)
        this.onError(error)
    }
    finally {
      this.processing = false
    }
  }

  /** Replaces the active character vocabulary without reopening the microphone. */
  async setKeywords(keywords: readonly KeywordEntry[]): Promise<void> {
    this.keywords = [...keywords]
    await this.spotter?.setKeywords(this.paused ? [] : keywords)
  }

  /** Holds detection while one wake-triggered utterance is recorded. */
  async pause(): Promise<void> {
    this.paused = true
    this.pendingAudio = []
    this.pcmBatchOffset = 0
    await this.spotter?.setKeywords([])
  }

  /** Returns to wake listening after the utterance ends or is canceled. */
  async resume(): Promise<void> {
    if (!this.paused)
      return
    this.paused = false
    await this.spotter?.setKeywords(this.keywords)
  }

  /** Releases the Worker and audio graph; the caller still owns the microphone stream. */
  stop(): void {
    this.generation++
    this.pendingAudio = []
    this.pcmBatchOffset = 0
    this.paused = false
    this.spotter?.dispose()
    this.spotter = undefined
    this.source?.disconnect()
    this.worklet?.disconnect()
    this.silentOutput?.disconnect()
    this.source = undefined
    this.worklet = undefined
    this.silentOutput = undefined
    if (this.context && this.context.state !== 'closed')
      void this.context.close()
    this.context = undefined
  }
}
