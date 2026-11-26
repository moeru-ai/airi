<script setup lang="ts">
import { decodeBase64 } from '@moeru/std/base64'
import { thumbHashToDataURL } from 'thumbhash'
import { computed, shallowRef, useTemplateRef, watch } from 'vue'

const props = defineProps<{
  alt: string
  width: number
  height: number
  src?: string
  thumbHash?: string
}>()

const size = computed(() => ({
  aspectRatio: `${props.width} / ${props.height}`,
  width: `${props.width}px`,
}))
const preview = computed(() => {
  if (!props.thumbHash)
    return

  try {
    return thumbHashToDataURL(decodeBase64(props.thumbHash))
  }
  catch {
    return undefined
  }
})

const original = useTemplateRef<HTMLImageElement>('original')
const originalReady = shallowRef(false)

watch(original, async (image) => {
  originalReady.value = false
  if (!image)
    return

  try {
    await image.decode()
  }
  catch {
    return
  }

  if (image === original.value)
    originalReady.value = true
})
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
    >
  </div>
</template>
