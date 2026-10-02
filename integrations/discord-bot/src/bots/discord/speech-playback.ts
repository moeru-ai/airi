import type { Buffer } from 'node:buffer'

/** What the playback queue needs from a voice channel player. */
export interface SpeechPlayer {
  play: (audio: Buffer) => void
  stop: () => void
  /** Calls the listener whenever playback becomes idle, including after `stop`. */
  onIdle: (listener: () => void) => void
}

/**
 * Plays AIRI's speech segments in one voice channel, in arrival order.
 *
 * Use when:
 * - The host sends speech for a voice channel that this bot offered as a speech device.
 *
 * Expects:
 * - Segments arrive in playback order. The host sends each one when its local playback starts.
 *
 * Returns:
 * - A queue that plays one segment at a time. `stop` drops the queue and stops the current segment.
 */
export class SpeechPlayback {
  private queue: Buffer[] = []
  private playing = false

  constructor(private readonly player: SpeechPlayer) {
    player.onIdle(() => {
      this.playing = false
      this.next()
    })
  }

  enqueue(audio: Buffer) {
    this.queue.push(audio)
    this.next()
  }

  stop() {
    this.queue = []
    this.player.stop()
  }

  private next() {
    if (this.playing)
      return
    const audio = this.queue.shift()
    if (!audio)
      return
    this.playing = true
    this.player.play(audio)
  }
}
