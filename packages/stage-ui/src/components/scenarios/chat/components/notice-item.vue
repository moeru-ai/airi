<script setup lang="ts">
import type { ChatHistoryItem } from '../../../../types/chat'

import { terminalNoticeSchema } from '@proj-airi/stage-shared/terminal-approval'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import * as v from 'valibot'

import HitPill from './hit-pill.vue'

import { extractMessageText } from '../../../../libs/chat-sync'

/** A stored notice, for example a finished background task. The owner did not write it, so it shows as a pill in the middle with its text folded. */
const props = withDefaults(defineProps<{
  message: Extract<ChatHistoryItem, { role: 'user' }>
  /** How the notice paints its background; see `ChatHistory`'s `surface`. */
  surface?: 'translucent' | 'opaque'
}>(), {
  surface: 'translucent',
})

const { t } = useI18n()

// A background task names itself `recipe:<name>`. Other sources show as they are.
const sourceName = computed(() => props.message.notice?.source.replace(/^recipe:/, '') ?? '')
const text = computed(() => extractMessageText(props.message))
const terminal = computed(() => {
  if (props.message.notice?.source !== 'airi:terminal-settlement')
    return undefined
  try {
    const result = v.safeParse(terminalNoticeSchema, JSON.parse(text.value.slice(text.value.lastIndexOf('\n') + 1)))
    return result.success ? result.output : undefined
  }
  catch {
    return undefined
  }
})
</script>

<template>
  <HitPill :class="['py-1']" align="center" :icons="['i-mingcute:notification-fill']" :surface="props.surface">
    <template #label>
      {{ terminal ? t(`settings.pages.modules.mcp-server.terminal.result.${terminal.status}`) : t('stage.chat.notice.label', { name: sourceName }) }}
    </template>
    <!-- A notice without text has nothing to unfold. -->
    <template v-if="text" #default>
      <div v-if="terminal" :class="['rounded-lg px-2.5 py-2 text-xs', 'bg-white/75 dark:bg-neutral-800/60']">
        <pre :class="['m-0 whitespace-pre-wrap break-words']">{{ terminal.command }}</pre>
        <p :class="['break-all']">
          {{ terminal.effectiveCwd }}
        </p>
        <p>Session {{ terminal.sessionId }} · Action {{ terminal.actionId }}</p>
        <details>
          <summary>{{ t('settings.pages.modules.mcp-server.terminal.details') }}</summary>
          <pre :class="['whitespace-pre-wrap break-words']">{{ text }}</pre>
        </details>
      </div>
      <p v-else :class="['m-0 rounded-lg px-2.5 py-2 text-xs', 'whitespace-pre-wrap break-words', 'bg-white/75 dark:bg-neutral-800/60']">
        {{ text }}
      </p>
    </template>
  </HitPill>
</template>
