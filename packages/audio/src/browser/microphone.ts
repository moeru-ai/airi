import { AudioInput } from '@proj-airi/pipelines-audio'

import { BrowserAudioSource } from './audio-source'
import { BrowserMediaAdapters } from './media-adapters'

/** Owns one browser permission request, its physical tracks, and its source connection. Create a new owner after device replacement. */
export class Microphone {
  private readonly context: AudioContext
  private readonly ownsContext: boolean
  private opening: Promise<AudioInput> | undefined
  private closing: Promise<void> | undefined
  private media: MediaStream | undefined
  private closed = false
  private users = 0

  constructor(private readonly constraints: MediaStreamConstraints, private readonly options: { context?: AudioContext, contextOptions?: AudioContextOptions, historyMs?: number } = {}) {
    this.context = options.context ?? new AudioContext(options.contextOptions)
    this.ownsContext = !options.context
  }

  get stream(): MediaStream | undefined { return this.media }
  get isClosed(): boolean { return this.closed }
  get echoCancellation(): boolean {
    return this.media?.getAudioTracks().some(track => track.getSettings().echoCancellation === true) ?? false
  }

  /** A lease keeps the shared source alive until its consumer has finished capture and media finalization. */
  acquire(): { input: Promise<AudioInput>, release: () => Promise<void> } {
    if (this.closed)
      throw new Error('Microphone is closed')
    this.users++
    let released = false
    return {
      input: this.open(),
      release: () => {
        if (released)
          return Promise.resolve()
        released = true
        this.users--
        return this.users === 0 ? this.close() : Promise.resolve()
      },
    }
  }

  /** Resume and permission start in the caller's gesture. A late permission result cannot reopen a closed microphone. */
  open(): Promise<AudioInput> {
    if (this.closed)
      return Promise.reject(new Error('Microphone is closed'))
    if (this.opening)
      return this.opening
    this.opening = (async () => {
      let stream: MediaStream | undefined
      try {
        const resumed = this.context.resume()
        // Resume can reject before permission resolves. Keep the rejection observed until permission completes.
        void resumed.catch(() => {})
        const requested = navigator.mediaDevices.getUserMedia(this.constraints)
        stream = await requested
        if (this.closed)
          throw new DOMException('Microphone closed during permission', 'AbortError')
        await resumed
        if (this.closed)
          throw new DOMException('Microphone closed during permission', 'AbortError')
        const source = await BrowserAudioSource.open(this.context, stream)
        if (this.closed) {
          await source.close()
          throw new DOMException('Microphone closed during startup', 'AbortError')
        }
        this.media = stream
        const ownedStream = stream
        return new AudioInput({
          id: source.id,
          frames: source.frames,
          close: async () => {
            this.closed = true
            await source.close()
            ownedStream.getTracks().forEach(track => track.stop())
            this.media = undefined
            if (this.ownsContext && this.context.state !== 'closed')
              await this.context.close()
          },
        }, new BrowserMediaAdapters(this.context), { historyMs: this.options.historyMs ?? 0 })
      }
      catch (error) {
        this.closed = true
        stream?.getTracks().forEach(track => track.stop())
        if (this.ownsContext && this.context.state !== 'closed')
          await this.context.close()
        throw error
      }
    })()
    return this.opening
  }

  close(): Promise<void> {
    if (this.closing)
      return this.closing
    this.closed = true
    const contextClosed = this.ownsContext && this.context.state !== 'closed' ? this.context.close() : Promise.resolve()
    this.closing = (async () => {
      try {
        await contextClosed
        const input = await this.opening
        await input?.close()
      }
      catch {
        // Failed startup has already released its tracks and owned context.
      }
      finally {
        this.media?.getTracks().forEach(track => track.stop())
        this.media = undefined
        if (this.ownsContext && this.context.state !== 'closed')
          await this.context.close()
      }
    })()
    return this.closing
  }
}
