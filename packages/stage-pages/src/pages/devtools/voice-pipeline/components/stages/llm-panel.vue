<script setup lang="ts">
import type { TurnStages } from '../../composables/turn-stages'
import type { InputRecord } from '../../composables/use-turn-recorder'

import { extractMessageText } from '@proj-airi/stage-ui/libs/chat-sync'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useVoiceStore } from '@proj-airi/stage-ui/stores/voice'
import { Button } from '@proj-airi/ui'
import { computed } from 'vue'

import { formatMs, metaNumber, metaText, spanMs } from '../../composables/turn-stages'

const props = defineProps<{
  stages?: TurnStages
  record?: InputRecord
  /** The end of speech of the selected turn, in milliseconds since the epoch. */
  speechEndTs?: number
}>()

const chat = useChatStore()
const sessions = useChatSessionStore()
const voice = useVoiceStore()

const sessionId = computed(() => props.record?.submission?.sessionId)
const turnId = computed(() => props.record?.turnId)
const llm = computed(() => props.stages?.llm.at(-1))
const firstTokenTs = computed(() => metaNumber(llm.value, 'firstTokenTs'))

/** The assistant messages after the user message of the turn, up to the next user message. */
const reply = computed(() => {
  if (!sessionId.value || !turnId.value)
    return undefined
  const messages = sessions.getSessionMessagesIfLoaded(sessionId.value) ?? []
  const start = messages.findIndex(message => message.role === 'user' && message.id === turnId.value)
  if (start < 0)
    return undefined
  const end = messages.findIndex((message, index) => index > start && message.role === 'user')
  return messages.slice(start + 1, end < 0 ? undefined : end)
    .filter(message => message.role === 'assistant')
    .map(extractMessageText)
    .join('\n')
})

const activeTurn = computed(() => voice.activeTurns.find(turn => turn.turnId === turnId.value))
function cancel() {
  if (activeTurn.value)
    void chat.cancelTurn(activeTurn.value)
}
</script>

<template>
  <div :class="['flex flex-col gap-3']">
    <p :class="['text-xs text-neutral-500 dark:text-neutral-400']">
      The send switch and the chat are above, beside the input mode. The character of the chat chooses the model.
    </p>
    <p v-if="!record?.submission" :class="['text-sm text-neutral-500 dark:text-neutral-400']">
      Select a spoken turn of this page's voice host.
    </p>
    <template v-else>
      <div :class="['flex flex-wrap gap-x-4 gap-y-1 text-sm']">
        <span>Chat {{ (sessionId && sessions.sessionMetas[sessionId]?.title) || sessionId }}</span>
        <span v-if="!turnId" :class="['text-neutral-500']">Not sent: the input was cancelled or failed.</span>
        <span v-else-if="!llm" :class="['text-neutral-500']">No request yet. A dry-run draft waits for Send.</span>
      </div>
      <div v-if="llm" :class="['flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400']">
        <span>Model <span :class="['font-mono']">{{ metaText(llm, 'model') ?? '—' }}</span></span>
        <span>First token {{ formatMs(firstTokenTs === undefined ? undefined : firstTokenTs - llm.startTs) }} after the request</span>
        <span v-if="speechEndTs !== undefined && firstTokenTs !== undefined">{{ formatMs(firstTokenTs - speechEndTs) }} after the speech end</span>
        <span>Request {{ formatMs(spanMs(llm)) }}</span>
        <span>{{ metaNumber(llm, 'output_chunk_count') ?? '—' }} chunks</span>
        <span v-if="llm.error" :class="['text-red-600 dark:text-red-400']">Failed: {{ llm.error }}</span>
        <span v-else-if="llm.meta.cancelled === true" :class="['text-amber-600 dark:text-amber-400']">Cancelled</span>
      </div>
      <div v-if="activeTurn">
        <Button size="sm" icon="i-solar:stop-bold" label="Cancel the reply" @click="cancel" />
      </div>
      <p v-if="reply !== undefined" :class="['whitespace-pre-wrap rounded-lg bg-neutral-100 p-3 text-sm dark:bg-neutral-800']">
        {{ reply || '(no text yet)' }}
      </p>
    </template>
  </div>
</template>
