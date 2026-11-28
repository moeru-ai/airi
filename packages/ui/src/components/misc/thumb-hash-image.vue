<script setup lang="ts">
import { decodeBase64 } from '@moeru/std/base64'
import { thumbHashToDataURL } from 'thumbhash'
import { computed } from 'vue'

const props = defineProps<{
  alt: string
  src?: string
  thumbnail?: { width: number, height: number, hash?: string }
}>()

const size = computed(() => props.thumbnail && {
  aspectRatio: `${props.thumbnail.width} / ${props.thumbnail.height}`,
  width: `${props.thumbnail.width}px`,
})
const preview = computed(() => {
  const hash = props.thumbnail?.hash
  if (!hash)
    return

  try {
    return thumbHashToDataURL(decodeBase64(hash))
  }
  catch {
    return undefined
  }
})

function showOriginal(event: Event) {
  const image = event.currentTarget
  if (!(image instanceof HTMLImageElement))
    return

  void image.decode().then(() => {
    image.dataset.decoded = ''
  }, () => undefined)
}
</script>

<template>
  <div
    v-if="src || thumbnail"
    :style="size"
    :role="alt ? 'img' : undefined"
    :aria-label="alt || undefined"
    :class="['relative max-w-full overflow-hidden']"
  >
    <img
      v-if="preview"
      :src="preview"
      alt=""
      :class="['preview absolute inset-0 size-full transition-opacity duration-200 motion-reduce:transition-none']"
    >
    <img
      v-if="src"
      :key="src"
      :src="src"
      alt=""
      :class="[
        'original max-w-full object-contain',
        thumbnail && 'absolute inset-0 size-full',
        preview && 'data-[decoded]:animate-fadeIn motion-reduce:data-[decoded]:animate-none',
      ]"
      @load="showOriginal"
    >
  </div>
</template>

<style scoped>
.original {
  max-height: inherit;
}

.preview:has(+ .original[data-decoded]),
.preview + .original:not([data-decoded]) {
  opacity: 0;
}
</style>
