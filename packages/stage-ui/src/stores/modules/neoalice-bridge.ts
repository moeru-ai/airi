import type { NeoAliceBridgeEvent } from '@proj-airi/alice-motion'
import type { MqttClient } from 'mqtt'

import { errorMessageFrom } from '@moeru/std'
import { MotionCatalog, neoAliceBridgeTopics, NeoAliceTranslator } from '@proj-airi/alice-motion'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { createEventHook, watchDebounced } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

/** The one load of MQTT.js for the whole app. */
let mqttConnectLoading: Promise<typeof import('mqtt')['connect']> | undefined

/**
 * Loads the `connect` function of MQTT.js only when the bridge starts, so a disabled bridge costs nothing.
 *
 * NOTICE:
 * The browser build of MQTT.js 5 (`dist/mqtt.esm.js`) has only a default export, so `import('mqtt').connect`
 * is undefined in the browser. Node resolves `build/index.js`, which has the named export.
 * Source: `node_modules/mqtt/package.json` (`exports['.'].browser.import`) and the end of `dist/mqtt.esm.js`.
 * Removal condition: MQTT.js adds named exports to its browser ESM build.
 */
function loadMqttConnect(): Promise<typeof import('mqtt')['connect']> {
  // One load for the whole app. A settings change during the first load reuses it.
  mqttConnectLoading ??= import('mqtt').then((module) => {
    const loaded = module as typeof import('mqtt') & { default?: typeof import('mqtt') }
    const connect = loaded.connect ?? loaded.default?.connect
    if (typeof connect !== 'function')
      throw new Error('MQTT.js has no connect function')
    return connect
  })
  // A failed load can be tried again on the next start.
  mqttConnectLoading.catch(() => {
    mqttConnectLoading = undefined
  })
  return mqttConnectLoading
}

/**
 * How the bridge plays NeoAlice speech.
 * - `airi-voice`: `cmd/tts/say` text is spoken with the voice of the AIRI speech settings. `cmd/tts/audio` plays as sent.
 * - `neoalice-audio`: only `cmd/tts/audio` plays. Text is shown, not spoken.
 * - `silent`: nothing plays. The avatar still moves and changes mood. Use it next to the mirror, in shadow mode.
 */
export type NeoAliceSpeechMode = 'airi-voice' | 'neoalice-audio' | 'silent'

export type NeoAliceBridgeStatus = 'off' | 'connecting' | 'connected' | 'reconnecting' | 'error'

/**
 * NeoAlice bridge, sprint S08.
 *
 * A read-only MQTT client over WebSocket. It subscribes to the topics of one NeoAlice site and of the
 * companion service, translates each message with `NeoAliceTranslator`, and hands the events to the stage.
 * It has no publish call, so it cannot change NeoAlice or the mirror.
 *
 * The connection lives while at least one holder needs it: the stage and the settings page call `hold`.
 */
