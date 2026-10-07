<script setup lang="ts">
import { BasicTextarea, Button } from '@proj-airi/ui'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useChatSessionStore } from '../../../../stores/chat/session-store'
import { useAiriCardStore } from '../../../../stores/modules/airi-card'
import { useVoiceControlsStore } from '../../../../stores/voice-controls'

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

async function send() {
  if (!draft.value || sending.value)
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
</script>

<template>
  <section v-if="draft" :aria-label="t('stage.chat.voice-draft.title')" :class="['flex flex-col gap-2 rounded-xl p-3', 'bg-neutral-100/90 text-neutral-900 dark:bg-neutral-900/90 dark:text-neutral-100']">
    <div :class="['flex items-center gap-2 text-sm']">
      <span>{{ t('stage.chat.voice-draft.title') }}</span>
      <span v-if="characterName">{{ characterName }}</span>
      <Button
        v-for="(item, index) in controls.snapshot.drafts"
        :key="item.id"
        size="sm"
        :disabled="sending || item.id === draft.id"
        :aria-label="t('stage.chat.voice-draft.select', { number: index + 1 })"
        @click="select(item.id)"
      >
        {{ index + 1 }}
      </Button>
    </div>
    <BasicTextarea v-model="text" :disabled="sending || !controls.snapshot.connected" :aria-label="t('stage.chat.voice-draft.title')" />
    <p v-if="controls.error" role="alert" :class="['text-sm text-red-600 dark:text-red-400']">
      {{ controls.error }}
    </p>
    <div :class="['flex justify-end gap-2']">
      <Button :disabled="sending" size="sm" @click="discard">
        {{ t('stage.chat.voice-draft.discard') }}
      </Button>
      <Button :disabled="sending || !text.trim() || !controls.snapshot.connected" size="sm" variant="primary" @click="send">
        {{ t('stage.chat.actions.send') }}
      </Button>
    </div>
  </section>
</template>
