<!-- Poppin'Text - Makes your text "kirakira dokidoki"!! -->

<script setup lang="ts">
import type { Animator } from './animators'

import { onMounted, ref, shallowRef, watch } from 'vue'

const props = defineProps<{
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

function readGraphemeClusters(stream: ReadableStream<Uint8Array>, options?: { signal?: AbortSignal }) {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  const decoder = new TextDecoder('utf-8', { fatal: false })
  const reader = stream.getReader()
  const signal = options?.signal

  async function* iterator() {
    let buf = ''

    while (true) {
      if (signal?.aborted) {
        reader.cancel()
        throw new Error('Aborted')
      }

      const readPromise = reader.read()
      let result
      if (signal) {
        result = await Promise.race([
          readPromise,
          new Promise((_, reject) => {
            signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true })
          }),
        ])
      }
      else {
        result = await readPromise
      }

      const { done, value } = result as ReadableStreamReadResult<Uint8Array<ArrayBufferLike>>
      if (done) {
        const segments = [...segmenter.segment(buf)]
        for (const seg of segments) {
          yield seg.segment
        }
        break
      }

      buf += decoder.decode(value, { stream: true })

      const segments = [...segmenter.segment(buf)]
      if (segments.length > 1) {
        const last = segments.pop()!
        for (const seg of segments) {
          yield seg.segment
        }
        buf = buf.slice(last.index)
      }
    }
  }

  const asyncIterator = iterator()

  return {
    iterator: asyncIterator,
    [Symbol.asyncIterator]() { return asyncIterator },
  }
}

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
      for await (const cluster of readGraphemeClusters(text, { signal: abortController.value.signal })) {
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
