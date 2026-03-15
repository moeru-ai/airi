<script setup lang="ts">
import type { WebSocketBaseEvent, WebSocketEventOf, WebSocketEvents } from '@proj-airi/server-sdk'
import type { ChatStreamEvent, ContextMessage } from '@proj-airi/stage-ui/types/chat'

import type { FlowDirection, FlowEntry, SparkNotifyEntryState } from './context-flow-types'

import { errorMessageFrom } from '@moeru/std'
import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { useCharacterOrchestratorStore, useCharacterStore } from '@proj-airi/stage-ui/stores/character'
import { useChatOrchestratorStore } from '@proj-airi/stage-ui/stores/chat'
import { CHAT_STREAM_CHANNEL_NAME, CONTEXT_CHANNEL_NAME } from '@proj-airi/stage-ui/stores/chat/constants'
import { useModsServerChannelStore } from '@proj-airi/stage-ui/stores/mods/api/channel-server'
import { getEventSourceKey } from '@proj-airi/stage-ui/utils'
import { Callout } from '@proj-airi/ui'
import { useBroadcastChannel } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import ContextFlowActions from './components/context-flow-actions.vue'
import ContextFlowFilters from './components/context-flow-filters.vue'
import ContextFlowStream from './components/context-flow-stream.vue'

import { useContextFlowFormatters } from './composables/use-context-flow-formatters'

type DirectionFilter = 'all' | FlowDirection

const {
  formatDestinations,
  getPayloadData,
  summarizeContextUpdate,
  truncateText,
} = useContextFlowFormatters()

const chatStore = useChatOrchestratorStore()
const characterStore = useCharacterStore()
const characterOrchestratorStore = useCharacterOrchestratorStore()
const serverChannelStore = useModsServerChannelStore()

const entries = ref<FlowEntry[]>([])
const showIncoming = ref(true)
const showOutgoing = ref(true)
const showServer = ref(true)
const showBroadcast = ref(false)
const showChat = ref(false)
const showDevtools = ref(false)
const filterText = ref('')
const maxEntries = ref('200')

const testPayload = ref('{"type":"coding:context","data":{"file":{"path":"README.md"}}}')
const testStrategy = ref<ContextUpdateStrategy>(ContextUpdateStrategy.ReplaceSelf)

const testSparkNotifyPayload = ref(JSON.stringify({
  kind: 'ping',
  urgency: 'immediate',
  headline: 'Minecraft entity `zombie` attacked you, health dropped 2 points.',
  note: 'Triggered from minecraft',
  destinations: ['character'],
  payload: {
    message: 'Hello from Context Flow devtools',
  },
}, null, 2))

const directionFilter = ref<DirectionFilter>('all')

const sparkNotifyStates = ref<Map<string, SparkNotifyEntryState>>(new Map())

const maxEntriesValue = computed(() => {
  const parsed = Number.parseInt(maxEntries.value, 10)
  if (!Number.isFinite(parsed))
    return 200
  return Math.min(Math.max(parsed, 50), 1000)
})

const filteredEntries = computed(() => {
  const query = filterText.value.trim().toLowerCase()
  const filtered = entries.value.filter((entry) => {
    if (directionFilter.value !== 'all' && entry.direction !== directionFilter.value)
      return false
    if (!showIncoming.value && entry.direction === 'incoming')
      return false
    if (!showOutgoing.value && entry.direction === 'outgoing')
      return false
    if (!showServer.value && entry.channel === 'server')
      return false
    if (!showBroadcast.value && entry.channel === 'broadcast')
      return false
    if (!showChat.value && entry.channel === 'chat')
      return false
    if (!showDevtools.value && entry.channel === 'devtools')
      return false
    if (!query)
      return true
    return entry.searchText.includes(query)
  })
  return filtered.slice().reverse()
})

function normalizePayload(payload: unknown) {
  try {
    return JSON.parse(JSON.stringify(payload)) as unknown
  }
  catch {
    return payload
  }
}

function getSparkNotifyReaction(eventId: string) {
  const reactions = characterStore.reactions
  for (let index = reactions.length - 1; index >= 0; index -= 1) {
    const reaction = reactions[index]
    if (reaction.sourceEventId === eventId)
      return reaction
  }
  return undefined
}

function getSparkNotifyEntryState(entry: FlowEntry) {
  if (entry.type !== 'spark:notify')
    return undefined
  const payload = getPayloadData(entry) as { id?: string } | undefined
  if (!payload?.id)
    return undefined
  return sparkNotifyStates.value.get(payload.id)
}

function setSparkNotifyState(nextState: SparkNotifyEntryState) {
  const nextMap = new Map(sparkNotifyStates.value)
  nextMap.set(nextState.eventId, nextState)
  sparkNotifyStates.value = nextMap
}

