/// <reference types="vite/client" />

import type { LiveAudioSource, PcmBlock } from '@proj-airi/pipelines-audio'
import type { Scope, StreamController } from '@proj-airi/stream-kit'

import { createPushStream, createScope } from '@proj-airi/stream-kit'
import { nanoid } from 'nanoid/non-secure'

import CaptureWorkletURL from './capture.worklet?worker&url'

const worklets = new WeakMap<AudioContext, Promise<void>>()

function loadCaptureWorklet(context: AudioContext) {
  let ready = worklets.get(context)
  if (!ready) {
    ready = context.audioWorklet.addModule(CaptureWorkletURL)
    worklets.set(context, ready)
    void ready.catch(() => worklets.delete(context))
  }
  return ready
}

/** Open connections of each shared context. */
const contexts = new Map<string, { context: AudioContext, connections: number }>()

/**
 * Returns the shared context for these options. Connections share it, so the capture worklet loads once per page.
 * A new context loads the worklet again, and that load took up to 1 s while other pages used the CPU.
 */
function acquireContext(options: AudioContextOptions | undefined) {
  const key = JSON.stringify(options ?? {})
  let entry = contexts.get(key)
  if (!entry || entry.context.state === 'closed') {
    entry = { context: new AudioContext(options), connections: 0 }
    contexts.set(key, entry)
  }
  entry.connections += 1
  return entry.context
}

/** Suspends a shared context after its last connection, so an idle page renders no audio. */
function releaseContext(context: AudioContext) {
  const entry = [...contexts.values()].find(item => item.context === context)
  if (!entry)
    return
  entry.connections -= 1
  if (entry.connections === 0 && context.state === 'running')
    return context.suspend()
}

/**
 * Copies the samples that reach `node` into `output` until `scope` closes.
 *
 * The tap is muted, because it only reads samples. Context shutdown errors the output.
 * Scope cleanup disconnects only the nodes of the tap. The caller keeps `node` and its other connections.
 */
async function pipeAudioNode(context: AudioContext, node: AudioNode, scope: Scope, output: StreamController<PcmBlock>) {
  await loadCaptureWorklet(context)
  scope.signal.throwIfAborted()

  const sourceId = nanoid()
  const worklet = new AudioWorkletNode(context, 'airi-capture')
  const mute = context.createGain()
  mute.gain.value = 0
  node.connect(worklet)
  worklet.connect(mute).connect(context.destination)
  scope.defer(() => {
    worklet.port.postMessage({ type: 'close' })
    worklet.port.close()
    node.disconnect(worklet)
    worklet.disconnect()
    mute.disconnect()
  })

  worklet.port.onmessage = ({ data }: MessageEvent<{ startFrame: number, sampleRate: number, channels: Float32Array[] }>) => {
    output.write({ range: { sourceId, startFrame: data.startFrame, endFrame: data.startFrame + data.channels[0].length }, sampleRate: data.sampleRate, channels: data.channels })
  }
  worklet.onprocessorerror = () => output.error(new Error('Audio capture processor failed'))
  context.addEventListener('statechange', () => {
    if (context.state === 'closed')
      output.error(new Error('Audio context closed during capture'))
  }, { signal: scope.signal })
}

/**
 * Copies a MediaStream's samples into `output` until `scope` closes.
 *
 * Track end closes the output. Scope cleanup disconnects the nodes and never stops tracks. The caller decides who owns them.
 */
async function pipeMediaStream(context: AudioContext, stream: MediaStream, scope: Scope, output: StreamController<PcmBlock>) {
  if (!stream.getAudioTracks().some(track => track.readyState === 'live'))
    throw new Error('Audio stream has no live track')

  const node = context.createMediaStreamSource(stream)
  scope.defer(() => node.disconnect())
  for (const track of stream.getAudioTracks())
    track.addEventListener('ended', () => output.close(), { once: true, signal: scope.signal })
  await pipeAudioNode(context, node, scope, output)
}

/** Starts `connect` inside one connection scope and exposes its blocks. Cancelling the stream closes the scope. */
function openConnection(signal: AbortSignal, connect: (scope: Scope, output: StreamController<PcmBlock>) => Promise<void>) {
  const scope = createScope(signal)
  const output = createPushStream<PcmBlock>(reason => void scope.close(reason))
  scope.defer(() => output.close())
  void connect(scope, output).catch((error) => {
    output.error(error)
    void scope.close(error)
  })
  return output.stream
}

/**
 * The samples that reach a borrowed Web Audio node, as a source. For example, the mix of a playback.
 *
 * Each connection adds a muted tap to `node` and removes only that tap when it closes. The node stays with its owner.
 */
export function audioNodeSource(node: AudioNode, context: AudioContext): LiveAudioSource {
  return {
    live: true,
    open: signal => openConnection(signal, (scope, output) => pipeAudioNode(context, node, scope, output)),
  }
}

/** A borrowed MediaStream as a source. Tracks stay with their owner. */
export function mediaStreamSource(stream: MediaStream, context: AudioContext): LiveAudioSource {
  return {
    live: true,
    open: signal => openConnection(signal, (scope, output) => pipeMediaStream(context, stream, scope, output)),
  }
}

/** A microphone source whose current connection is observable for echo policy and device labels. */
export interface MicrophoneSource extends LiveAudioSource {
  /** Tracks of the open connection. Undefined before permission and after the connection closes. */
  readonly stream: MediaStream | undefined
  readonly echoCancellation: boolean
}

/**
 * Opens the microphone for each connection.
 *
 * `open` calls getUserMedia and resumes its own AudioContext synchronously, so a click handler keeps the
 * user gesture. Closing the connection stops the tracks. The last connection of a shared context suspends it.
 */
export function microphoneSource(constraints: MediaStreamConstraints, options: {
  contextOptions?: AudioContextOptions
  /** Runs with the tracks when a connection opens, and with undefined when it closes. */
  onStream?: (stream: MediaStream | undefined) => void
} = {}): MicrophoneSource {
  let current: MediaStream | undefined

  return {
    live: true,
    get stream() {
      return current
    },
    get echoCancellation() {
      return current?.getAudioTracks().some(track => track.getSettings().echoCancellation === true) ?? false
    },
    open: signal => openConnection(signal, async (scope, output) => {
      const context = acquireContext(options.contextOptions)
      scope.defer(() => releaseContext(context))
      const resumed = context.resume()
      // Resume can reject before permission resolves. Observe it until permission completes.
      void resumed.catch(() => {})
      // The worklet loads while the browser opens the device, not after it.
      const worklet = loadCaptureWorklet(context)
      void worklet.catch(() => {})
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      scope.defer(() => {
        stream.getTracks().forEach(track => track.stop())
        if (current === stream) {
          current = undefined
          options.onStream?.(undefined)
        }
      })
      scope.signal.throwIfAborted()
      await resumed
      current = stream
      options.onStream?.(stream)
      await pipeMediaStream(context, stream, scope, output)
    }),
  }
}
