import type { EffectScope } from 'vue'

import { errorMessageFrom } from '@moeru/std'
import { BrowserPlayback } from '@proj-airi/audio/browser'
import { Playback } from '@proj-airi/pipelines-audio'
import { useVoiceListening } from '@proj-airi/stage-ui/composables/voice-input-mode'
import { claimListeningLease, useListeningLeasedElsewhere } from '@proj-airi/stage-ui/composables/voice-listening-lease'
import { useVoiceResponseOutput } from '@proj-airi/stage-ui/composables/voice-response-output'
import { useAudioContext } from '@proj-airi/stage-ui/stores/audio'
import { listensContinuously, useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings/audio-device'
import { useSpeechOutputControlStore } from '@proj-airi/stage-ui/stores/speech-output-control'
import { computed, effectScope, onScopeDispose, ref, shallowRef, watch } from 'vue'

import { stopMicrophoneRecordings } from './audio-chunks'
import { holdSpeaking, useOtherWindowSpeakingHold } from './speaking-holds'

export type LiveVoiceHost = ReturnType<typeof useLiveVoiceHost>

/**
 * Makes this page the voice host while it runs: the microphone listens as the Hearing input mode says, and replies
 * of the active chat play here.
 *
 * The stage scene is the voice host on the main page. A route without the stage has no host, so this page starts one.
 * The host starts only on request. While it runs, it holds a listening lease, so the voice hosts of other windows,
 * for example the main window, stop listening. Two listening hosts would answer each turn twice.
 * It does not start while another window holds a lease, for example a second devtool window.
 * The output serves only this window, so a speech command of another window, such as read-aloud, plays once, on the
 * main window host. While that host plays speech, this page holds the speaking flag, so the listener does not take
 * the speech as a turn.
 * Special tokens, such as emotions, are not played, because the page has no character.
 * Scope disposal stops the host.
 */
export function useLiveVoiceHost() {
  const { audioContext } = useAudioContext()
  const speechOutputControl = useSpeechOutputControlStore()
  const hearing = useHearingStore()
  const devices = useSettingsAudioDevice()

  const leasedElsewhere = useListeningLeasedElsewhere()

  const scope = shallowRef<EffectScope>()
  const error = ref<string>()

  function start() {
    if (scope.value)
      return

    error.value = undefined
    if (leasedElsewhere.value) {
      error.value = 'Another window runs its own voice host, for example a second devtool window. Stop it first, because both would answer each turn.'
      return
    }
    // Browsers resume a suspended context only during a user gesture, so the reply can play later.
    void audioContext.resume()

    const created = effectScope(true)
    try {
      created.run(() => {
        // The lease goes out before this page listens, so the other hosts stop first.
        onScopeDispose(claimListeningLease())
        const volume = audioContext.createGain()
        volume.connect(audioContext.destination)
        watch(() => speechOutputControl.speechVolume, (level) => {
          volume.gain.setTargetAtTime(level, audioContext.currentTime, 0.05)
        }, { immediate: true })

        // Clips end in the order they start.
        const playing: (() => void)[] = []
        const disconnect = useVoiceResponseOutput({
          audioContext,
          playback: new Playback(new BrowserPlayback(audioContext, { destination: volume })),
          windowOnly: true,
          onSpecial: () => {},
          // Voice activity detection reads the speaking flag, so the reply does not start an input of its own without echo cancellation.
          onPlaybackStart: () => playing.push(holdSpeaking()),
          onPlaybackEnd: () => playing.shift()?.(),
        })
        useOtherWindowSpeakingHold()
        useVoiceListening()

        onScopeDispose(() => {
          disconnect()
          volume.disconnect()
          playing.splice(0).forEach(release => release())
        })
      })
      scope.value = created
    }
    catch (cause) {
      created.stop()
      error.value = errorMessageFrom(cause) ?? 'The voice host could not start.'
    }
  }

  function stop() {
    scope.value?.stop()
    scope.value = undefined
  }

  onScopeDispose(stop)

  /** The host listens to the microphone all the time, so it takes any speech that a recording on the page hears as a turn. */
  const listensAlways = computed(() => !!scope.value && devices.enabled && listensContinuously(hearing.inputMode))
  // A change in another window, such as a synced Hearing input mode, can start continuous listening during a recording.
  // The recording's lease does not pause this window's host, so the recording stops.
  watch(listensAlways, (listens) => {
    if (listens)
      stopMicrophoneRecordings('The voice host began to listen all the time, so the recording stopped.')
  }, { flush: 'sync' })

  /**
   * Why a diagnostic recording on the page cannot start now, or nothing.
   * This page's host or the host of another window that holds the listening lease can take the speech as a turn.
   * A recording claims the lease itself, so the main window host stops.
   */
  const recordingBlocked = computed(() => {
    if (listensAlways.value)
      return 'Stop the voice host or turn off its microphone input first, because the host takes this speech as a turn.'
    if (leasedElsewhere.value)
      return 'Another window runs its own voice host, for example a second devtool window. Stop it first, because it takes this speech as a turn.'
    return undefined
  })

  return { running: computed(() => !!scope.value), recordingBlocked, error, start, stop }
}