function updateSparkNotifyState(eventId: string, updater: (state: SparkNotifyEntryState) => SparkNotifyEntryState) {
  const current = sparkNotifyStates.value.get(eventId)
  if (!current)
    return
  setSparkNotifyState(updater(current))
}

function summarizeServerEvent(event: { type: string, data: Record<string, any> }) {
  switch (event.type) {
    case 'module:announce':
      return `name=${event.data.name} events=${event.data.possibleEvents?.length ?? 0}`
    case 'spark:notify':
      return [
        event.data.headline ? `headline="${truncateText(String(event.data.headline), 120)}"` : '',
        event.data.destinations ? `destinations="${truncateText(formatDestinations(event.data.destinations), 120)}"` : '',
      ].filter(Boolean).join(' ')
    case 'spark:emit':
      return [
        event.data.state ? `state=${event.data.state}` : '',
        event.data.destinations ? `destinations="${truncateText(formatDestinations(event.data.destinations), 120)}"` : '',
      ].filter(Boolean).join(' ')
    case 'spark:command':
      return [
        event.data.intent ? `intent=${event.data.intent}` : '',
        event.data.priority ? `priority=${event.data.priority}` : '',
        event.data.destinations ? `destinations="${truncateText(formatDestinations(event.data.destinations), 120)}"` : '',
      ].filter(Boolean).join(' ')
    default:
      if (event.data.text)
        return `text="${truncateText(String(event.data.text), 120)}"`
      if (event.data.transcription)
        return `transcription="${truncateText(String(event.data.transcription), 120)}"`
      return ''
  }
}

function buildSearchText(entry: Omit<FlowEntry, 'searchText'>) {
  const payloadText = typeof entry.payload === 'string'
    ? entry.payload
    : (() => {
        try {
          return JSON.stringify(entry.payload)
        }
        catch {
          return ''
        }
      })()
  return [
    entry.direction,
    entry.channel,
    entry.type,
    entry.summary ?? '',
    payloadText,
  ].join(' ').toLowerCase()
}

let entryId = 0
function pushEntry(entry: Omit<FlowEntry, 'id' | 'timestamp' | 'searchText'>) {
  const normalizedPayload = normalizePayload(entry.payload)
  const nextEntry: FlowEntry = {
    ...entry,
    id: entryId++,
    timestamp: Date.now(),
    payload: normalizedPayload,
    searchText: '',
  }
  nextEntry.searchText = buildSearchText(nextEntry)

  entries.value.push(nextEntry)
  if (entries.value.length > maxEntriesValue.value)
    entries.value.splice(0, entries.value.length - maxEntriesValue.value)
}

function clearEntries() {
  entries.value = []
}

function sendTestContextUpdate() {
  const text = testPayload.value.trim()
  if (!text)
    return

  serverChannelStore.sendContextUpdate({
    strategy: testStrategy.value,
    text,
  })

  pushEntry({
    direction: 'outgoing',
    channel: 'devtools',
    type: 'context:update',
    summary: `strategy=${testStrategy.value} length=${text.length}`,
    payload: { strategy: testStrategy.value, text },
  })
}

async function sendTestSparkNotify() {
  const raw = testSparkNotifyPayload.value.trim()
  if (!raw)
    return

  let parsed: any
  try {
    parsed = JSON.parse(raw)
  }
  catch (err) {
    toast(`Invalid spark:notify: ${errorMessageFrom(err)}`)
    return
  }

  const destinations = Array.isArray(parsed?.destinations) ? parsed.destinations.filter((d: unknown) => typeof d === 'string') : []
  if (!parsed?.headline || !destinations.length) {
    toast('Missing required fields (headline, destinations[]) for spark:notify')
    return
  }

  // TODO(@nekomeowww): improve server event, support to have zod or valibot schema validation for better cross runtime handling
  const notify = {
    id: typeof parsed.id === 'string' && parsed.id ? parsed.id : nanoid(),
    eventId: typeof parsed.eventId === 'string' && parsed.eventId ? parsed.eventId : nanoid(),
    lane: typeof parsed.lane === 'string' ? parsed.lane : undefined,
    kind: parsed.kind === 'alarm' || parsed.kind === 'ping' || parsed.kind === 'reminder' ? parsed.kind : 'ping',
    urgency: parsed.urgency === 'immediate' || parsed.urgency === 'soon' || parsed.urgency === 'later' ? parsed.urgency : 'immediate',
    headline: String(parsed.headline),
    note: typeof parsed.note === 'string' ? parsed.note : undefined,
    payload: parsed.payload && typeof parsed.payload === 'object' ? parsed.payload : undefined,
    ttlMs: typeof parsed.ttlMs === 'number' ? parsed.ttlMs : undefined,
    requiresAck: typeof parsed.requiresAck === 'boolean' ? parsed.requiresAck : undefined,
    destinations,
    metadata: parsed.metadata && typeof parsed.metadata === 'object' ? parsed.metadata : undefined,
  }

  const simulatedEvent: WebSocketEventOf<'spark:notify'> = {
    type: 'spark:notify',
    source: 'devtools',
    data: notify,
  }

  pushEntry({
    direction: 'incoming',
    channel: 'server',
    type: 'spark:notify',
    summary: summarizeServerEvent(simulatedEvent as any),
    payload: simulatedEvent,
  })

  try {
    setSparkNotifyState({
      eventId: notify.id,
      sparkId: notify.eventId,
      handling: true,
      commands: [],
      reaction: '',
      startedAt: Date.now(),
    })

    const result = await characterOrchestratorStore.handleSparkNotify(simulatedEvent)
    const reaction = getSparkNotifyReaction(notify.id)
    updateSparkNotifyState(notify.id, current => ({
      ...current,
      sparkId: notify.eventId,
      handling: false,
      commands: result?.commands ?? [],
      reaction: reaction?.message ?? '',
      endedAt: Date.now(),
    }))

    if (result?.commands?.length) {
      for (const command of result.commands) {
        serverChannelStore.send({
          type: 'spark:command',
          data: command,
        })
      }
    }
  }
  catch (error) {
    toast(`Error handling spark:notify: ${errorMessageFrom(error)}`)
    updateSparkNotifyState(notify.id, current => ({
      ...current,
      handling: false,
      endedAt: Date.now(),
      error: errorMessageFrom(error),
    }))
  }
}

