<!-- Poppin'Text - Makes your text "kirakira dokidoki"!! -->

<script setup lang="ts">
import type { Animator } from './animators'

import { readGraphemeClusters } from 'clustr'
import { onMounted, ref, shallowRef, watch } from 'vue'

const props = defineProps<{
  /**
   * A plain string or a ReadableStream of bytes from text in UTF-8 encoding.
   * If a stream is provided, the stream **SHOULD NOT** be reused. (i.e. You should not set a same stream twice.)
   */
  text?: string | ReadableStream<Uint8Array>
  textClass?: string | string[]
  animator?: Animator
}>()

const emits = defineEmits<{
  (e: 'textSplit', grapheme: string): void
}>()

const targets = ref<string[]>([])
const abortController = shallowRef<AbortController>()
const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' })

watch(() => props.text, async (text) => {
  if (!text)
    return
  if (typeof text === 'string') {
    targets.value = [...segmenter.segment(text)].map(seg => seg.segment)
  }
  else {
    abortController.value?.abort()
    abortController.value = new AbortController()
    try {
      targets.value = []
      for await (const cluster of readGraphemeClusters(text.getReader(), { signal: abortController.value.signal })) {
        targets.value.push(cluster)
        emits('textSplit', cluster)
      }
    }
    catch (error) {
      if (error instanceof Error && error.message === 'Aborted') {
        console.warn('Text reading aborted')
      }
      else {
        console.error('Error reading text:', error)
      }
    }
  }
}, { immediate: true })

const elements = ref<HTMLElement[]>([])
const animatorCleanupFn = shallowRef<() => void>()

onMounted(() => {
  animatorCleanupFn.value = props.animator?.(elements.value)
})

const lastAnimatedIndex = ref(-1)

watch([targets, () => props.animator], ([targets, animator]) => {
  if (typeof props.text === 'string') {
    animatorCleanupFn.value?.()
    animatorCleanupFn.value = animator?.(elements.value)
  }
  else {
    animator?.(elements.value.slice(lastAnimatedIndex.value, targets.length))
    lastAnimatedIndex.value = targets.length
  }
}, { deep: true, flush: 'post' }) // <- Ensure post-update refs
</script>

<template>
  <div>
    <span
      v-for="(grapheme, index) in targets"
      :key="index"
      ref="elements"
      class="inline-block color-primary-400 dark:color-primary-100"
      :class="[...(typeof props.textClass === 'string' ? [props.textClass] : (props.textClass || []))]"
    >
      {{ grapheme }}
    </span>
  </div>
</template>
