<script setup lang="ts">
import { BasicButton, BasicTextarea, Button, GhostButton } from '@proj-airi/ui'
import { computed, ref } from 'vue'
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
const canSend = computed(() => !sending.value && !!text.value.trim() && controls.snapshot.connected)

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
    v-if="draft && props.variant === 'composer'"
    :aria-label="t('stage.chat.voice-draft.title')"
    :class="['h-full min-h-0 w-full flex flex-col gap-1']"
  >
    <BasicTextarea
      v-model="text"
      :submit-on-enter="false"
      :disabled="sending || !controls.snapshot.connected"
      :aria-label="t('stage.chat.voice-draft.title')"
      :class="[
        'min-h-0 w-full flex-1 resize-none overflow-y-auto border-0 bg-transparent px-2 py-2 font-medium outline-none [scrollbar-gutter:stable]',
        'text-neutral-700 dark:text-neutral-200',
        '[-webkit-app-region:no-drag]',
      ]"
      @keydown="handleKeydown"
    />
    <p v-if="controls.error" role="alert" :class="['px-2 text-sm text-red-600 dark:text-red-400']">
      {{ controls.error }}
    </p>
    <div :class="['flex shrink-0 items-center gap-1 pt-1']">
      <span v-if="characterName" :class="['max-w-32 truncate px-2 text-xs text-neutral-500 dark:text-neutral-400']">
        {{ characterName }}
      </span>
      <div v-if="controls.snapshot.drafts.length > 1" :class="['min-w-0 flex items-center gap-1 overflow-x-auto scrollbar-none', '[-webkit-app-region:no-drag]']">
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
      <div :class="['ml-auto flex shrink-0 items-center gap-1', '[-webkit-app-region:no-drag]']">
        <GhostButton
          size="unset"
          :class="['size-9']"
          :disabled="sending"
          :title="t('stage.chat.voice-draft.discard')"
          :aria-label="t('stage.chat.voice-draft.discard')"
          @click="discard"
        >
          <span :class="['i-solar:trash-bin-minimalistic-linear size-5']" />
        </GhostButton>
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
