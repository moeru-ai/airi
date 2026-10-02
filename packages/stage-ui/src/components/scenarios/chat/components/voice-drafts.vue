<script setup lang="ts">
import { BasicButton, BasicTextarea, Button, GhostButton } from '@proj-airi/ui'
import { computed, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useChatSessionStore } from '../../../../stores/chat/session-store'
import { useAiriCardStore } from '../../../../stores/modules/airi-card'
import { useVoiceControlsStore } from '../../../../stores/voice-controls'

const props = withDefaults(defineProps<{
  /**
   * Layout and surface treatment.
   * `card` draws its own panel with labeled actions.
   * `composer` follows the chat composer layout and leaves the surface to the host, such as a vibrancy window.
   * @default 'card'
   */
  variant?: 'card' | 'composer'
}>(), { variant: 'card' })

const { t } = useI18n()
const controls = useVoiceControlsStore()
const sessions = useChatSessionStore()
const cards = useAiriCardStore()
const sending = ref(false)
const draft = computed(() => controls.snapshot.drafts.find(draft => draft.id === controls.snapshot.frontDraftId))
const characterName = computed(() => {
  const characterId = draft.value && sessions.sessionMetas[draft.value.sessionId]?.characterId
  return characterId ? cards.getCard(characterId)?.name : undefined
})
const text = computed({
  get: () => draft.value?.text ?? '',
  set: (value) => {
    if (draft.value)
      void controls.command({ type: 'edit-draft', draftId: draft.value.id, text: value }).catch(() => {})
  },
})
/** Speech that the host is still transcribing. It is shown read-only until it becomes part of a draft. */
const liveInput = computed(() => {
  const input = controls.snapshot.input
  if (!input || (input.phase !== 'capturing' && input.phase !== 'finalizing'))
    return undefined
  return input.segments.some(segment => segment.text.trim()) ? input : undefined
})
/**
 * Final text uses the body color. Interim text uses the theme color, and the newest interim segment is stronger.
 */
const liveSegments = computed(() => {
  const segments = liveInput.value?.segments ?? []
  const latest = segments.findLastIndex(segment => !segment.final)
  return segments.map((segment, index) => ({
    id: segment.id,
    text: segment.text,
    tier: segment.final ? 'final' as const : index === latest ? 'latest' as const : 'interim' as const,
  }))
})
const scroller = useTemplateRef<HTMLElement>('scroller')

// New speech and host draft updates keep the newest text visible. Edits in the textarea do not scroll.
watch(
  () => [draft.value?.id, draft.value?.rawText, liveInput.value?.phase, liveSegments.value.map(segment => segment.text).join('')],
  () => {
    // BasicTextarea sets its new height in an animation frame. This frame runs after it.
    requestAnimationFrame(() => {
      if (scroller.value)
        scroller.value.scrollTop = scroller.value.scrollHeight
    })
  },
  { flush: 'post' },
)

const canSend = computed(() => !sending.value && !liveInput.value && !!text.value.trim() && controls.snapshot.connected)

async function send() {
  if (!draft.value || !canSend.value)
    return
  sending.value = true
  try {
    await controls.command({ type: 'send-draft', draftId: draft.value.id })
  }
  catch {
    // The host retains the draft and the controls store exposes the transport error.
  }
  finally {
    sending.value = false
  }
}

function discard() {
  if (draft.value)
    void controls.command({ type: 'discard-draft', draftId: draft.value.id }).catch(() => {})
}

function select(id: string) {
  void controls.command({ type: 'select-draft', draftId: id }).catch(() => {})
}

function handleKeydown(event: KeyboardEvent) {
  // Enter sends and Shift+Enter adds a line. An IME confirmation keeps the draft.
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing)
    return
  event.preventDefault()
  void send()
}
</script>

