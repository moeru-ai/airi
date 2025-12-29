<script setup lang="ts">
import type { ChatStreamEvent, ContextMessage } from '@proj-airi/stage-ui/types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { Callout, Section } from '@proj-airi/stage-ui/components'
import { CHAT_STREAM_CHANNEL_NAME, CONTEXT_CHANNEL_NAME, useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useModsServerChannelStore } from '@proj-airi/stage-ui/stores/mods/api/channel-server'
import { Button, FieldCheckbox, FieldInput, FieldTextArea, Input, SelectTab } from '@proj-airi/ui'
import { useBroadcastChannel } from '@vueuse/core'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

type FlowDirection = 'incoming' | 'outgoing'
type FlowChannel = 'server' | 'broadcast' | 'chat' | 'devtools'

interface FlowEntry {
  id: number
  timestamp: number
  direction: FlowDirection
  channel: FlowChannel
  type: string
  summary?: string
  payload?: unknown
  searchText: string
}

const chatStore = useChatStore()
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

const streamContainer = ref<HTMLDivElement>()

const directionOptions = [
  { label: 'All', value: 'all' },
  { label: 'Incoming', value: 'incoming' },
  { label: 'Outgoing', value: 'outgoing' },
]

const directionFilter = ref<'all' | FlowDirection>('all')
const previewMaxLength = 420

interface PreviewItem {
  label: string
  value: string
}

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

function truncateText(value: string, limit = 160) {
  if (value.length <= limit)
    return value
  return `${value.slice(0, limit)}...`
}

function formatDestinations(destinations: unknown) {
  if (!destinations)
    return ''
  if (Array.isArray(destinations))
    return destinations.join(', ')
  if (typeof destinations === 'string')
    return destinations
  try {
    return JSON.stringify(destinations)
  }
  catch {
    return String(destinations)
  }
}

function getPayloadData(entry: FlowEntry) {
  const payload = entry.payload as Record<string, any> | undefined
  if (!payload)
    return undefined
  return payload.data ?? payload
}

function getEventSource(entry: FlowEntry) {
  const payload = entry.payload as Record<string, any> | undefined
  if (!payload)
    return undefined
  return payload.source as string | undefined
}

function summarizeContextUpdate(update: { text?: string, content?: unknown, destinations?: unknown }) {
  const summaryParts: string[] = []
  if (update.text) {
    summaryParts.push(`text="${truncateText(update.text, 120)}"`)
  }
  if (update.content !== undefined) {
    const contentText = typeof update.content === 'string'
      ? update.content
      : (() => {
          try {
            return JSON.stringify(update.content)
          }
          catch {
            return '[unserializable]'
          }
        })()
    summaryParts.push(`content="${truncateText(contentText, 120)}"`)
  }
  if (update.destinations !== undefined) {
    summaryParts.push(`destinations="${truncateText(formatDestinations(update.destinations), 120)}"`)
  }
  return summaryParts.join(' ')
}

function toPreviewValue(value: unknown) {
  if (value === undefined || value === null)
    return ''
  if (typeof value === 'string')
    return value
  try {
    return JSON.stringify(value, null, 2)
  }
  catch {
    return String(value)
  }
}

function formatPreviewValue(value: unknown) {
  const text = toPreviewValue(value)
  if (!text)
    return ''
  return truncateText(text, previewMaxLength)
}

function getContextUpdatePreview(entry: FlowEntry) {
  const candidate = getPayloadData(entry) as Record<string, any> | undefined
  if (!candidate || (candidate.text === undefined && candidate.content === undefined && candidate.destinations === undefined))
    return null
  return {
    text: candidate.text as string | undefined,
    content: candidate.content as unknown,
    destinations: candidate.destinations as unknown,
  }
}

