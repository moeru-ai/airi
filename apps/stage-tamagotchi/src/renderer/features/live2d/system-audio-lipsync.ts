import type { SerializableDesktopCapturerSource } from '@proj-airi/electron-screen-capture'
import type { Live2DLipSync } from '@proj-airi/model-driver-lipsync'
import type { Profile } from '@proj-airi/model-driver-lipsync/shared/wlipsync'
import type {
  SystemAudioLipSyncCallbacks,
  SystemAudioLipSyncDriver,
  SystemAudioLipSyncOptions,
  SystemAudioLipSyncOutput,
} from '@proj-airi/stage-ui/stores/system-audio-lipsync'

import { setupElectronScreenCapture } from '@proj-airi/electron-screen-capture/renderer'
import { getElectronEventaContext } from '@proj-airi/electron-vueuse'
import { createLive2DLipSync } from '@proj-airi/model-driver-lipsync'
import { wlipsyncProfile } from '@proj-airi/model-driver-lipsync/shared/wlipsync'
import { clamp } from 'es-toolkit'

const inputAnalyserFFTSize = 1024

/** Electron adapter that connects renderer-local system audio to Live2D lipsync. */
export class Live2DSystemAudioLipSyncDriver implements SystemAudioLipSyncDriver {
  private readonly screenCapture = setupElectronScreenCapture(getElectronEventaContext())
  private generation = 0
  private stream: MediaStream | undefined
  private pendingStart: Promise<void> | undefined
  private processor: Live2DLipSyncProcessor | undefined
  private callbacks: SystemAudioLipSyncCallbacks | undefined

  async start(options: SystemAudioLipSyncOptions, callbacks: SystemAudioLipSyncCallbacks): Promise<void> {
    if (this.stream) {
      this.callbacks = callbacks
      this.updateOptions(options)
      return
    }
    if (this.pendingStart) {
      await this.pendingStart
      if (!this.stream)
        await this.start(options, callbacks)
      return
    }

    this.callbacks = callbacks
    const generation = ++this.generation
    const processor = new Live2DLipSyncProcessor(output => this.callbacks?.onOutput(output))
    this.processor = processor
    processor.updateOptions(options)
    this.pendingStart = this.screenCapture.selectWithSource(
      (sources: SerializableDesktopCapturerSource[]) => {
        if (sources.length === 0)
          throw new Error('No screen source available')
        return sources[0].id
      },
      () => navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }),
      { sourcesOptions: { types: ['screen'] } },
    )
      .then(async (stream) => {
        stream.getVideoTracks().forEach((track) => {
          track.stop()
          stream.removeTrack(track)
        })
        if (stream.getAudioTracks().length === 0) {
          stream.getTracks().forEach(track => track.stop())
          throw new Error('No audio track available in the system audio stream')
        }

        if (generation !== this.generation) {
          stream.getTracks().forEach(track => track.stop())
          return
        }

        try {
          await processor.start(stream)
          if (generation !== this.generation) {
            processor.stop()
            stream.getTracks().forEach(track => track.stop())
            return
          }
          this.stream = stream
          stream.getAudioTracks().forEach((track) => {
            track.addEventListener('ended', () => {
              if (this.stream !== stream)
                return
              if (stream.getAudioTracks().every(audioTrack => audioTrack.readyState === 'ended'))
                this.handleInputEnded()
            }, { once: true })
          })
        }
        catch (error) {
          processor.stop()
          if (this.processor === processor) {
            this.processor = undefined
            this.callbacks = undefined
          }
          stream.getTracks().forEach(track => track.stop())
          throw error
        }
      })
      .catch((error) => {
        if (this.processor === processor) {
          processor.stop()
          this.processor = undefined
          this.callbacks = undefined
        }
        throw error
      })
      .finally(() => {
        this.pendingStart = undefined
      })

    return this.pendingStart
  }

  updateOptions(options: SystemAudioLipSyncOptions): void {
    this.processor?.updateOptions(options)
  }

  stop(): void {
    this.generation++
    const stream = this.stream
    this.stream = undefined
    this.processor?.stop()
    this.processor = undefined
    this.callbacks = undefined
    stream?.getTracks().forEach(track => track.stop())
  }

  dispose(): void {
    this.stop()
  }

  private handleInputEnded(): void {
    this.generation++
    this.stream = undefined
    this.processor?.stop()
    this.processor = undefined
    this.callbacks?.onEnded()
    this.callbacks = undefined
  }
}

/** Converts one system-audio stream into serializable Live2D mouth movement. */
class Live2DLipSyncProcessor {
  private context: AudioContext | undefined
  private source: MediaStreamAudioSourceNode | undefined
  private analyser: AnalyserNode | undefined
  private frequencies: Uint8Array<ArrayBuffer> | undefined
  private lipSync: Live2DLipSync | undefined
  private outputFrameId = 0
  private mouthGateOpen = false
  private outputMouthOpen = 0
  private lastMouthOutputMs = 0
  private highMouthStartedMs = 0
  private highMouthDurationMs = 0
  private forcedMouthCloseUntilMs = 0
  private options: SystemAudioLipSyncOptions = {
    inputVolumeThreshold: 0.08,
    randomCloseDelayMs: 300,
    randomCloseProbability: 1,
  }

  constructor(private readonly emitOutput: (output: SystemAudioLipSyncOutput) => void) {}

