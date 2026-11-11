import type { AudioInput } from '@proj-airi/pipelines-audio'

import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

/**
 * Where the audio of a realtime call enters and leaves this device.
 *
 * The call store writes these values. The voice controller and the Stage read them. With all three unset, the
 * device uses its own microphone and speakers.
 */
export const useRealtimeAudioStore = defineStore('realtime-audio', () => {
  /** On the host: the audio of the endpoint. The voice controller listens to it in place of the microphone. */
  const input = shallowRef<AudioInput>()
  /** On the host: the node that receives the speech output in place of the speakers. The call publishes it. */
  const speechSink = shallowRef<AudioNode>()
  /** On the endpoint: the speech of the host. The Stage plays it and moves the mouth of the avatar with it. */
  const remoteSpeech = shallowRef<MediaStream>()

  return { input, speechSink, remoteSpeech }
})
