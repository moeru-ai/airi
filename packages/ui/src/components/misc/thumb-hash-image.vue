<script setup lang="ts">
import { decodeBase64 } from '@moeru/std/base64'
import { thumbHashToDataURL } from 'thumbhash'
import { computed, shallowRef, useTemplateRef } from 'vue'

const props = defineProps<{
  alt: string
  src?: string
  thumbnail: { width: number, height: number, hash?: string }
}>()

const size = computed(() => ({
  aspectRatio: `${props.thumbnail.width} / ${props.thumbnail.height}`,
  width: `${props.thumbnail.width}px`,
}))
const preview = computed(() => {
  const { hash } = props.thumbnail
  if (!hash)
    return

  try {
    return thumbHashToDataURL(decodeBase64(hash))
  }
  catch {
    return undefined
  }
})

const original = useTemplateRef<HTMLImageElement>('original')
const decodedImage = shallowRef<HTMLImageElement>()
const originalReady = computed(() => decodedImage.value === original.value && original.value?.getAttribute('src') === props.src)

async function showOriginal(event: Event) {
  const image = event.currentTarget
  if (!(image instanceof HTMLImageElement))
    return

  try {
    await image.decode()
  }
  catch {
    return
  }

  if (image === original.value)
    decodedImage.value = image
}
</script>

<template>
  <div :style="size" :class="['relative max-w-full overflow-hidden']">
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
      v-if="src"
      :key="src"
      ref="original"
      :src="src"
      :alt="originalReady || !preview ? alt : ''"
      :class="[
        'absolute inset-0 size-full object-contain',
        preview && (originalReady ? 'animate-fadeIn motion-reduce:animate-none' : 'opacity-0'),
      ]"
      @load="showOriginal"
    >
  </div>
</template>
