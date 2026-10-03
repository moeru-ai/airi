import type { MicrophoneSource } from '@proj-airi/audio/browser'

import { microphoneSource } from '@proj-airi/audio/browser'
import { AudioInput } from '@proj-airi/pipelines-audio'
import { useDevicesList } from '@vueuse/core'
import { computed, markRaw, onScopeDispose, ref, shallowRef, watch } from 'vue'

import { useAnalytics } from '../use-analytics'

const UNKNOWN_STT_PROVIDER_ID = 'unknown'

/** Speech-onset capture replays this much audio from before detection. */
const MICROPHONE_HISTORY_MS = 360

/**
 * Silero VAD requires 512-sample windows at 16 kHz, so capture runs at that rate.
 *
 * NOTICE:
 * Firefox rejects createMediaStreamSource when the AudioContext rate differs from the device rate.
 * Root cause: Firefox does not resample MediaStream sources across AudioContext sample rates.
 * Source: "Connecting AudioNodes from AudioContexts with different sample-rate is currently not supported".
 * Removal condition: capture at the device rate and resample windows for VAD, or Firefox supports resampling.
 */
const MICROPHONE_CONTEXT: AudioContextOptions = { sampleRate: 16000 }

/**
 * Normalizes browser microphone failures into low-cardinality analytics codes.
 */
function audioDeviceErrorCode(error: unknown): 'permission_denied' | 'device_unavailable' {
  if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError'))
    return 'permission_denied'

  return 'device_unavailable'
}

/**
 * Provides microphone selection and one shared input for the selected device.
 *
 * Consumers subscribe to `input` with their own abort signal. The first subscriber opens the microphone,
 * and the last one to leave releases it. Selecting another device creates a new input. Existing
 * subscriptions keep the old device until their owners move to the new input.
 */
export function useAudioDevice() {
  const { trackMicrophonePermissionDenied } = useAnalytics()
  const { devices, audioInputs } = useDevicesList({ requestPermissions: false })
  const selectedAudioInput = ref('')
  const permissionGranted = ref(false)
  const audioInputOptions = computed(() => audioInputs.value.filter(device => device.deviceId).map(device => ({ label: device.label || device.deviceId, value: device.deviceId })))
  const deviceConstraints = computed<MediaStreamConstraints>(() => ({ audio: {
    ...(selectedAudioInput.value ? { deviceId: { exact: selectedAudioInput.value } } : {}),
    autoGainControl: true,
    echoCancellation: true,
    noiseSuppression: true,
  } }))
  /** Tracks of the selected device while any subscriber keeps it open. */
  const stream = shallowRef<MediaStream>()
  const source = shallowRef<MicrophoneSource>(createSource(deviceConstraints.value))
  const input = shallowRef(markRaw(new AudioInput(source.value, { historyMs: MICROPHONE_HISTORY_MS })))

  function createSource(constraints: MediaStreamConstraints): MicrophoneSource {
    const created = markRaw(microphoneSource(constraints, {
      contextOptions: MICROPHONE_CONTEXT,
      // A replaced device can close after the new one opened. Only the selected source updates the view.
      onStream: (opened) => {
        if (source.value === created)
          stream.value = opened
      },
    }))
    return created
  }

  // Subscribers move to the new input themselves. The old device closes when its last subscriber leaves.
  watch(deviceConstraints, (constraints) => {
    stream.value = undefined
    source.value = createSource(constraints)
    input.value = markRaw(new AudioInput(source.value, { historyMs: MICROPHONE_HISTORY_MS }))
  })

  /**
   * Subscribes until the first block arrives, then leaves. It reports a denied or missing device.
   * Device labels need enumeration after permission, so this also refreshes the device list.
   */
  async function askPermission() {
    const probe = new AbortController()
    const reader = input.value.subscribe({ signal: probe.signal }).getReader()
    try {
      await reader.read()
      permissionGranted.value = true
      devices.value = await navigator.mediaDevices.enumerateDevices()
    }
    catch (error) {
      if (audioDeviceErrorCode(error) === 'permission_denied') {
        permissionGranted.value = false
        trackMicrophonePermissionDenied({ stt_provider_id: UNKNOWN_STT_PROVIDER_ID, error_code: 'permission_denied' })
      }
      throw error
    }
    finally {
      probe.abort('Permission probe finished')
    }
  }

  onScopeDispose(() => {
    void input.value.close()
  })

  return { audioInputs, audioInputOptions, selectedAudioInput, deviceConstraints, permissionGranted, source, input, stream, askPermission }
}
