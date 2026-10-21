<script setup lang="ts">
import { useJournalPreviewStore } from '@proj-airi/stage-ui/stores/journal-preview'
import { useI18n } from 'vue-i18n'

/** A screenshot in a tool call widget. It opens in the image preview of the chat. */
const props = defineProps<{
  url: string
  title: string
}>()

const emit = defineEmits<{
  (e: 'load', event: Event): void
}>()

const { t } = useI18n()
const journalPreview = useJournalPreviewStore()
</script>

<template>
  <button
    type="button"
    :class="[
      'group relative block w-full overflow-hidden rounded-[10px] cursor-zoom-in outline-none',
      'focus-visible:ring-2 focus-visible:ring-primary-400/60',
    ]"
    @click="journalPreview.openImagePreview({ title: props.title, url: props.url })"
  >
    <img :src="props.url" alt="" :class="['block w-full']" @load="emit('load', $event)">
    <span
      :class="[
        'absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-white',
        'bg-black/45 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100',
      ]"
    >
      <span :class="['i-mingcute:zoom-in-line']" aria-hidden="true" />
      {{ t('tamagotchi.stage.tool-call-screenshot.view-full') }}
    </span>
  </button>
</template>