export const useNeoAliceBridgeStore = defineStore('neoalice-bridge', () => {
  const enabled = useLocalStorageManualReset<boolean>('settings/neoalice-bridge/enabled', false)
  /** WebSocket URL of the broker, for example `ws://192.0.2.10:9001`. Mosquitto needs a `websockets` listener. */
  const brokerUrl = useLocalStorageManualReset<string>('settings/neoalice-bridge/broker-url', 'ws://localhost:9001')
  const site = useLocalStorageManualReset<string>('settings/neoalice-bridge/site', '')
  const acceptAnySite = useLocalStorageManualReset<boolean>('settings/neoalice-bridge/accept-any-site', false)
  const companionSite = useLocalStorageManualReset<string>('settings/neoalice-bridge/companion-site', 'companion')
  const username = useLocalStorageManualReset<string>('settings/neoalice-bridge/username', '')
  const password = useLocalStorageManualReset<string>('settings/neoalice-bridge/password', '')
  const speechMode = useLocalStorageManualReset<NeoAliceSpeechMode>('settings/neoalice-bridge/speech-mode', 'silent')

  const status = ref<NeoAliceBridgeStatus>('off')
  const lastError = ref('')
  const receivedCount = ref(0)
  const ignoredCount = ref(0)
  const lastIgnored = ref('')
  const lastEvent = ref('')

  const configured = computed(() => brokerUrl.value.trim() !== '' && (acceptAnySite.value || site.value.trim() !== ''))

  const eventHook = createEventHook<NeoAliceBridgeEvent>()
  const reconnectHook = createEventHook<void>()
  let client: MqttClient | undefined
  /** Increments on each start and stop, so a late callback of an old client does nothing. */
  let generation = 0
  let holders = 0

  async function connect() {
    disconnect()
    if (!enabled.value || !configured.value || holders === 0)
      return
    const current = ++generation
    status.value = 'connecting'
    lastError.value = ''
    const options = { site: site.value.trim(), acceptAnySite: acceptAnySite.value, companionSite: companionSite.value.trim() || 'companion' }
    const translator = new NeoAliceTranslator({ ...options, catalog: new MotionCatalog() })

    let connectMqtt: typeof import('mqtt')['connect']
    try {
      connectMqtt = await loadMqttConnect()
    }
    catch (error) {
      status.value = 'error'
      lastError.value = errorMessageFrom(error) ?? 'The MQTT library did not load'
      return
    }
    if (current !== generation)
      return

    let connectedBefore = false
    const next = connectMqtt(brokerUrl.value.trim(), {
      clientId: `airi-neoalice-bridge-${nanoid(8)}`,
      username: username.value || undefined,
      password: password.value || undefined,
      reconnectPeriod: 5000,
      connectTimeout: 10_000,
      clean: true,
    })
    client = next
    next.on('connect', () => {
      if (current !== generation)
        return
      status.value = 'connected'
      lastError.value = ''
      next.subscribe(neoAliceBridgeTopics(options), { qos: 0 }, (error) => {
        if (error && current === generation)
          lastError.value = errorMessageFrom(error) ?? 'Subscription failed'
      })
      if (connectedBefore)
        void reconnectHook.trigger()
      connectedBefore = true
    })
    next.on('reconnect', () => {
      if (current === generation)
        status.value = 'reconnecting'
    })
    next.on('error', (error) => {
      if (current !== generation)
        return
      status.value = 'error'
      lastError.value = errorMessageFrom(error) ?? 'MQTT error'
    })
    next.on('message', (topic, payload) => {
      if (current !== generation)
        return
      receivedCount.value++
      const event = translator.translate(topic, payload.toString(), Date.now())
      if (event.type === 'ignored') {
        ignoredCount.value++
        lastIgnored.value = `${event.topic}: ${event.reason}`
        console.info(`[neoalice-bridge] ignored ${lastIgnored.value}`)
        return
      }
      lastEvent.value = event.type === 'intent' ? `intent ${event.intent.semanticAction}` : event.type
      void eventHook.trigger(event)
    })
  }

  function disconnect() {
    generation++
    client?.end(true)
    client = undefined
    status.value = 'off'
  }

  /** Keeps the connection open until the returned function runs. */
  function hold() {
    holders++
    if (holders === 1)
      void connect()
    let released = false
    return () => {
      if (released)
        return
      released = true
      holders--
      if (holders === 0)
        disconnect()
    }
  }

  // Typing in a settings field changes these values on each key. The bridge reconnects once, after a pause.
  // A manual reset ref triggers on every assignment, even with the same value. The key changes only with a real change.
  const connectionKey = computed(() => JSON.stringify([enabled.value, brokerUrl.value, site.value, acceptAnySite.value, companionSite.value, username.value, password.value]))
  watchDebounced(connectionKey, () => {
    if (holders > 0)
      void connect()
  }, { debounce: 500 })

  function resetState() {
    enabled.reset()
    brokerUrl.reset()
    site.reset()
    acceptAnySite.reset()
    companionSite.reset()
    username.reset()
    password.reset()
    speechMode.reset()
  }

  return {
    enabled,
    brokerUrl,
    site,
    acceptAnySite,
    companionSite,
    username,
    password,
    speechMode,
    configured,
    status,
    lastError,
    receivedCount,
    ignoredCount,
    lastIgnored,
    lastEvent,
    hold,
    reconnect: connect,
    onEvent: eventHook.on,
    onReconnect: reconnectHook.on,
    resetState,
  }
})
