/// <reference types="vite/client" />

import LibsamplerateWorkletURL from '@alexanderolsen/libsamplerate-js/dist/libsamplerate.worklet.js?worker&url'

import ProcessorWorkletURL from './processor.worklet?worker&url'

let context: AudioContext | undefined
let sampleRate: number = 48000 // High quality base sample rate
let isReady: boolean = false
let error: string = ''
let isInitializing: boolean = false
let workletLoaded: boolean = false

const activeSources = new Set<MediaStreamAudioSourceNode>()
const activeGainNodes = new Set<GainNode>()
const activeAnalyzers = new Set<AnalyserNode>()
const activeWorkletNodes = new Set<AudioWorkletNode>()

const listeners = new Set<(state: State) => void>()

// iOS Silent mode fix: track whether we've unlocked the AudioContext via user gesture
let isUnlocked = false
let unlockPromise: Promise<void> | undefined

/**
 * Detects if the current browser is iOS Safari (including PWA/webview).
 * Only iOS WebKit browsers respect the silent switch — Chrome/Firefox on iOS use
 * the system AVAudioSession with playback category and bypass it.
 */
export function isIOSAudioRestricted(): boolean {
  if (typeof window === 'undefined')
    return false
  const ua = window.navigator.userAgent
  const iOS = !!ua.match(/iPad/i) || !!ua.match(/iPhone/i)
  const webkit = !!ua.match(/WebKit/i)
  const nonSystemBrowser = !ua.match(/CriOS/i) && !ua.match(/FxiOS/i)
  return iOS && webkit && nonSystemBrowser
}

/**
 * Unlocks the AudioContext on iOS by playing a silent buffer from a user gesture.
 *
 * iOS Safari (and webview PWAs) use AVAudioSession with category "ambient" by default,
 * which routes audio through the ringer switch. When the ringer is muted, no audio plays.
 *
 * The workaround: call resume() + play a 1-sample inaudible buffer within a user
 * gesture handler. This is the documented approach used by YouTube PWA, Google TTS, etc.
 *
 * @see https://bugs.webkit.org/show_bug.cgi?id=237322
 * @see https://stackoverflow.com/questions/76291413/no-sound-on-ios-only-web-audio-api
 */
export async function unlockAudioContextOnIOS(): Promise<void> {
  if (!isIOSAudioRestricted())
    return
  if (isUnlocked)
    return
  if (unlockPromise)
    return unlockPromise

  unlockPromise = _doUnlock()
  await unlockPromise
}

async function _doUnlock(): Promise<void> {
  if (typeof AudioContext === 'undefined')
    return

  try {
    const ctx = context ?? new AudioContext()

    if (ctx.state === 'suspended')
      await ctx.resume()

    // Play a 1-sample inaudible buffer — this is the actual unlock trigger on iOS
    const silentBuffer = ctx.createBuffer(1, 1, ctx.sampleRate)
    const source = ctx.createBufferSource()
    source.buffer = silentBuffer
    source.connect(ctx.destination)
    source.start()

    if (!context) {
      // If we minted a temporary context just for unlock, discard it
      await ctx.close()
    }

    isUnlocked = true
  }
  catch {
    // Silently ignore — not all environments support Web Audio
  }
}

/**
 * Returns true when the AudioContext is in a state where audio will actually play.
 * On iOS Silent mode the context may report 'running' but be muted —
 * isAudioContextUnlocked() reflects the real unlock state after user gesture.
 */
export function isAudioContextUnlocked(): boolean {
  if (!context)
    return false
  if (!isIOSAudioRestricted())
    return true
  return context.state !== 'suspended' || isUnlocked
}

export interface State {
  isReady: boolean
  sampleRate: number
  error: string
  isInitializing: boolean
  workletLoaded: boolean
  currentTime: number
  state: AudioContextState
}

export interface WorkletOptions {
  inputSampleRate?: number
  outputSampleRate?: number
  channels?: number
  converterType?: number
  bufferSize?: number
}

function notifyListeners() {
  const state: State = {
    isReady,
    sampleRate,
    error,
    isInitializing,
    workletLoaded,
    currentTime: context?.currentTime ?? 0,
    state: context?.state ?? 'closed',
  }
  listeners.forEach((listener) => {
    try {
      listener(state)
    }
    catch (err) {
      console.error('AudioContext state listener error:', err)
    }
  })
}

async function loadWorklets() {
  if (!context || workletLoaded)
    return

  try {
    await context.audioWorklet.addModule(ProcessorWorkletURL)
    await context.audioWorklet.addModule(LibsamplerateWorkletURL)

    workletLoaded = true
  }
  catch (err) {
    console.error('Failed to load AudioWorklets:', err)
    throw new Error(`Worklet loading failed: ${err}`)
  }
}

