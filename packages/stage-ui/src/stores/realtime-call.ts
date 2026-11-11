import type { CallInvite, CallInviteResult, Device } from '@proj-airi/realtime-protocol'
import type { CallMedia } from '@proj-airi/realtime-transport-livekit'

import type { RelayStatus } from '../libs/realtime/relay-client'

import { defineInvoke, defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { mediaStreamSource } from '@proj-airi/audio/browser'
import { AudioInput } from '@proj-airi/pipelines-audio'
import { callEnded, callInvite, deviceAnnounce, deviceDiscover, deviceLeave, parseCallEnded, parseCallInvite, parseCallInviteResult, parseDevice, parseDeviceLeave } from '@proj-airi/realtime-protocol'
import { joinCall } from '@proj-airi/realtime-transport-livekit'
import { parseCallAccess } from '@proj-airi/server-sdk-shared/realtime'
import { useLocalStorage } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { computed, markRaw, onScopeDispose, ref, shallowRef, watch } from 'vue'

import { authedFetch } from '../libs/auth-fetch'
import { createRelayClient } from '../libs/realtime/relay-client'
import { SERVER_URL } from '../libs/server'
import { useAudioContext } from './audio'
import { useAuthStore } from './auth'
import { useHearingStore } from './modules/hearing'
import { useRealtimeAudioStore } from './realtime-audio'
import { useVoiceStore } from './voice'

/** The host must answer an invite in this time. The relay gives no delivery receipt. */
const INVITE_TIMEOUT_MS = 15_000
/** How long `findHost` collects the answers to one discovery. */
const DISCOVERY_WINDOW_MS = 1500
/** The remote audio uses the sample rate and the history of the microphone input, so voice detection works the same. */
const REMOTE_INPUT = { sampleRate: 16000, historyMs: 360 }

/**
 * Why a call to a host did not start.
 *
 * - `no-host`: No device of the account answers calls now.
 * - `rejected`: The host is busy, or it cannot run a call.
 * - `failed`: The media room, the microphone, or the invite failed. `error` has the message.
 */
export type RemoteCallFailure = 'no-host' | 'rejected' | 'failed'

interface ActiveCall {
  callId: string
  role: 'host' | 'endpoint'
  media?: CallMedia
  /** Resources of this call. `endCall` runs them in reverse order. */
  cleanups: Array<() => void>
}

/**
 * Runs realtime calls between this device and the other devices of the account.
 *
 * A device has one of two roles in a call:
 *
 * - The endpoint is the device that the user holds. It sends its microphone and plays the speech of the host.
 * - The host owns the agent. Its voice controller listens to the endpoint, and its speech output goes to the call.
 *
 * State model: `call` is the one call of this device. `devices` is what other devices announced since the last
 * discovery. It is not persisted. `deviceId` and the two switches are persisted in local storage.
 */
export const useRealtimeCallStore = defineStore('realtime-call', () => {
  const auth = useAuthStore()
  const voice = useVoiceStore()
  const hearing = useHearingStore()
  const audio = useRealtimeAudioStore()
  const { audioContext } = storeToRefs(useAudioContext())

  const deviceId = useLocalStorage('realtime/device-id', () => nanoid())
  /** The host switch. When it is on, this device answers the calls of the account. */
  const answersCalls = useLocalStorage('settings/realtime/answers-calls', false)
  /** The endpoint switch. When it is on, the call control of the chat calls a host. */
  const callsHost = useLocalStorage('settings/realtime/calls-host', false)
  const device = shallowRef<Pick<Device, 'kind' | 'name'>>({ kind: 'web', name: 'AIRI' })

  const relayStatus = ref<RelayStatus>('stopped')
  const devices = ref<Device[]>([])
  const call = shallowRef<ActiveCall>()
  const startedAt = shallowRef<number>()
  const muted = ref(false)
  const error = shallowRef<string>()

  const role = computed(() => call.value?.role)
  const hosts = computed(() => devices.value.filter(item => item.capabilities.includes('call-host')))

  const relay = createRelayClient({
    serverUrl: SERVER_URL,
    getToken: () => auth.token,
    onStatus: (status) => {
      relayStatus.value = status
      if (status === 'ready')
        announce()
    },
  })

  function self(): Device {
    return { deviceId: deviceId.value, ...device.value, capabilities: answersCalls.value ? ['call-host'] : [] }
  }

  function announce() {
    void relay.context.emit(deviceAnnounce, self())
  }

  /** Sets the kind and the name that other devices show for this device. */
  function configure(next: Pick<Device, 'kind' | 'name'>) {
    device.value = next
    if (relayStatus.value === 'ready')
      announce()
  }

  /** Asks the devices of the account to announce again. The list fills as the answers arrive. */
  function discover() {
    devices.value = []
    void relay.context.emit(deviceDiscover, { from: deviceId.value })
  }

  async function requestAccess(callId: string) {
    const response = await authedFetch(new URL(`/api/v1/realtime/calls/${callId}/access`, SERVER_URL), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: deviceId.value }),
    })
    if (!response.ok)
      throw new Error(`Call access failed with status ${response.status}`)
    return parseCallAccess(await response.json())
  }

  /**
   * Ends the call of this device and releases its audio. `notify` tells the other side, for a call that this
   * side ends. A call that the other side ended, or that already ended, needs no notice.
   */
  function endCall(reason: 'hangup' | 'failed', notify: boolean) {
    const current = call.value
    if (!current)
      return

    call.value = undefined
    startedAt.value = undefined
    muted.value = false
    for (const cleanup of current.cleanups.reverse())
      cleanup()
    void current.media?.leave().catch(cause => console.error('[realtime] leaving the media room failed', cause))
    if (notify)
      void relay.context.emit(callEnded, { callId: current.callId, from: deviceId.value, reason })
  }

  function fail(current: ActiveCall, cause: unknown) {
    if (call.value !== current)
      return
    error.value = errorMessageFrom(cause) ?? 'The call failed'
    console.error('[realtime] call failed', cause)
    endCall('failed', true)
  }

  function mediaHandlers(current: ActiveCall, onRemoteAudio: (stream: MediaStream | undefined) => void) {
    return {
      onRemoteAudio: (stream: MediaStream | undefined) => {
        if (call.value === current)
          onRemoteAudio(stream)
      },
      // The media client restores a dropped connection by itself. When it gives up, the call ends.
      onState: (state: 'connected' | 'reconnecting' | 'closed') => {
        if (state === 'closed' && call.value === current)
          endCall('failed', true)
      },
      // The other side can lose its connection without a `callEnded`.
      onPeerLeft: () => {
        if (call.value === current)
          endCall('hangup', false)
      },
    }
  }

  /**
   * Host: joins the media room, then swaps the audio of the voice host.
   * The remote track becomes the input of the voice controller, and the speech output goes to a published track.
   */
  async function hostCall(current: ActiveCall) {
    const access = await requestAccess(current.callId)
    if (call.value !== current)
      return

    const media = await joinCall(access, mediaHandlers(current, (stream) => {
      if (!stream) {
        audio.input = undefined
        return
      }
      const inputContext = new AudioContext({ sampleRate: REMOTE_INPUT.sampleRate })
      audio.input = markRaw(new AudioInput(mediaStreamSource(stream, inputContext), { historyMs: REMOTE_INPUT.historyMs }))
      current.cleanups.push(() => {
        audio.input = undefined
        void inputContext.close()
      })
    }))
    current.media = media
    if (call.value !== current) {
      void media.leave()
      return
    }

    const sink = audioContext.value.createMediaStreamDestination()
    audio.speechSink = sink
    current.cleanups.push(() => {
      audio.speechSink = undefined
    })
    await media.publishAudio(sink.stream.getAudioTracks()[0])
    if (call.value !== current)
      return

    voice.startCall()
    current.cleanups.push(() => voice.endCall())
    startedAt.value = Date.now()
  }

  function answer(invite: CallInvite): CallInviteResult {
    if (!answersCalls.value || !hearing.configured)
      return { status: 'rejected', reason: 'unavailable' }
    if (call.value || voice.callActive)
      return { status: 'rejected', reason: 'busy' }

    const current: ActiveCall = { callId: invite.callId, role: 'host', cleanups: [] }
    call.value = current
    error.value = undefined
    void hostCall(current).catch(cause => fail(current, cause))
    return { status: 'accepted' }
  }

  /**
   * Endpoint: calls a host. It must run from a user gesture, because it asks for the microphone.
   * Returns the failure, or `undefined` when the call runs.
   */
  async function startCall(hostDeviceId: string): Promise<RemoteCallFailure | undefined> {
    if (call.value)
      return undefined

    const current: ActiveCall = { callId: nanoid(), role: 'endpoint', cleanups: [] }
    call.value = current
    error.value = undefined
    try {
      // The browser cancels the echo of the host speech here. The host has no access to the speaker of this device.
      const microphone = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      const track = microphone.getAudioTracks()[0]
      current.cleanups.push(() => track.stop())
      const stopMuteWatch = watch(muted, (value) => {
        track.enabled = !value
      })
      current.cleanups.push(stopMuteWatch)

      const access = await requestAccess(current.callId)
      if (call.value !== current)
        return undefined

      current.media = await joinCall(access, mediaHandlers(current, (stream) => {
        audio.remoteSpeech = stream
      }))
      current.cleanups.push(() => {
        audio.remoteSpeech = undefined
      })
      if (call.value !== current) {
        void current.media.leave()
        return undefined
      }
      await current.media.publishAudio(track)

      const result = parseCallInviteResult(await defineInvoke(relay.context, callInvite(hostDeviceId))(
        { callId: current.callId, from: deviceId.value },
        { signal: AbortSignal.timeout(INVITE_TIMEOUT_MS) },
      ))
      if (call.value !== current)
        return undefined
      if (result.status === 'rejected') {
        endCall('hangup', false)
        return 'rejected'
      }

      startedAt.value = Date.now()
      return undefined
    }
    catch (cause) {
      fail(current, cause)
      return 'failed'
    }
  }

  /** Endpoint: returns a host of the account that answers calls now, after one discovery. */
  async function findHost(): Promise<Device | undefined> {
    discover()
    await new Promise(resolve => setTimeout(resolve, DISCOVERY_WINDOW_MS))
    return hosts.value[0]
  }

  function hangUp() {
    endCall('hangup', true)
  }

  function toggleMuted() {
    if (call.value?.role === 'endpoint')
      muted.value = !muted.value
  }

  const stops = [
    relay.context.on(deviceDiscover, () => announce()),
    relay.context.on(deviceAnnounce, (event) => {
      const announced = parseDevice(event.body)
      if (announced.deviceId === deviceId.value)
        return
      devices.value = [...devices.value.filter(item => item.deviceId !== announced.deviceId), announced]
    }),
    relay.context.on(deviceLeave, (event) => {
      const left = parseDeviceLeave(event.body)
      devices.value = devices.value.filter(item => item.deviceId !== left.deviceId)
    }),
    relay.context.on(callEnded, (event) => {
      const ended = parseCallEnded(event.body)
      // Every device of the account receives this event. Only the call of this device matters here.
      if (ended.callId === call.value?.callId && ended.from !== deviceId.value)
        endCall('hangup', false)
    }),
    defineInvokeHandler(relay.context, callInvite(deviceId.value), body => answer(parseCallInvite(body))),
    watch(answersCalls, () => {
      if (relayStatus.value === 'ready')
        announce()
    }),
    // The voice host can end its call by itself, for example when Hearing loses its provider.
    watch(() => voice.callActive, (active) => {
      if (!active && call.value?.role === 'host' && startedAt.value)
        endCall('hangup', true)
    }),
    watch(() => auth.token, (token) => {
      relay.stop()
      if (token)
        relay.start()
    }, { immediate: true }),
  ]

  onScopeDispose(() => {
    endCall('hangup', true)
    stops.forEach(stop => stop())
    void relay.context.emit(deviceLeave, { deviceId: deviceId.value })
    relay.stop()
  })

  return { deviceId, answersCalls, callsHost, relayStatus, devices, hosts, role, startedAt, muted, error, configure, discover, findHost, startCall, hangUp, toggleMuted }
})
