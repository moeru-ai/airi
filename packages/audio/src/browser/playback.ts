import type { LiveAudioSource, PlaybackClip, PlaybackDriver, PlayingAudio } from '@proj-airi/pipelines-audio'

import { AudioOutput } from './audio-output'
import { audioNodeSource } from './sources'

/**
 * Plays owned nodes in a borrowed context. The context clock is the playback clock.
 * Fade completion follows source ended events on that clock.
 *
 * Every clip plays into one mix node, which connects to `destination`. `output` reads that mix and `connect` attaches a
 * node to it, so an observer hears what this playback plays, after the clip fades and before any volume after `destination`.
 */
export class BrowserPlayback implements PlaybackDriver<AudioNode> {
  readonly output: LiveAudioSource
  private readonly mix: GainNode

  constructor(private readonly context: AudioContext, options?: { destination?: AudioNode }) {
    this.mix = context.createGain()
    this.mix.connect(options?.destination ?? context.destination)
    this.output = audioNodeSource(this.mix, context)
  }

  connect(node: AudioNode) {
    this.mix.connect(node)
    return () => {
      try {
        this.mix.disconnect(node)
      }
      catch {
        // The node already left the graph, for example because its context closed.
      }
    }
  }

  nowMs() {
    return this.context.currentTime * 1000
  }

  play(clip: PlaybackClip): PlayingAudio {
    return new AudioOutput(this.context, clip.audio, this.mix, { startAtMs: clip.startAtMs, onStart: clip.onStart })
  }
}