  async start(stream: MediaStream): Promise<void> {
    this.stop()

    try {
      this.context = new AudioContext()
      this.source = this.context.createMediaStreamSource(stream)
      this.analyser = this.context.createAnalyser()
      this.analyser.fftSize = inputAnalyserFFTSize
      this.analyser.smoothingTimeConstant = 0.8
      this.frequencies = new Uint8Array(this.analyser.frequencyBinCount)
      this.source.connect(this.analyser)

      this.lipSync = await createLive2DLipSync(
        this.context,
        wlipsyncProfile as Profile,
        {
          cap: 1,
          volumeScale: 1.1,
          volumeExponent: 0.6,
          mouthUpdateIntervalMs: 20,
          mouthLerpWindowMs: 0,
        },
      )
      this.lipSync.connectSource(this.source)
      this.updateOutput()
    }
    catch (error) {
      this.stop()
      throw error
    }
  }

  stop(): void {
    cancelAnimationFrame(this.outputFrameId)
    this.outputFrameId = 0
    this.lipSync?.node.disconnect()
    this.lipSync = undefined
    this.analyser?.disconnect()
    this.analyser = undefined
    this.frequencies = undefined
    this.source?.disconnect()
    this.source = undefined
    void this.context?.close()
    this.context = undefined
    this.resetMouthOutput()
    this.emitOutput({ inputLevel: 0, mouthOpen: 0 })
  }

  updateOptions(options: SystemAudioLipSyncOptions): void {
    this.options = {
      inputVolumeThreshold: clamp(options.inputVolumeThreshold, 0, 1),
      randomCloseDelayMs: clamp(options.randomCloseDelayMs, 100, 1000),
      randomCloseProbability: clamp(options.randomCloseProbability, 0, 1),
    }
    this.highMouthStartedMs = 0
    this.highMouthDurationMs = 0
  }

  private updateOutput = (): void => {
    if (!this.analyser || !this.frequencies)
      return

    this.analyser.getByteFrequencyData(this.frequencies)
    const inputLevel = this.frequencies.length
      ? this.frequencies.reduce((peak, value) => Math.max(peak, value), 0) / 255
      : 0
    const timestamp = performance.now()
    const rawMouthOpen = inputLevel >= this.options.inputVolumeThreshold
      ? this.lipSync?.getMouthOpen() ?? 0
      : 0
    const mouthOpen = this.smoothMouthClose(
      this.applySustainedMouthClosure(
        this.shapeMouthOpen(rawMouthOpen),
        timestamp,
      ),
      timestamp,
    )
    this.emitOutput({ inputLevel, mouthOpen })
    this.outputFrameId = requestAnimationFrame(this.updateOutput)
  }

  private shapeMouthOpen(rawMouthOpen: number): number {
    if (this.mouthGateOpen) {
      if (rawMouthOpen <= 0.035)
        this.mouthGateOpen = false
    }
    else if (rawMouthOpen >= 0.08) {
      this.mouthGateOpen = true
    }

    if (!this.mouthGateOpen)
      return 0

    const normalized = clamp((rawMouthOpen - 0.035) / (1 - 0.035), 0, 1)
    const emphasized = clamp(normalized ** 0.72 * 1.65, 0, 1)
    return (Math.sign(emphasized * 2 - 1) * Math.abs(emphasized * 2 - 1) ** 0.85 + 1) / 2
  }

  // NOTICE:
  // This deliberate short closure breaks up unnaturally sustained system-audio mouth openings.
  // The current analyzer can hold a high value across several spoken words without a visible consonant closure.
  // This workaround is local to the Live2D lipsync processor and does not change phoneme detection.
  // Remove it when the lipsync analyzer provides reliable short-term mouth-closure timing.
  private applySustainedMouthClosure(mouthOpen: number, timestamp: number): number {
    if (timestamp < this.forcedMouthCloseUntilMs)
      return 0

    if (mouthOpen < 0.72) {
      this.highMouthStartedMs = 0
      this.highMouthDurationMs = 0
      return mouthOpen
    }

    if (this.highMouthStartedMs === 0) {
      this.highMouthStartedMs = timestamp
      this.highMouthDurationMs = this.randomDuration(this.options.randomCloseDelayMs / 2, this.options.randomCloseDelayMs)
      return mouthOpen
    }

    if (timestamp - this.highMouthStartedMs < this.highMouthDurationMs)
      return mouthOpen

    if (Math.random() > this.options.randomCloseProbability) {
      this.highMouthStartedMs = timestamp
      this.highMouthDurationMs = this.randomDuration(this.options.randomCloseDelayMs / 2, this.options.randomCloseDelayMs)
      return mouthOpen
    }

    this.forcedMouthCloseUntilMs = timestamp + this.randomDuration(40, 100)
    this.highMouthStartedMs = 0
    this.highMouthDurationMs = 0
    return 0
  }

  private smoothMouthClose(target: number, timestamp: number): number {
    if (this.lastMouthOutputMs === 0 || target >= this.outputMouthOpen) {
      this.outputMouthOpen = target
      this.lastMouthOutputMs = timestamp
      return this.outputMouthOpen
    }

    const alpha = 1 - Math.exp(-(timestamp - this.lastMouthOutputMs) / 18)
    this.outputMouthOpen += (target - this.outputMouthOpen) * alpha
    this.lastMouthOutputMs = timestamp

    if (this.outputMouthOpen < 0.01)
      this.outputMouthOpen = target

    return this.outputMouthOpen
  }

  private resetMouthOutput(): void {
    this.mouthGateOpen = false
    this.outputMouthOpen = 0
    this.lastMouthOutputMs = 0
    this.highMouthStartedMs = 0
    this.highMouthDurationMs = 0
    this.forcedMouthCloseUntilMs = 0
  }

  private randomDuration(minimumMs: number, maximumMs: number): number {
    return minimumMs + Math.random() * (maximumMs - minimumMs)
  }
}
