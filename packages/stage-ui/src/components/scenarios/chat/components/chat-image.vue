<script setup lang="ts">
import type { ImageThumbnail } from '@proj-airi/server-sdk-shared/v2'

import { ThumbHashImage } from '@proj-airi/ui'
import { computed } from 'vue'

import { useChatAssetUrls } from '../../../../composables/use-chat-asset-urls'

const props = defineProps<{
  alt: string
  source?: string
  thumbnail?: ImageThumbnail
}>()

const emptySources: readonly string[] = Object.freeze([])
const sources = useChatAssetUrls(() => props.source ? [props.source] : emptySources)
const original = computed(() => sources.value[0])
const showThumbnail = !props.source
const imageStyle = computed(() => {
  if (!props.thumbnail)
    return

  const { width, height } = props.thumbnail
  return { width: `min(${width}px, ${16 * width / height}rem)` }
})
</script>

<template>
  <ThumbHashImage
    v-if="thumbnail"
    :src="original"
    :alt="alt"
    :thumb-hash="showThumbnail ? thumbnail.hash : undefined"
    :width="thumbnail.width"
    :height="thumbnail.height"
    :style="imageStyle"
    :class="['rounded-xl']"
  />
  <img v-else-if="original" :src="original" :alt="alt" :class="['max-h-64 max-w-full rounded-xl object-contain']">
</template>
