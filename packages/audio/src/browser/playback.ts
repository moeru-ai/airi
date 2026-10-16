import type { PlaybackClip, PlaybackDriver, PlayingAudio } from '@proj-airi/pipelines-audio'

import { AudioOutput } from './audio-output'

/**
 * Plays owned nodes in a borrowed context. The context clock is the playback clock.
 * Fade completion follows source ended events on that clock.
 */
export class BrowserPlayback implements PlaybackDriver {
  constructor(private readonly context: AudioContext, private readonly options?: { destination?: AudioNode, onSource?: (source: AudioBufferSourceNode) => void }) {}

  nowMs() {
    return this.context.currentTime * 1000
  }

  play(clip: PlaybackClip): PlayingAudio {
    return new AudioOutput(this.context, clip.audio, this.options?.destination ?? this.context.destination, { startAtMs: clip.startAtMs, onStart: clip.onStart, onSource: this.options?.onSource })
  }
}
