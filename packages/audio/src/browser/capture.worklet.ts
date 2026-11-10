/// <reference types="@types/audioworklet" />

/** Copies render-thread samples. Codecs and speech policy run outside the render thread. */
class CaptureProcessor extends AudioWorkletProcessor {
  private frame = 0
  private closed = false

  constructor() {
    super()
    this.port.onmessage = () => {
      this.closed = true
    }
  }

  /** Triggering workflow: browser render quantum → owned planar samples → BrowserAudioSource message port. */
  process(inputs: Float32Array[][]): boolean {
    if (this.closed)
      return false
    const input = inputs[0]
    if (input?.[0]?.length) {
      const channels = input.map(channel => channel.slice())
      this.port.postMessage({ startFrame: this.frame, sampleRate, channels }, channels.map(channel => channel.buffer))
      this.frame += input[0].length
    }
    return true
  }
}

registerProcessor('airi-capture', CaptureProcessor)
