<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { BasicTextarea } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { electronVoiceInlayHide, electronVoiceInlayShow } from '../../../shared/eventa'
import { useVoiceInlayStore } from '../../stores/voice-inlay'

const inlay = useVoiceInlayStore()
const cards = useAiriCardStore()
const chat = useChatStore()
const hideWindow = useElectronEventaInvoke(electronVoiceInlayHide)
const showWindow = useElectronEventaInvoke(electronVoiceInlayShow)
const { t } = useI18n()

const draft = computed(() => inlay.activeDraft)
const isTranscribing = computed(() => inlay.transcribingSessionId === draft.value?.sessionId)
const draftText = computed({
  get: () => draft.value?.text ?? '',
  set: (text: string) => {
    if (draft.value)
      inlay.editVoiceDraft(draft.value.sessionId, text)
  },
})
const characterName = computed(() => cards.getCard(draft.value?.cardId ?? '')?.name ?? '')
async function hideIfIdle() {
  if (!inlay.activeDraft && !inlay.recordingCardId)
    await hideWindow()
}

function discard() {
  if (!draft.value || isTranscribing.value)
    return
  inlay.removeVoiceDraft(draft.value.sessionId)
  void hideIfIdle()
}

function send() {
  const current = draft.value
  if (!current || isTranscribing.value || !current.text.trim())
    return

  const text = current.text.trim()
  inlay.removeVoiceDraft(current.sessionId)
  void hideIfIdle()
  // The leader continues this turn after the inlay restores the earlier draft.
  void chat.send({ sessionId: current.sessionId, text }).catch((error) => {
    inlay.queueVoiceDraft({ ...current, text })
    void showWindow({ focus: true, presentation: 'draft' })
    toast.error(errorMessageFrom(error) ?? 'Could not send the voice draft')
  })
}

function handleKeydown(event: KeyboardEvent) {
  if (event.isComposing)
    return

  if (event.key === 'Escape') {
    event.preventDefault()
    discard()
    return
  }

  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    send()
  }
}
</script>

<template>
  <main
    :aria-busy="isTranscribing"
    :class="[
      'h-full w-full overflow-hidden rounded-2xl bg-transparent',
    ]"
  >
    <BasicTextarea
      v-if="draft"
      v-model="draftText"
      :aria-label="t('tamagotchi.stage.voice-inlay.draft', { name: characterName })"
      :readonly="isTranscribing"
      :submit-on-enter="false"
      default-height="100%"
      autofocus
      aria-keyshortcuts="Enter Escape"
      :class="[
        'block max-h-full w-full resize-none overflow-y-auto rounded-2xl p-4',
        'bg-white/65 text-lg text-neutral-900 shadow-xl shadow-black/15 backdrop-blur-xl',
        'dark:bg-neutral-900/60 dark:text-neutral-50',
        'outline-none focus-visible:shadow-2xl focus-visible:shadow-primary-500/25',
      ]"
      @keydown="handleKeydown"
    />
  </main>
</template>

<route lang="yaml">
meta:
  layout: plain
</route>
