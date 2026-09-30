/// <reference types="vite/client" />

import type { AudioSource, PcmBlock } from '@proj-airi/pipelines-audio'

import { createPushStream } from '@proj-airi/pipelines-audio'

import CaptureWorkletURL from './capture.worklet?worker&url'

const worklets = new WeakMap<AudioContext, Promise<void>>()

/** Borrows a MediaStream and context. Close disconnects owned nodes and never stops borrowed tracks. */
export class BrowserAudioSource implements AudioSource {
  readonly id = crypto.randomUUID()
  private readonly output = createPushStream<PcmBlock>(() => { void this.close() })
  readonly frames = this.output.stream
  private readonly node: MediaStreamAudioSourceNode
  private readonly worklet: AudioWorkletNode
  private readonly mute: GainNode
  private readonly end = () => this.output.close()
  private closed = false

  private constructor(private readonly context: AudioContext, private readonly stream: MediaStream) {
    this.node = context.createMediaStreamSource(stream)
    this.worklet = new AudioWorkletNode(context, 'airi-capture')
    this.mute = context.createGain()
    this.mute.gain.value = 0
    this.node.connect(this.worklet).connect(this.mute).connect(context.destination)
    this.worklet.port.onmessage = event => this.accept(event.data)
    this.worklet.onprocessorerror = () => this.output.error(new Error('Audio capture processor failed'))
    stream.getAudioTracks().forEach(track => track.addEventListener('ended', this.end, { once: true }))
    context.addEventListener('statechange', this.contextChanged)
  }

  static async open(context: AudioContext, stream: MediaStream): Promise<BrowserAudioSource> {
    if (!stream.getAudioTracks().some(track => track.readyState === 'live'))
      throw new Error('Audio stream has no live track')
    let ready = worklets.get(context)
    if (!ready) {
      ready = context.audioWorklet.addModule(CaptureWorkletURL)
      worklets.set(context, ready)
      void ready.catch(() => worklets.delete(context))
    }
    await ready
    return new BrowserAudioSource(context, stream)
  }

  /** Triggering workflow: CaptureProcessor.process → message port → AudioInput source reader. */
  private accept(message: { startFrame: number, sampleRate: number, channels: Float32Array[] }) {
    if (this.closed)
      return
    this.output.write({ range: { sourceId: this.id, startFrame: message.startFrame, endFrame: message.startFrame + message.channels[0].length }, sampleRate: message.sampleRate, channels: message.channels })
  }

  /** Triggering workflow: browser context shutdown → fail source → AudioInput cancels pending capture consumers. */
  private readonly contextChanged = () => {
    if (this.context.state === 'closed' && !this.closed)
      this.output.error(new Error('Audio context closed during capture'))
  }

  async close() {
    if (this.closed)
      return
    this.closed = true
    this.context.removeEventListener('statechange', this.contextChanged)
    this.stream.getAudioTracks().forEach(track => track.removeEventListener('ended', this.end))
    this.worklet.port.onmessage = null
    this.worklet.port.postMessage({ type: 'close' })
    this.worklet.port.close()
    this.node.disconnect()
    this.worklet.disconnect()
    this.mute.disconnect()
    this.output.close()
  }
}