function buildPreviewItems(entry: FlowEntry): PreviewItem[] {
  const items: PreviewItem[] = []
  const contextPreview = getContextUpdatePreview(entry)
  if (contextPreview) {
    if (contextPreview.text) {
      items.push({ label: 'Text', value: formatPreviewValue(contextPreview.text) })
    }
    if (contextPreview.content !== undefined) {
      items.push({ label: 'Content', value: formatPreviewValue(contextPreview.content) })
    }
    if (contextPreview.destinations !== undefined) {
      items.push({ label: 'Destinations', value: formatPreviewValue(formatDestinations(contextPreview.destinations)) })
    }
    return items
  }

  const payload = getPayloadData(entry) as Record<string, any> | undefined
  if (payload?.destinations !== undefined) {
    items.push({ label: 'Destinations', value: formatPreviewValue(formatDestinations(payload.destinations)) })
  }
  if (entry.type.startsWith('spark:')) {
    if (payload?.headline)
      items.push({ label: 'Headline', value: formatPreviewValue(payload.headline) })
    if (payload?.state)
      items.push({ label: 'State', value: formatPreviewValue(payload.state) })
    if (payload?.intent)
      items.push({ label: 'Intent', value: formatPreviewValue(payload.intent) })
  }
  if (payload?.messageText) {
    items.push({ label: 'Message', value: formatPreviewValue(payload.messageText) })
  }
  else if (payload?.literal) {
    items.push({ label: 'Token', value: formatPreviewValue(payload.literal) })
  }
  else if (payload?.special) {
    items.push({ label: 'Token', value: formatPreviewValue(payload.special) })
  }
  else if (payload?.message) {
    items.push({ label: 'Message', value: formatPreviewValue(payload.message) })
  }
  else if (payload?.name && entry.type === 'module:announce') {
    items.push({ label: 'Module', value: formatPreviewValue(payload.name) })
  }
  else if (payload?.text) {
    items.push({ label: 'Text', value: formatPreviewValue(payload.text) })
  }
  else if (payload?.transcription) {
    items.push({ label: 'Transcription', value: formatPreviewValue(payload.transcription) })
  }
  else if (entry.summary) {
    items.push({ label: 'Summary', value: formatPreviewValue(entry.summary) })
  }

  return items
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

function formatTimestamp(value: number) {
  const date = new Date(value)
  return date.toLocaleTimeString('en-US', { hour12: false })
}

function formatPayload(payload: unknown) {
  if (payload === undefined)
    return '-'
  if (typeof payload === 'string')
    return payload
  try {
    return JSON.stringify(payload, null, 2)
  }
  catch {
    return String(payload)
  }
}

function directionBadgeClasses(direction: FlowDirection) {
  if (direction === 'incoming') {
    return [
      'bg-complementary-500/15',
      'text-complementary-600',
      'dark:text-complementary-300',
      'border-complementary-500/30',
    ]
  }
  return [
    'bg-primary-500/15',
    'text-primary-600',
    'dark:text-primary-300',
    'border-primary-500/30',
  ]
}

function directionIconClass(direction: FlowDirection) {
  return direction === 'incoming' ? 'i-solar:arrow-down-linear' : 'i-solar:arrow-up-linear'
}

function channelBadgeClasses(channel: FlowChannel) {
  switch (channel) {
    case 'server':
      return ['bg-orange-500/15', 'text-orange-600', 'dark:text-orange-300', 'border-orange-500/30']
    case 'broadcast':
      return ['bg-violet-500/15', 'text-violet-600', 'dark:text-violet-300', 'border-violet-500/30']
    case 'chat':
      return ['bg-lime-500/15', 'text-lime-600', 'dark:text-lime-300', 'border-lime-500/30']
    default:
      return ['bg-neutral-400/15', 'text-neutral-600', 'dark:text-neutral-300', 'border-neutral-500/30']
  }
}

function sourceBadgeClasses() {
  return ['bg-neutral-400/15', 'text-neutral-600', 'dark:text-neutral-300', 'border-neutral-500/30']
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
        `source=${event.source}`,
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
      `source=${event.source}`,
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

watch(() => entries.value.length, async () => {
  await nextTick()
  if (streamContainer.value)
    streamContainer.value.scrollTop = 0
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
      <div :class="['flex', 'flex-col', 'gap-6', 'rounded-xl', 'bg-neutral-50', 'p-4', 'dark:bg-[rgba(0,0,0,0.3)]', 'h-fit']">
        <div :class="['flex', 'items-center', 'gap-2', 'text-sm', 'font-semibold', 'text-neutral-600', 'dark:text-neutral-300']">
          <div :class="['size-5', 'i-solar:filter-bold-duotone']" />
          Filters
        </div>
        <div :class="['flex', 'flex-col', 'gap-3']">
          <div :class="['flex', 'flex-col', 'gap-2', 'w-full']">
            <div :class="['text-xs', 'font-medium', 'text-neutral-500', 'dark:text-neutral-400']">
              Direction
            </div>
            <SelectTab
              v-model="directionFilter"
              size="sm"
              :options="directionOptions"
            />
          </div>
          <div :class="['flex', 'flex-col', 'gap-2', 'w-full']">
            <div :class="['text-xs', 'font-medium', 'text-neutral-500', 'dark:text-neutral-400']">
              Visibility
            </div>
            <div :class="['flex', 'flex-wrap', 'gap-2']">
              <FieldCheckbox v-model="showIncoming" label="Show incoming" />
              <FieldCheckbox v-model="showOutgoing" label="Show outgoing" />
            </div>
          </div>
          <div :class="['flex', 'flex-col', 'gap-2', 'w-full']">
            <div :class="['text-xs', 'font-medium', 'text-neutral-500', 'dark:text-neutral-400']">
              Channels
            </div>
            <div :class="['flex', 'flex-wrap', 'gap-2']">
              <FieldCheckbox v-model="showServer" label="Server" />
              <FieldCheckbox v-model="showBroadcast" label="Broadcast" />
              <FieldCheckbox v-model="showChat" label="Chat" />
              <FieldCheckbox v-model="showDevtools" label="Devtools" />
            </div>
          </div>
          <div :class="['flex', 'flex-col', 'gap-2', 'w-full']">
            <FieldInput
              v-model="maxEntries"
              label="Max entries"
              description="50-1000 (default 200)"
              type="number"
            />
          </div>
          <div :class="['flex', 'items-end', 'justify-end', 'w-full']">
            <Button label="Clear" icon="i-solar:trash-bin-trash-bold-duotone" size="sm" @click="clearEntries" />
          </div>
        </div>
      </div>

      <div :class="['flex', 'flex-col', 'gap-2']">
        <Section title="Send" icon="i-solar:plain-2-bold-duotone" inner-class="gap-3" :expand="false">
          <div :class="['flex', 'flex-col', 'gap-2']">
            <div :class="['text-xs', 'font-medium', 'text-neutral-500', 'dark:text-neutral-400']">
              Strategy
            </div>
            <SelectTab
              v-model="testStrategy"
              size="sm"
              :options="[
                { label: 'Replace', value: ContextUpdateStrategy.ReplaceSelf },
                { label: 'Append', value: ContextUpdateStrategy.AppendSelf },
              ]"
            />
            <FieldTextArea
              v-model="testPayload"
              label="Payload"
              description="Raw text payload sent as ContextUpdate.text. JSON is allowed."
              :input-class="['font-mono', 'min-h-32']"
            />
            <div :class="['flex', 'justify-end']">
              <Button label="Send context update" icon="i-solar:plain-2-bold-duotone" size="sm" @click="sendTestContextUpdate" />
            </div>
          </div>
        </Section>

        <div :class="['flex']">
          <Input
            v-model="filterText"
            placeholder="Search type, source, text..."
          />
        </div>
        <div
          ref="streamContainer"
          :class="[
            'max-h-[60vh]',
            'min-h-[360px]',
            'overflow-y-auto',
            'rounded-lg',
            'bg-white/70',
            'p-3',
            'dark:bg-neutral-950/50',
          ]"
        >
          <div
            v-if="!filteredEntries.length"
            :class="['h-full', 'w-full', 'flex', 'items-center', 'justify-center', 'text-sm', 'text-neutral-500', 'dark:text-neutral-400']"
          >
            No data yet. Trigger a chat, send a context update, or enable broadcast capture.
          </div>
          <div v-else v-auto-animate :class="['grid', 'gap-3']">
            <div
              v-for="entry in filteredEntries"
              :key="entry.id"
              :class="[
                'rounded-xl',
                'border',
                'border-neutral-200/70',
                'bg-neutral-50/80',
                'p-4',
                'shadow-sm',
                'dark:border-neutral-800/80',
                'dark:bg-neutral-950/60',
              ]"
            >
              <div :class="['flex', 'items-start', 'justify-between', 'gap-3']">
                <div :class="['flex', 'flex-wrap', 'items-center', 'gap-2', 'text-xs']">
                  <span :class="['rounded-full', 'border', 'px-2', 'py-0.5', 'flex', 'items-center', 'justify-center', ...directionBadgeClasses(entry.direction)]">
                    <span :class="['size-3.5', directionIconClass(entry.direction)]" :aria-label="entry.direction" />
                  </span>
                  <span :class="['rounded-full', 'border', 'px-2', 'py-0.5', ...channelBadgeClasses(entry.channel)]">
                    {{ entry.channel }}
                  </span>
                  <span
                    v-if="getEventSource(entry)"
                    :class="['rounded-full', 'border', 'px-2', 'py-0.5', ...sourceBadgeClasses()]"
                  >
                    {{ getEventSource(entry) }}
                  </span>
                  <span :class="['font-semibold', 'text-neutral-800', 'dark:text-neutral-100']">
                    {{ entry.type }}
                  </span>
                </div>
                <span :class="['font-mono', 'text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
                  {{ formatTimestamp(entry.timestamp) }}
                </span>
              </div>

              <div v-if="entry.summary" :class="['mt-2', 'text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
                {{ entry.summary }}
              </div>

              <div :class="['mt-3', 'grid', 'gap-2']">
                <div :class="['text-[11px]', 'uppercase', 'tracking-[0.08em]', 'text-neutral-400', 'dark:text-neutral-500']">
                  Preview
                </div>
                <div v-if="buildPreviewItems(entry).length" :class="['grid', 'gap-2', 'sm:grid-cols-2']">
                  <div
                    v-for="item in buildPreviewItems(entry)"
                    :key="`${entry.id}-${item.label}`"
                    :class="[
                      'rounded-lg',
                      'border',
                      'border-neutral-200/70',
                      'bg-white/80',
                      'p-3',
                      'dark:border-neutral-800/80',
                      'dark:bg-neutral-900/70',
                    ]"
                  >
                    <div :class="['text-[11px]', 'uppercase', 'tracking-[0.06em]', 'text-neutral-400', 'dark:text-neutral-500']">
                      {{ item.label }}
                    </div>
                    <pre :class="['mt-2', 'max-h-40', 'overflow-auto', 'whitespace-pre-wrap', 'break-words', 'text-xs', 'font-mono', 'text-neutral-800', 'dark:text-neutral-100']">
{{ item.value || '-' }}
                    </pre>
                  </div>
                </div>
                <div v-else :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
                  No preview available.
                </div>
              </div>

              <details :class="['mt-3']">
                <summary :class="['cursor-pointer', 'text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
                  Details
                </summary>
                <pre :class="['mt-2', 'max-h-64', 'overflow-auto', 'rounded-lg', 'bg-neutral-900/90', 'p-3', 'text-xs', 'text-neutral-100']">
{{ formatPayload(entry.payload) }}
                </pre>
              </details>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
</route>
