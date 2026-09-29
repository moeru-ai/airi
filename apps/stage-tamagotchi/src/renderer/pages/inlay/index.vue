<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { Button, Textarea } from '@proj-airi/ui'
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
const draftText = computed({
  get: () => draft.value?.text ?? '',
  set: (text: string) => {
    if (draft.value)
      inlay.editVoiceDraft(draft.value.sessionId, text)
  },
})
const characterName = computed(() => cards.getCard(draft.value?.cardId ?? inlay.recordingCardId ?? '')?.name ?? '')
const pendingNames = computed(() => inlay.pendingSessionIds
  .slice(0, -1)
  .map(id => cards.getCard(inlay.drafts[id]?.cardId ?? '')?.name ?? id))

async function hideIfIdle() {
  if (!inlay.activeDraft && !inlay.recordingCardId)
    await hideWindow()
}

function discard() {
  if (!draft.value)
    return
  inlay.removeVoiceDraft(draft.value.sessionId)
  void hideIfIdle()
}

function send() {
  const current = draft.value
  if (!current || !current.text.trim())
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
</script>

<template>
  <main
    v-if="inlay.recordingCardId"
    :class="['h-full w-full flex items-center justify-center']"
    role="status"
  >
    <div
      :class="[
        'max-w-full min-w-0 flex items-center gap-2.5 rounded-full px-4 py-2.5',
        'bg-neutral-900/95 text-white shadow-lg dark:bg-neutral-100/95 dark:text-neutral-900',
      ]"
    >
      <span :class="['size-2.5 shrink-0 animate-pulse rounded-full bg-red-400 motion-reduce:animate-none']" />
      <span :class="['i-solar:microphone-bold size-4 shrink-0']" aria-hidden="true" />
      <span :class="['min-w-0 truncate text-sm font-medium']">{{ t('tamagotchi.stage.voice-inlay.recording') }}</span>
      <span v-if="characterName" :class="['min-w-0 truncate text-xs opacity-70']">{{ characterName }}</span>
    </div>
  </main>
  <main
    v-else
    :class="[
      'h-full flex flex-col gap-3 rounded-xl p-4',
      'border border-solid border-neutral-200 bg-white/95 text-neutral-900 shadow-lg',
      'dark:border-neutral-700 dark:bg-neutral-900/95 dark:text-neutral-50',
    ]"
  >
    <div :class="['flex items-center justify-between gap-2']">
      <div :class="['flex min-w-0 items-center gap-2']">
        <strong :class="['truncate text-sm']">
          {{ t('tamagotchi.stage.voice-inlay.draft', { name: characterName }) }}
        </strong>
      </div>
      <span v-if="inlay.pendingCount" :class="['shrink-0 text-xs text-neutral-500 dark:text-neutral-400']">
        {{ t('tamagotchi.stage.voice-inlay.pending', { count: inlay.pendingCount }) }}
      </span>
    </div>

    <div v-if="pendingNames.length" :class="['truncate text-xs text-neutral-500 dark:text-neutral-400']">
      {{ pendingNames.join(' · ') }}
    </div>

    <template v-if="draft">
      <Textarea
        v-model="draftText"
        :aria-label="t('tamagotchi.stage.voice-inlay.draft', { name: characterName })"
        :class="['min-h-20 flex-1 resize-none']"
      />
      <div :class="['flex justify-end gap-2']">
        <Button :label="t('tamagotchi.stage.voice-inlay.discard')" @click="discard" />
        <Button
          :label="t('tamagotchi.stage.voice-inlay.send')"
          color="primary"
          variant="primary"
          :disabled="!draftText.trim()"
          @click="send"
        />
      </div>
    </template>
  </main>
</template>

<route lang="yaml">
meta:
  layout: plain
</route>
