<script setup lang="ts">
import { BasicTextarea, Button } from '@proj-airi/ui'
import { nextTick, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useVoiceDraftEditor } from '../../composables/use-voice-draft-editor'

const { drafts, sessionId, characterName, text, sending, error, edit, discard, send, handleKeydown } = useVoiceDraftEditor()
const { t } = useI18n()
const draftInput = useTemplateRef<InstanceType<typeof BasicTextarea>>('draftInput')
watch(sessionId, async (owner) => {
  if (!owner)
    return
  await nextTick()
  const element: unknown = draftInput.value?.$el
  if (element instanceof HTMLTextAreaElement)
    element.focus()
}, { immediate: true, flush: 'post' })
</script>

<template>
  <main :class="['h-full w-full flex flex-col gap-2 overflow-hidden rounded-2xl p-4', 'bg-white/85 text-neutral-900 shadow-xl backdrop-blur-xl dark:bg-neutral-900/85 dark:text-neutral-50']">
    <header :class="['flex items-center justify-between gap-2 text-sm']">
      <span>{{ t('tamagotchi.stage.voice-inlay.draft', { name: characterName }) }}</span>
      <span :class="['text-xs text-neutral-500 dark:text-neutral-400']">{{ t('tamagotchi.stage.voice-inlay.pending', { count: drafts.pendingSessionIds.length }) }}</span>
    </header>
    <BasicTextarea
      v-if="sessionId"
      ref="draftInput"
      autofocus
      :model-value="text"
      :aria-label="t('tamagotchi.stage.voice-inlay.draft', { name: characterName })"
      :readonly="sending"
      :submit-on-enter="false"
      default-height="100%"
      aria-keyshortcuts="Enter Escape"
      :class="['min-h-0 flex-1']"
      @update:model-value="edit"
      @keydown="handleKeydown"
    />
    <p v-if="error" role="alert" :class="['text-sm text-red-600 dark:text-red-300']">
      {{ error }}
    </p>
    <footer :class="['flex justify-end gap-2']">
      <Button :disabled="sending || !sessionId" @click="discard">
        {{ t('tamagotchi.stage.voice-inlay.discard') }}
      </Button>
      <Button color="primary" variant="primary" :loading="sending" :disabled="!text.trim()" @click="send">
        {{ t('tamagotchi.stage.voice-inlay.send') }}
      </Button>
    </footer>
  </main>
</template>

<route lang="yaml">
meta:
  layout: plain
</route>
