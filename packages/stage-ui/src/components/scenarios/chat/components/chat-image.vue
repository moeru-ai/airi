<script setup lang="ts">
import type { ImageThumbnail } from '@proj-airi/server-sdk-shared/v2'

import { computed, shallowRef } from 'vue'

import { useChatAssetUrls } from '../../../../composables/use-chat-asset-urls'
import { thumbnailDataUrl } from '../../../../libs/chat-sync/image-thumbnail'

const props = defineProps<{
  alt: string
  source?: string
  thumbnail?: ImageThumbnail
}>()

const emptySources: readonly string[] = Object.freeze([])
const sources = useChatAssetUrls(() => props.source ? [props.source] : emptySources)
const original = computed(() => sources.value[0])
const loadedSource = shallowRef<string>()
const isColdLoad = !props.source
const preview = computed(() => props.thumbnail && isColdLoad ? thumbnailDataUrl(props.thumbnail.hash) : undefined)
const originalReady = computed(() => !!original.value && loadedSource.value === original.value)
const size = computed(() => {
  if (!props.thumbnail)
    return

  const { width, height } = props.thumbnail
  return {
    aspectRatio: `${width} / ${height}`,
    width: `min(${width}px, ${16 * width / height}rem)`,
  }
})

async function showOriginal(event: Event) {
  const image = event.currentTarget
  if (!(image instanceof HTMLImageElement))
    return

  const source = original.value
  try {
    await image.decode()
  }
  catch {
    return
  }
  if (source === original.value)
    loadedSource.value = source
}
</script>

<template>
  <div v-if="thumbnail" :style="size" :class="['relative max-w-full overflow-hidden rounded-xl']">
    <img
      v-if="preview"
      :src="preview"
      :alt="originalReady ? '' : alt"
      :class="[
        'absolute inset-0 size-full transition-opacity duration-200 motion-reduce:transition-none',
        originalReady && 'opacity-0',
      ]"
    >
    <img
      v-if="original"
      :src="original"
      :alt="originalReady || !preview ? alt : ''"
      :class="[
        'absolute inset-0 size-full object-contain',
        preview && (originalReady ? 'animate-fadeIn motion-reduce:animate-none' : 'opacity-0'),
      ]"
      @load="showOriginal"
    >
  </div>
  <img v-else-if="original" :src="original" :alt="alt" :class="['max-h-64 max-w-full rounded-xl object-contain']">
</template>