const { data: incomingContext } = useBroadcastChannel<ContextMessage, ContextMessage>({
  name: CONTEXT_CHANNEL_NAME,
})
const { data: incomingStreamEvent } = useBroadcastChannel<ChatStreamEvent, ChatStreamEvent>({
  name: CHAT_STREAM_CHANNEL_NAME,
})

const cleanupFns: Array<() => void> = []

onMounted(() => {
  cleanupFns.push(serverChannelStore.onContextUpdate((event) => {
    pushEntry({
      direction: 'incoming',
      channel: 'server',
      type: event.type,
      summary: [
        `source=${getEventSourceKey(event)}`,
        `strategy=${event.data.strategy}`,
        summarizeContextUpdate(event.data),
      ].filter(Boolean).join(' '),
      payload: event,
    })
  }))

  const serverEventTypes = [
    'module:announce',
    'module:configure',
    'module:authenticated',
    'error',
    'spark:notify',
    'spark:emit',
    'spark:command',
    'input:text',
    'input:text:voice',
    'output:gen-ai:chat:message',
    'output:gen-ai:chat:complete',
    'output:gen-ai:chat:tool-call',
  ] as const

  for (const type of serverEventTypes) {
    cleanupFns.push(serverChannelStore.onEvent(type, (event) => {
      if (event.type === 'spark:notify') {
        const eventId = (event as WebSocketBaseEvent<'spark:notify', WebSocketEvents['spark:notify']>).data?.id
        if (eventId && !sparkNotifyStates.value.has(eventId)) {
          const sparkId = (event as WebSocketBaseEvent<'spark:notify', WebSocketEvents['spark:notify']>).data?.eventId
          setSparkNotifyState({
            eventId,
            sparkId,
            handling: true,
            commands: [],
            reaction: '',
            startedAt: Date.now(),
          })
        }
      }

      pushEntry({
        direction: 'incoming',
        channel: 'server',
        type: event.type,
        summary: summarizeServerEvent(event as any),
        payload: event,
      })
    }))
  }

  cleanupFns.push(
    chatStore.onBeforeMessageComposed(async (message, context) => {
      pushEntry({
        direction: 'outgoing',
        channel: 'chat',
        type: 'before-compose',
        summary: truncateText(message),
        payload: { message, context },
      })
    }),
    chatStore.onAfterMessageComposed(async (message, context) => {
      pushEntry({
        direction: 'outgoing',
        channel: 'chat',
        type: 'after-compose',
        summary: truncateText(message),
        payload: { message, context },
      })
    }),
    chatStore.onBeforeSend(async (message, context) => {
      pushEntry({
        direction: 'outgoing',
        channel: 'chat',
        type: 'before-send',
        summary: truncateText(message),
        payload: { message, context },
      })
    }),
    chatStore.onAfterSend(async (message, context) => {
      pushEntry({
        direction: 'outgoing',
        channel: 'chat',
        type: 'after-send',
        summary: truncateText(message),
        payload: { message, context },
      })
    }),
    chatStore.onTokenLiteral(async (literal, context) => {
      pushEntry({
        direction: 'outgoing',
        channel: 'chat',
        type: 'token-literal',
        summary: truncateText(literal, 80),
        payload: { literal, context },
      })
    }),
    chatStore.onTokenSpecial(async (special, context) => {
      pushEntry({
        direction: 'outgoing',
        channel: 'chat',
        type: 'token-special',
        summary: truncateText(special, 80),
        payload: { special, context },
      })
    }),
    chatStore.onStreamEnd(async (context) => {
      pushEntry({
        direction: 'outgoing',
        channel: 'chat',
        type: 'stream-end',
        summary: 'stream completed',
        payload: { context },
      })
    }),
    chatStore.onAssistantResponseEnd(async (message, context) => {
      pushEntry({
        direction: 'outgoing',
        channel: 'chat',
        type: 'assistant-end',
        summary: truncateText(message),
        payload: { message, context },
      })
    }),
    chatStore.onAssistantMessage(async (message, messageText, context) => {
      pushEntry({
        direction: 'outgoing',
        channel: 'chat',
        type: 'assistant-message',
        summary: truncateText(messageText),
        payload: { message, messageText, context },
      })
    }),
    chatStore.onChatTurnComplete(async (chat, context) => {
      pushEntry({
        direction: 'outgoing',
        channel: 'chat',
        type: 'chat-turn-complete',
        summary: truncateText(chat.outputText),
        payload: { chat, context },
      })
    }),
  )
})

