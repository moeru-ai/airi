import type { Analyser, AnalyserBeatEvent, AnalyserWorkletParameters } from '@nekopaw/tempora'

import analyserWorklet from '@nekopaw/tempora/worklet?url'

import { defineInvokeEventa } from '@moeru/eventa'
import { startAnalyser as startTemporaAnalyser } from '@nekopaw/tempora'

import { StageEnvironment } from './environment'

export interface BeatSyncDetectorEventMap {
  stateChange: (isActive: boolean) => void
  beat: (e: AnalyserBeatEvent) => void
}

export interface BeatSyncDetector {
  start: (createSource: (context: AudioContext) => Promise<AudioNode>) => Promise<void>
  updateParameters: (params: Partial<AnalyserWorkletParameters>) => void
  startScreenCapture: () => Promise<void>
  stop: () => void
  on: <E extends keyof BeatSyncDetectorEventMap>(event: E, listener: BeatSyncDetectorEventMap[E]) => void
  off: <E extends keyof BeatSyncDetectorEventMap>(event: E, listener: BeatSyncDetectorEventMap[E]) => void
  readonly isActive: boolean
  readonly context: AudioContext | undefined
  readonly analyser: Analyser | undefined
  readonly source: AudioNode | undefined
}

export type CreateBeatSyncDetectorOptions = |
  {
    env: StageEnvironment.Tamagotchi
    enableLoopbackAudio: () => Promise<any>
    disableLoopbackAudio: () => Promise<any>
  }
  | {
    env: StageEnvironment.Web
  }

export function createBeatSyncDetector(options: CreateBeatSyncDetectorOptions): BeatSyncDetector {
  let context: AudioContext | undefined
  let analyser: Analyser | undefined
  let source: AudioNode | undefined
  let isActive = false

  let stopSource: (() => void) | undefined

  const listeners: { [K in keyof BeatSyncDetectorEventMap]: Array<(...args: any) => void> } = {
    stateChange: [],
    beat: [],
  }

  const emit = <E extends keyof BeatSyncDetectorEventMap>(event: E, ...args: Parameters<BeatSyncDetectorEventMap[E]>) => {
    listeners[event].forEach(listener => listener(...args))
  }

  const stop = () => {
    if (!isActive)
      return

    isActive = false
    emit('stateChange', isActive)
    stopSource?.()
    stopSource = undefined

    source?.disconnect()
    source = undefined

    analyser?.stop()
    analyser = undefined

    context?.close()
    context = undefined
  }

  const start = async (createSource: (context: AudioContext) => Promise<AudioNode>) => {
    stop()

    context = new AudioContext()
    analyser = await startTemporaAnalyser({
      context,
      worklet: analyserWorklet,
      listeners: {
        onBeat: e => emit('beat', e),
      },
    })

    const node = await createSource(context)
    node.connect(analyser.workletNode)
    source = node

    isActive = true
    emit('stateChange', isActive)
  }

  const updateParameters = (params: Partial<AnalyserWorkletParameters>) => {
    analyser?.updateParameters(params)
  }

  const startScreenCapture = async () => start(async (ctx) => {
    switch (options.env) {
      case StageEnvironment.Web: {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
          video: true,
        })

        if (stream.getAudioTracks().length === 0) {
          throw new Error('No audio track available in the stream')
        }

        stream.getAudioTracks().forEach((track) => {
          let stopCalled = false
          track.addEventListener('ended', () => {
            if (stopCalled)
              return
            stopCalled = true
            stop()
          })
        })

        const node = ctx.createMediaStreamSource(stream)
        stopSource = () => {
          stream.getTracks().forEach(track => track.stop())
        }

        return node
      }
      case StageEnvironment.Tamagotchi: {
        await options.enableLoopbackAudio()

        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        })

        const videoTracks = stream.getVideoTracks()

        videoTracks.forEach((track) => {
          track.stop()
          stream.removeTrack(track)
        })

        const node = ctx.createMediaStreamSource(stream)
        stopSource = () => {
          stream.getTracks().forEach(track => track.stop())
          options.disableLoopbackAudio()
        }
        await options.disableLoopbackAudio()

        return node
      }
      default:
        throw new Error('Failed to start screen capture: Unsupported environment')
    }
  })

  return {
    start,
    updateParameters,
    startScreenCapture,
    stop,
    on: <E extends keyof BeatSyncDetectorEventMap>(event: E, listener: BeatSyncDetectorEventMap[E]) => {
      switch (event) {
        case 'beat':
          listeners.beat.push(listener)
          break
        default:
          throw new Error(`Unknown event: ${event}`)
      }
    },
    off: <E extends keyof BeatSyncDetectorEventMap>(event: E, listener: BeatSyncDetectorEventMap[E]) => {
      switch (event) {
        case 'beat': {
          const index = listeners.beat.indexOf(listener)
          if (index !== -1)
            listeners.beat.splice(index, 1)
          break
        }
        default:
          throw new Error(`Unknown event: ${event}`)
      }
    },

    get isActive() { return isActive },
    get context() { return context },
    get analyser() { return analyser },
    get source() { return source },
  }
}

export const beatSyncToggle = defineInvokeEventa<void, boolean>('eventa:event:electron:beat-sync:toggle')
export const beatSyncRequestSignalBeat = defineInvokeEventa<void, AnalyserBeatEvent>('eventa:event:electron:beat-sync:request-signal-beat')
export const beatSyncSignalBeat = defineInvokeEventa<void, AnalyserBeatEvent>('eventa:event:electron:beat-sync:signal-beat')