<template>
  <section
    v-if="(draft || liveInput) && props.variant === 'composer'"
    :aria-label="t('stage.chat.voice-draft.title')"
    :class="['h-full min-h-0 w-full flex flex-col gap-1']"
  >
    <!-- The editable draft and the read-only live speech share one scroll area, so they read as one text. -->
    <div
      ref="scroller"
      data-testid="voice-draft-scroller"
      :class="[
        'min-h-0 w-full flex-1 overflow-y-auto px-2 py-2 font-medium [scrollbar-gutter:stable]',
        'text-neutral-700 dark:text-neutral-200',
      ]"
    >
      <BasicTextarea
        v-if="draft"
        v-model="text"
        :submit-on-enter="false"
        :disabled="sending || !controls.snapshot.connected"
        :aria-label="t('stage.chat.voice-draft.title')"
        :class="[
          'block w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none',
          '[-webkit-app-region:no-drag]',
        ]"
        @keydown="handleKeydown"
      />
      <!-- v-text keeps template whitespace out of this pre-wrap block. -->
      <p v-if="liveInput" data-testid="voice-draft-live" :class="['m-0 whitespace-pre-wrap break-words']">
        <span
          v-for="segment in liveSegments"
          :key="segment.id"
          :data-tier="segment.tier"
          :class="[
            'transition-colors duration-300 motion-reduce:transition-none',
            segment.tier === 'interim' ? 'text-primary-200/70 dark:text-primary-700/70' : '',
            segment.tier === 'latest' ? 'text-primary-600 dark:text-primary-300' : '',
          ]"
          v-text="segment.text"
        />
      </p>
    </div>
    <p v-if="controls.error" role="alert" :class="['px-2 text-sm text-red-600 dark:text-red-400']">
      {{ controls.error }}
    </p>
    <div :class="['flex shrink-0 items-center gap-1 pt-1']">
      <span v-if="characterName" :class="['max-w-32 truncate px-2 text-xs text-neutral-500 dark:text-neutral-400']">
        {{ characterName }}
      </span>
      <div v-if="controls.snapshot.drafts.length > 1 && draft" :class="['min-w-0 flex items-center gap-1 overflow-x-auto scrollbar-none', '[-webkit-app-region:no-drag]']">
        <GhostButton
          v-for="(item, index) in controls.snapshot.drafts"
          :key="item.id"
          size="unset"
          :class="['size-7 shrink-0 text-xs']"
          :active="item.id === draft.id"
          :aria-pressed="item.id === draft.id"
          :disabled="sending"
          :aria-label="t('stage.chat.voice-draft.select', { number: index + 1 })"
          @click="select(item.id)"
        >
          {{ index + 1 }}
        </GhostButton>
      </div>
      <span v-if="liveInput?.phase === 'finalizing'" role="status" :class="['px-2 text-xs text-neutral-500 dark:text-neutral-400']">
        {{ t('stage.chat.voice-draft.finalizing') }}
      </span>
      <div :class="['ml-auto flex shrink-0 items-center gap-1', '[-webkit-app-region:no-drag]']">
        <BasicButton
          size="unset"
          :disabled="!canSend"
          :title="t('stage.chat.actions.send')"
          :aria-label="t('stage.chat.actions.send')"
          :class="[
            'size-9 rounded-full bg-primary-500 text-white',
            'hover:bg-primary-600 disabled:pointer-events-none disabled:bg-neutral-200 disabled:text-neutral-400 dark:disabled:bg-neutral-700 dark:disabled:text-neutral-500 motion-reduce:transition-none',
          ]"
          @click="send"
        >
          <span :class="['i-solar:arrow-up-outline size-5']" />
        </BasicButton>
      </div>
    </div>
  </section>
  <section
    v-else-if="draft"
    :aria-label="t('stage.chat.voice-draft.title')"
    :class="['min-w-0 w-full flex flex-col gap-2 rounded-xl p-3', 'bg-neutral-100/90 text-neutral-900 dark:bg-neutral-900/90 dark:text-neutral-100']"
  >
    <div :class="['min-w-0 w-full flex items-center gap-2 overflow-x-auto text-sm scrollbar-none']">
      <span :class="['shrink-0']">{{ t('stage.chat.voice-draft.title') }}</span>
      <span v-if="characterName" :class="['max-w-32 shrink-0 truncate']">{{ characterName }}</span>
      <Button
        v-for="(item, index) in controls.snapshot.drafts"
        :key="item.id"
        size="sm"
        :class="['shrink-0']"
        :disabled="sending || item.id === draft.id"
        :aria-label="t('stage.chat.voice-draft.select', { number: index + 1 })"
        @click="select(item.id)"
      >
        {{ index + 1 }}
      </Button>
    </div>
    <BasicTextarea
      v-model="text"
      :submit-on-enter="false"
      :class="['w-full max-w-full']"
      :disabled="sending || !controls.snapshot.connected"
      :aria-label="t('stage.chat.voice-draft.title')"
      @keydown="handleKeydown"
    />
    <p v-if="controls.error" role="alert" :class="['text-sm text-red-600 dark:text-red-400']">
      {{ controls.error }}
    </p>
    <div :class="['flex justify-end gap-2']">
      <Button :disabled="sending" size="sm" @click="discard">
        {{ t('stage.chat.voice-draft.discard') }}
      </Button>
      <Button :disabled="!canSend" size="sm" variant="primary" @click="send">
        {{ t('stage.chat.actions.send') }}
      </Button>
    </div>
  </section>
</template>