watch(incomingContext, (event) => {
  if (!event)
    return

  pushEntry({
    direction: 'incoming',
    channel: 'broadcast',
    type: 'context:broadcast',
    summary: [
      `source=${getEventSourceKey(event)}`,
      `strategy=${event.strategy}`,
      summarizeContextUpdate(event),
    ].filter(Boolean).join(' '),
    payload: event,
  })
})

watch(incomingStreamEvent, (event) => {
  if (!event)
    return

  pushEntry({
    direction: 'incoming',
    channel: 'broadcast',
    type: `stream:${event.type}`,
    summary: event.type === 'token-literal'
      ? truncateText(event.literal, 80)
      : event.type === 'token-special'
        ? truncateText(event.special, 80)
        : event.type === 'assistant-message'
          ? truncateText(event.messageText ?? '', 120)
          : `session=${event.sessionId}`,
    payload: event,
  })
})

watch(() => characterStore.reactions.length, () => {
  for (const state of sparkNotifyStates.value.values()) {
    if (state.reaction)
      continue
    const reaction = getSparkNotifyReaction(state.eventId)
    if (!reaction)
      continue
    updateSparkNotifyState(state.eventId, current => ({
      ...current,
      reaction: reaction.message,
      handling: false,
      endedAt: current.endedAt ?? Date.now(),
    }))
  }
})

watch(maxEntriesValue, () => {
  if (entries.value.length > maxEntriesValue.value)
    entries.value.splice(0, entries.value.length - maxEntriesValue.value)
})

onUnmounted(() => {
  for (const cleanup of cleanupFns)
    cleanup()
})
</script>

<template>
  <div :class="['flex', 'flex-col', 'gap-6']">
    <Callout label="Context Flow">
      Inspect incoming context updates (server + broadcast) and outgoing chat hooks in real time. Use this to verify
      how plugin context (e.g. VSCode coding context) travels into the chat pipeline and out to server events.
    </Callout>

    <div :class="['grid', 'gap-6', 'lg:grid-cols-[360px_1fr]']">
      <ContextFlowFilters
        v-model:direction-filter="directionFilter"
        v-model:show-incoming="showIncoming"
        v-model:show-outgoing="showOutgoing"
        v-model:show-server="showServer"
        v-model:show-broadcast="showBroadcast"
        v-model:show-chat="showChat"
        v-model:show-devtools="showDevtools"
        v-model:max-entries="maxEntries"
        @clear="clearEntries"
      />

      <div :class="['flex', 'flex-col', 'gap-2']">
        <ContextFlowActions
          v-model:test-strategy="testStrategy"
          v-model:test-payload="testPayload"
          v-model:test-spark-notify-payload="testSparkNotifyPayload"
          v-model:attention-tick-interval="characterOrchestratorStore.attentionConfig.tickIntervalMs"
          v-model:attention-task-window="characterOrchestratorStore.attentionConfig.taskNotifyWindowMs"
          v-model:attention-requeue-delay="characterOrchestratorStore.attentionConfig.requeueDelayMs"
          v-model:attention-max-attempts="characterOrchestratorStore.attentionConfig.maxAttempts"
          @send-context-update="sendTestContextUpdate"
          @send-spark-notify="sendTestSparkNotify"
        />

        <ContextFlowStream
          v-model:filter-text="filterText"
          :entries="filteredEntries"
          :get-spark-notify-state="getSparkNotifyEntryState"
        />
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.devtools.pages.context-flow.title
  subtitleKey: tamagotchi.settings.devtools.title
</route>
