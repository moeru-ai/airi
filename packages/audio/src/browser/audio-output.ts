import type { PcmBlock, PlayingAudio } from '@proj-airi/pipelines-audio'

export class AudioOutput implements PlayingAudio {
  private readonly completion = Promise.withResolvers<{ throughMs: number }>()
  private readonly gain: GainNode
  private readonly nodes = new Map<AudioBufferSourceNode, { start: number, duration: number }>()
  private reader: ReadableStreamDefaultReader<PcmBlock> | undefined
  private nextStart: number
  private throughMs = 0
  private ended = false
  private stopped = false
  private stoppedAt: number | undefined
  private settled = false
  private started = false
  readonly done = this.completion.promise

  constructor(private readonly context: AudioContext, audio: Blob | ReadableStream<PcmBlock>, destination: AudioNode, private readonly events?: { onStart?: () => void, onSource?: (source: AudioBufferSourceNode) => void }) {
    this.gain = context.createGain()
    this.gain.connect(destination)
    this.nextStart = context.currentTime
    context.addEventListener('statechange', this.contextChanged)
    void this.load(audio).catch(cause => this.finish(cause instanceof Error ? cause : new Error('Audio playback failed', { cause })))
  }

  private async load(audio: Blob | ReadableStream<PcmBlock>) {
    if (this.context.state !== 'running')
      throw new Error('Playback requires a running audio context')
    if (audio instanceof Blob) {
      const decoded = await this.context.decodeAudioData(await audio.arrayBuffer())
      if (!this.stopped)
        this.schedule(decoded)
    }
    else {
      this.reader = audio.getReader()
      try {
        while (!this.stopped) {
          const result = await this.reader.read()
          if (result.done || this.stopped)
            break
          const block = result.value
          const buffer = this.context.createBuffer(block.channels.length, block.channels[0].length, block.sampleRate)
          block.channels.forEach((channel, index) => buffer.copyToChannel(new Float32Array(channel), index))
          this.schedule(buffer)
        }
      }
      finally {
        this.reader.releaseLock()
        this.reader = undefined
      }
    }
    this.ended = true
    if (!this.nodes.size)
      this.finish()
  }

  private schedule(buffer: AudioBuffer) {
    if (this.stopped || this.settled)
      return
    const source = this.context.createBufferSource()
    source.buffer = buffer
    source.connect(this.gain)
    const start = Math.max(this.context.currentTime, this.nextStart)
    this.nextStart = start + buffer.duration
    this.nodes.set(source, { start, duration: buffer.duration })
    /** Triggering workflow: scheduled source ends → rendered interval → output drain or silence receipt. */
    source.onended = () => {
      const entry = this.nodes.get(source)
      if (!entry)
        return
      this.throughMs += Math.max(0, Math.min(entry.duration, (this.stoppedAt ?? this.context.currentTime) - entry.start)) * 1000
      this.nodes.delete(source)
      source.disconnect()
      if (!this.nodes.size && (this.ended || this.stopped))
        this.finish()
    }
    source.start(start)
    this.events?.onSource?.(source)
    if (!this.started) {
      this.started = true
      this.events?.onStart?.()
    }
  }

  stop(options: { fadeMs: number }): Promise<{ throughMs: number }> {
    if (this.stopped || this.settled)
      return this.done
    this.stopped = true
    void this.reader?.cancel('Playback stopped').catch(() => {})
    if (!this.nodes.size) {
      this.finish()
      return this.done
    }
    if (this.context.state !== 'running') {
      this.finish(new Error('Playback context cannot confirm fade completion'))
      return this.done
    }
    const start = this.context.currentTime
    const end = start + options.fadeMs / 1000
    this.stoppedAt = end
    this.gain.gain.cancelScheduledValues(start)
    this.gain.gain.setValueAtTime(this.gain.gain.value, start)
    this.gain.gain.linearRampToValueAtTime(0, end)
    this.nodes.forEach((_entry, source) => source.stop(end))
    return this.done
  }

  /** Triggering workflow: browser suspends or closes the audio context → fail pending playback and silence receipt. */
  private readonly contextChanged = () => {
    if (this.context.state !== 'running' && !this.settled)
      this.finish(new Error('Audio context stopped during playback'))
  }

  private finish(error?: Error) {
    if (this.settled)
      return
    this.settled = true
    this.stopped = true
    void this.reader?.cancel(error).catch(() => {})
    this.context.removeEventListener('statechange', this.contextChanged)
    this.nodes.forEach((_entry, source) => {
      source.onended = null
      source.stop()
      source.disconnect()
    })
    this.nodes.clear()
    this.gain.disconnect()
    if (error)
      this.completion.reject(error)
    else
      this.completion.resolve({ throughMs: this.throughMs })
  }
}
