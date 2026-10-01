/// <reference types="vite/client" />

import type { AudioInputSource, PcmBlock, Scope, StreamController } from '@proj-airi/pipelines-audio'

import { createPushStream, createScope } from '@proj-airi/pipelines-audio'

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

/**
 * Copies a MediaStream's samples into `output` until `scope` closes.
 *
 * Track end closes the output. Context shutdown errors it. The graph is muted, because it only reads samples.
 * Scope cleanup disconnects the nodes and never stops tracks. The caller decides who owns them.
 */
async function pipeMediaStream(context: AudioContext, stream: MediaStream, scope: Scope, output: StreamController<PcmBlock>) {
  if (!stream.getAudioTracks().some(track => track.readyState === 'live'))
    throw new Error('Audio stream has no live track')

  await loadCaptureWorklet(context)
  scope.signal.throwIfAborted()

  const sourceId = crypto.randomUUID()
  const node = context.createMediaStreamSource(stream)
  const worklet = new AudioWorkletNode(context, 'airi-capture')
  const mute = context.createGain()
  mute.gain.value = 0
  node.connect(worklet).connect(mute).connect(context.destination)
  scope.defer(() => {
    worklet.port.postMessage({ type: 'close' })
    worklet.port.close()
    node.disconnect()
    worklet.disconnect()
    mute.disconnect()
  })

  worklet.port.onmessage = ({ data }: MessageEvent<{ startFrame: number, sampleRate: number, channels: Float32Array[] }>) => {
    output.write({ range: { sourceId, startFrame: data.startFrame, endFrame: data.startFrame + data.channels[0].length }, sampleRate: data.sampleRate, channels: data.channels })
  }
  worklet.onprocessorerror = () => output.error(new Error('Audio capture processor failed'))
  for (const track of stream.getAudioTracks())
    track.addEventListener('ended', () => output.close(), { once: true, signal: scope.signal })
  context.addEventListener('statechange', () => {
    if (context.state === 'closed')
      output.error(new Error('Audio context closed during capture'))
  }, { signal: scope.signal })
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

/** A borrowed MediaStream as a source. Tracks stay with their owner. */
export function mediaStreamSource(stream: MediaStream, context: AudioContext): AudioInputSource {
  return {
    open: signal => openConnection(signal, (scope, output) => pipeMediaStream(context, stream, scope, output)),
  }
}

/** A microphone source whose current connection is observable for echo policy and device labels. */
export interface MicrophoneSource extends AudioInputSource {
  /** Tracks of the open connection. Undefined before permission and after the connection closes. */
  readonly stream: MediaStream | undefined
  readonly echoCancellation: boolean
}

/**
 * Opens the microphone for each connection.
 *
 * `open` calls getUserMedia and resumes its own AudioContext synchronously, so a click handler keeps the
 * user gesture. Closing the connection stops the tracks, then closes the context.
 */
export function microphoneSource(constraints: MediaStreamConstraints, options: {
  contextOptions?: AudioContextOptions
  /** Runs with the tracks when a connection opens, and with undefined when it closes. */
  onStream?: (stream: MediaStream | undefined) => void
} = {}): MicrophoneSource {
  let current: MediaStream | undefined

  return {
    get stream() {
      return current
    },
    get echoCancellation() {
      return current?.getAudioTracks().some(track => track.getSettings().echoCancellation === true) ?? false
    },
    open: signal => openConnection(signal, async (scope, output) => {
      const context = new AudioContext(options.contextOptions)
      scope.defer(() => context.state === 'closed' ? undefined : context.close())
      const resumed = context.resume()
      // Resume can reject before permission resolves. Observe it until permission completes.
      void resumed.catch(() => {})
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
