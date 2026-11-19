<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { chatStickers } from '../../../../assets/stickers'
import { useStickersStore } from '../../../../stores/modules/stickers'

const props = defineProps<{ stickerId: string }>()
const { t } = useI18n()
const stickers = useStickersStore()
const name = computed(() => {
  const entry = stickers.entries.find(entry => entry.assetId === props.stickerId)
  const builtin = chatStickers.find(sticker => sticker.id === props.stickerId)
  return entry
    ? builtin && entry.name === builtin.description ? t(`settings.pages.modules.stickers.artwork.${builtin.id}`) : entry.name
    : t('settings.pages.modules.stickers.saved-image')
})
</script>

<template>
  <img
    v-if="stickers.artwork[stickerId]"
    :src="stickers.artwork[stickerId]"
    :alt="name"
    width="160"
    height="160"
    :class="['size-40 max-w-full self-start object-contain']"
  >
  <span v-else :class="['text-sm text-neutral-500 dark:text-neutral-400']">
    {{ t('settings.pages.modules.stickers.unavailable') }}
  </span>
</template>
