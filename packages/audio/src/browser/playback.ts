import type { PlaybackClip, PlaybackDriver, PlayingAudio } from '@proj-airi/pipelines-audio'

import { AudioOutput } from './audio-output'

/** Plays owned nodes in a borrowed context. Fade completion follows source ended events on the audio clock. */
export class BrowserPlayback implements PlaybackDriver {
  constructor(private readonly context: AudioContext, private readonly options?: { destination?: AudioNode, onSource?: (source: AudioBufferSourceNode) => void }) {}

  play(clip: PlaybackClip): PlayingAudio {
    return new AudioOutput(this.context, clip.audio, this.options?.destination ?? this.context.destination, { onStart: clip.onStart, onSource: this.options?.onSource })
  }
}
