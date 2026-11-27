import type { Analyser, AnalyserBeatEvent, AnalyserWorkletParameters } from '@nekopaw/tempora'

import type { BeatSyncDetectorEventMap, BeatSyncDetectorState } from './types'

import analyserWorklet from '@nekopaw/tempora/worklet?url'

import { startAnalyser as startTemporaAnalyser } from '@nekopaw/tempora'

import { isStageWeb, StageEnvironment } from '../environment'

export const inputAnalyserFFTSize = 1024

// TypeScript can match an event to its args only through an args map, not through the listener map.
type BeatSyncDetectorEventArgs = { [K in keyof BeatSyncDetectorEventMap]: Parameters<BeatSyncDetectorEventMap[K]> }

export interface BeatSyncDetector {
  start: (createSource: (context: AudioContext) => Promise<AudioNode>) => Promise<void>
  updateParameters: (params: Partial<AnalyserWorkletParameters>) => void
  startScreenCapture: () => Promise<void>
  stop: () => void
  on: <E extends keyof BeatSyncDetectorEventArgs>(event: E, listener: (...args: BeatSyncDetectorEventArgs[E]) => void) => () => void
  off: <E extends keyof BeatSyncDetectorEventArgs>(event: E, listener: (...args: BeatSyncDetectorEventArgs[E]) => void) => void
  getInputByteFrequencyData: () => Uint8Array<ArrayBuffer>
  readonly state: BeatSyncDetectorState
  readonly context: AudioContext | undefined
  readonly analyser: Analyser | undefined
  readonly source: AudioNode | undefined
}

export type CreateBeatSyncDetectorOptions = { env: StageEnvironment.Web }

export function createBeatSyncDetector(options: CreateBeatSyncDetectorOptions): BeatSyncDetector {
  let context: AudioContext | undefined
  let analyser: Analyser | undefined
  let source: AudioNode | undefined
  const state = {
    isActive: false,
  }

  let stopSource: (() => void) | undefined

  let inputAnalyserNode: AnalyserNode | undefined
  let inputAnalyserBuffer: Uint8Array<ArrayBuffer> | undefined

  const listeners: { [K in keyof BeatSyncDetectorEventArgs]: Array<(...args: BeatSyncDetectorEventArgs[K]) => void> } = {
    stateChange: [],
    beat: [],
  }

  const emit = <E extends keyof BeatSyncDetectorEventArgs>(event: E, ...args: BeatSyncDetectorEventArgs[E]) => {
    listeners[event].forEach(listener => listener(...args))
  }

  const stop = () => {
    if (!state.isActive)
      return

    state.isActive = false
    emit('stateChange', state)
    stopSource?.()
    stopSource = undefined

    if (inputAnalyserNode) {
      inputAnalyserNode.disconnect()
      inputAnalyserNode = undefined
      inputAnalyserBuffer = undefined
    }

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

    inputAnalyserNode = context.createAnalyser()
    inputAnalyserNode.fftSize = inputAnalyserFFTSize // Fast Fourier Transform size (power of 2, 32-32768)
    // A smaller fftSize gives better time resolution but worse frequency resolution.
    inputAnalyserNode.smoothingTimeConstant = 0.8 // A value between 0 and 1. Higher value smooths out changes.
    inputAnalyserBuffer = new Uint8Array(inputAnalyserNode.frequencyBinCount)

    node.connect(inputAnalyserNode)
    inputAnalyserNode.connect(analyser?.workletNode)

    source = node

    state.isActive = true
    emit('stateChange', state)
  }

  const updateParameters = (params: Partial<AnalyserWorkletParameters>) => {
    analyser?.updateParameters(params)
  }

  const startScreenCapture = async () => start(async (ctx) => {
    if (options.env !== StageEnvironment.Web)
      throw new Error('Failed to start screen capture: Unsupported environment')

    const stream = await navigator.mediaDevices.getDisplayMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: true,
    })

    if (stream.getAudioTracks().length === 0)
      throw new Error('No audio track available in the stream')

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
  })

  const off = <E extends keyof BeatSyncDetectorEventArgs>(event: E, listener: (...args: BeatSyncDetectorEventArgs[E]) => void) => {
    const listenerFns = listeners[event]
    if (!listenerFns)
      throw new Error(`Unknown event: ${event}`)

    const index = listenerFns.indexOf(listener)
    if (index !== -1)
      listenerFns.splice(index, 1)
  }

  const on = <E extends keyof BeatSyncDetectorEventArgs>(event: E, listener: (...args: BeatSyncDetectorEventArgs[E]) => void) => {
    const listenerFns = listeners[event]
    if (!listenerFns)
      throw new Error(`Unknown event: ${event}`)

    listenerFns.push(listener)
    return () => off(event, listener)
  }

  const getInputByteFrequencyData = () => {
    inputAnalyserNode?.getByteFrequencyData(inputAnalyserBuffer!)
    return inputAnalyserBuffer!
  }

  return {
    start,
    updateParameters,
    startScreenCapture,
    stop,
    on,
    off,
    getInputByteFrequencyData,

    get state() { return state },
    get context() { return context },
    get analyser() { return analyser },
    get source() { return source },
  }
}

let detector: BeatSyncDetector | undefined
function getDetector() {
  if (!isStageWeb())
    throw new Error('getDetector() is only available in Stage Web environment')

  if (!detector)
    detector = createBeatSyncDetector({ env: StageEnvironment.Web })

  return detector
}

/** Returns whether the current Stage runtime can capture audio for Beat Sync. */
export function isBeatSyncSupported() {
  return isStageWeb()
}

export function toggleBeatSync(enabled: boolean) {
  if (!isStageWeb())
    throw new Error('Unknown environment for beatSyncToggle()')

  if (enabled)
    return getDetector().startScreenCapture()

  return getDetector().stop()
}

export async function getBeatSyncState() {
  if (!isStageWeb())
    throw new Error('Unknown environment for getBeatSyncState()')

  return getDetector().state
}

export function updateBeatSyncParameters(params: Partial<AnalyserWorkletParameters>) {
  if (!isStageWeb())
    throw new Error('Unknown environment for updateBeatSyncParameters()')

  return getDetector().updateParameters(params)
}

export function listenBeatSyncStateChange(listener: (state: BeatSyncDetectorState) => void) {
  if (!isStageWeb())
    throw new Error('Unknown environment for listenBeatSyncStateChange()')

  return getDetector().on('stateChange', listener)
}

export function listenBeatSyncBeatSignal(listener: (e: AnalyserBeatEvent) => void) {
  if (!isStageWeb())
    throw new Error('Unknown environment for listenBeatSyncBeatSignal()')

  return getDetector().on('beat', listener)
}

export async function getBeatSyncInputByteFrequencyData() {
  if (!isStageWeb())
    throw new Error('Unknown environment for getBeatSyncInputByteFrequencyData()')

  return getDetector().getInputByteFrequencyData()
}