export async function initializeAudioContext(requestedSampleRate: number = 48000): Promise<AudioContext> {
  // Use high quality base sample rate
  const baseSampleRate = Math.max(requestedSampleRate, 48000)

  if (context && isReady && sampleRate === baseSampleRate && workletLoaded) {
    return context
  }

  if (isInitializing) {
    return new Promise((resolve, reject) => {
      const checkReady = () => {
        if (!isInitializing) {
          if (context && isReady && workletLoaded) {
            resolve(context)
          }
          else {
            reject(new Error(error || 'AudioContext initialization failed'))
          }
        }
        else {
          setTimeout(checkReady, 10)
        }
      }
      checkReady()
    })
  }

  isInitializing = true
  error = ''
  notifyListeners()

  try {
    // Close existing context if sample rate changed
    if (context && sampleRate !== baseSampleRate) {
      await cleanupAudioContext()
    }

    // Create new context if needed
    if (!context) {
      context = new AudioContext({ sampleRate: baseSampleRate })
      sampleRate = baseSampleRate
    }

    // Resume if suspended
    if (context.state === 'suspended') {
      await context.resume()
    }

    // Load worklets
    await loadWorklets()

    isReady = true
    notifyListeners()
    return context
  }
  catch (err) {
    error = err instanceof Error ? err.message : String(err)
    isReady = false
    workletLoaded = false
    notifyListeners()
    console.error('Failed to initialize AudioContext:', err)
    throw err
  }
  finally {
    isInitializing = false
    notifyListeners()
  }
}

export function createAudioSource(mediaStream: MediaStream): MediaStreamAudioSourceNode {
  if (!context || !isReady) {
    throw new Error('AudioContext not initialized')
  }

  const source = context.createMediaStreamSource(mediaStream)
  activeSources.add(source)
  return source
}

export function createAudioAnalyser(options?: Partial<{
  fftSize: number
  smoothingTimeConstant: number
  minDecibels: number
  maxDecibels: number
}>): AnalyserNode {
  if (!context || !isReady) {
    throw new Error('AudioContext not initialized')
  }

  const analyser = context.createAnalyser()

  if (options?.fftSize)
    analyser.fftSize = options.fftSize
  if (options?.smoothingTimeConstant !== undefined) {
    analyser.smoothingTimeConstant = options.smoothingTimeConstant
  }
  if (options?.minDecibels !== undefined)
    analyser.minDecibels = options.minDecibels
  if (options?.maxDecibels !== undefined)
    analyser.maxDecibels = options.maxDecibels

  activeAnalyzers.add(analyser)
  return analyser
}

export function createAudioGainNode(initialGain: number = 1): GainNode {
  if (!context || !isReady) {
    throw new Error('AudioContext not initialized')
  }

  const gainNode = context.createGain()
  gainNode.gain.value = initialGain
  activeGainNodes.add(gainNode)
  return gainNode
}

export function removeAudioSource(source: MediaStreamAudioSourceNode) {
  source.disconnect()
  activeSources.delete(source)
}

export function removeAudioGainNode(gainNode: GainNode) {
  gainNode.disconnect()
  activeGainNodes.delete(gainNode)
}

export function removeAudioAnalyser(analyser: AnalyserNode) {
  analyser.disconnect()
  activeAnalyzers.delete(analyser)
}

export async function suspendAudioContext() {
  if (context && context.state === 'running') {
    await context.suspend()
    notifyListeners()
  }
}

export async function resumeAudioContext() {
  if (context && context.state === 'suspended') {
    await context.resume()
    notifyListeners()
  }
}

export function createResamplingWorkletNode(
  inputNode: AudioNode,
  options: WorkletOptions = {},
): AudioWorkletNode {
  if (!context || !isReady || !workletLoaded) {
    throw new Error('AudioContext or worklets not ready')
  }

  const workletOptions = {
    inputSampleRate: sampleRate,
    outputSampleRate: 16000,
    channels: 1,
    converterType: 2, // SRC_SINC_MEDIUM_QUALITY
    bufferSize: 4096,
    ...options,
  }

  const workletNode = new AudioWorkletNode(context, 'resampling-processor', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: workletOptions.channels,
    processorOptions: workletOptions,
  })

  // Connect input to worklet
  inputNode.connect(workletNode)

  activeWorkletNodes.add(workletNode)

  return workletNode
}

export function removeWorkletNode(node: AudioWorkletNode) {
  node.disconnect()
  activeWorkletNodes.delete(node)
}

export async function cleanupAudioContext() {
  // Disconnect all active nodes
  activeSources.forEach(source => source.disconnect())
  activeGainNodes.forEach(gainNode => gainNode.disconnect())
  activeAnalyzers.forEach(analyser => analyser.disconnect())
  activeWorkletNodes.forEach(worklet => worklet.disconnect())

  // Clear sets
  activeSources.clear()
  activeGainNodes.clear()
  activeAnalyzers.clear()
  activeWorkletNodes.clear()

  // Close context
  if (context && context.state !== 'closed') {
    await context.close()
  }

  context = undefined
  isReady = false
  workletLoaded = false
  error = ''
  notifyListeners()
}

export function getAudioContextState(): State {
  return {
    isReady,
    sampleRate,
    error,
    isInitializing,
    workletLoaded,
    currentTime: context?.currentTime ?? 0,
    state: context?.state ?? 'closed',
  }
}

export function getAudioContext(): AudioContext | undefined {
  return context
}

export function getCurrentTime(): number {
  return context?.currentTime ?? 0
}

export function isAudioContextReady(): boolean {
  return isReady
}

// Event subscription
export function subscribeToAudioContext(listener: (state: State) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Browser cleanup
if ('window' in globalThis && globalThis.window != null) {
  globalThis.window.addEventListener('beforeunload', cleanupAudioContext)
  globalThis.window.addEventListener('pagehide', cleanupAudioContext)
}
