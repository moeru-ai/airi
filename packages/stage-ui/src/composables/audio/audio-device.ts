import type { AudioInput } from '@proj-airi/pipelines-audio'

import { Microphone } from '@proj-airi/audio/browser'
import { useDevicesList } from '@vueuse/core'
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'

import { useAnalytics } from '../use-analytics'

const UNKNOWN_STT_PROVIDER_ID = 'unknown'

/**
 * Normalizes browser microphone failures into low-cardinality analytics codes.
 */
function audioDeviceErrorCode(error: unknown): 'permission_denied' | 'device_unavailable' {
  if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError'))
    return 'permission_denied'

  return 'device_unavailable'
}

/**
 * Provides microphone device selection, permission requests, and audio stream lifecycle state.
 */
export function useAudioDevice() {
  const { trackMicrophonePermissionDenied } = useAnalytics()
  const { devices, audioInputs } = useDevicesList({ requestPermissions: false })
  const selectedAudioInput = ref('')
  const stream = shallowRef<MediaStream>()
  const input = shallowRef<AudioInput>()
  const permissionGranted = ref(false)
  const audioInputOptions = computed(() => audioInputs.value.filter(device => device.deviceId).map(device => ({ label: device.label || device.deviceId, value: device.deviceId })))
  const deviceConstraints = computed<MediaStreamConstraints>(() => ({ audio: {
    ...(selectedAudioInput.value ? { deviceId: { exact: selectedAudioInput.value } } : {}),
    autoGainControl: true,
    echoCancellation: true,
    noiseSuppression: true,
  } }))
  const connection = shallowRef<Microphone>()

  function owner() {
    connection.value ??= new Microphone(deviceConstraints.value, { contextOptions: { sampleRate: 16000 }, historyMs: 360 })
    return connection.value
  }

  /** Each capture or monitor releases its own lease after downstream media completion. */
  function acquireInput() {
    const current = owner()
    const lease = current.acquire()
    // Publish platform state through the same startup path as direct source owners.
    const opening = openInput()
    void lease.input.catch(() => {})
    return { input: opening, release: () => {
      const released = lease.release()
      if (connection.value === current && current.isClosed) {
        connection.value = undefined
        stream.value = undefined
        // Clear synchronously so another consumer never receives a closing source.
        input.value = undefined
      }
      return released
    } }
  }

  /** One owner shares permission, tracks, and source startup across all consumers. */
  async function openInput(): Promise<AudioInput> {
    const current = owner()
    try {
      const audio = await current.open()
      if (connection.value !== current)
        throw new DOMException('Microphone replaced during startup', 'AbortError')
      input.value = audio
      stream.value = current.stream
      permissionGranted.value = true
      // Device labels need a refresh after permission. Enumeration cannot revoke a working source.
      void navigator.mediaDevices.enumerateDevices().then((available) => {
        if (connection.value === current)
          devices.value = available
      }).catch(error => console.error('Audio device enumeration failed', error))
      return audio
    }
    catch (error) {
      if (connection.value === current) {
        connection.value = undefined
        stream.value = undefined
        input.value = undefined
      }
      void current.close()
      if (audioDeviceErrorCode(error) === 'permission_denied') {
        permissionGranted.value = false
        trackMicrophonePermissionDenied({ stt_provider_id: UNKNOWN_STT_PROVIDER_ID, error_code: 'permission_denied' })
      }
      throw error
    }
  }

  async function close() {
    const owner = connection.value
    connection.value = undefined
    stream.value = undefined
    input.value = undefined
    await owner?.close()
  }

  /** Controller bindings borrow a source already retained by their attempt or signal monitor. */
  function borrowInput(): Promise<AudioInput> {
    if (!connection.value)
      return Promise.reject(new Error('No consumer owns the microphone'))
    return connection.value.open()
  }

  async function askPermission() {
    const lease = acquireInput()
    try {
      await lease.input
    }
    finally {
      await lease.release()
    }
  }

  watch(selectedAudioInput, () => {
    if (connection.value) {
      void close().catch(error => console.error('Microphone release failed', error))
    }
  }, { flush: 'sync' })
  onScopeDispose(() => {
    void close()
  })

  return { audioInputs, audioInputOptions, selectedAudioInput, stream, input, connection, deviceConstraints, permissionGranted, askPermission, acquireInput, borrowInput, close }
}
