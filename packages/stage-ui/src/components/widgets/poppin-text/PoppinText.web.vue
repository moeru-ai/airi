<!-- Poppin'Text - Makes your text "kirakira dokidoki"!! -->

<script setup lang="ts">
import type { Animator } from './animators'

import { readGraphemeClusters } from 'clustr'
import { onMounted, ref, shallowRef, watch } from 'vue'

interface PoppinTextSegment {
  key: string | number
  text: string
}

interface PoppinTextTarget {
  id: string
  grapheme: string
}

const props = defineProps<{
  /**
   * A plain string, keyed text segments, or a ReadableStream of bytes from text in UTF-8 encoding.
   * If a stream is provided, the stream **SHOULD NOT** be reused. (i.e. You should not set a same stream twice.)
   */
  text?: string | PoppinTextSegment[] | ReadableStream<Uint8Array>
  textClass?: string | string[]
  animator?: Animator
}>()

const emits = defineEmits<{
  (e: 'textSplit', grapheme: string): void
}>()

const targets = ref<PoppinTextTarget[]>([])
const abortController = shallowRef<AbortController>()
const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' })
const animatedTargetIds = new Set<PoppinTextTarget['id']>()
let plainTextGeneration = 0
let streamTextGeneration = 0

function readTextTargets(text: string, namespace: string): PoppinTextTarget[] {
  return Array.from(segmenter.segment(text), (seg, index) => ({
    id: `${namespace}:${index}`,
    grapheme: seg.segment,
  }))
}

function readSegmentTargets(segments: PoppinTextSegment[]): PoppinTextTarget[] {
  return segments.flatMap(segment =>
    Array.from(segmenter.segment(segment.text), (seg, index) => ({
      id: `segment:${segment.key}:${index}`,
      grapheme: seg.segment,
    })),
  )
}

watch(() => props.text, async (text) => {
  if (!text) {
    animatedTargetIds.clear()
    targets.value = []
    return
  }

  if (typeof text === 'string') {
    const nextTargets = readTextTargets(text, `text:${plainTextGeneration}`)
    const appendsToPreviousText = targets.value.length <= nextTargets.length
      && targets.value.every((target, index) => target.grapheme === nextTargets[index]?.grapheme)

    if (!appendsToPreviousText) {
      plainTextGeneration += 1
      animatedTargetIds.clear()
      targets.value = readTextTargets(text, `text:${plainTextGeneration}`)
      return
    }

    targets.value = nextTargets
    return
  }
  if (Array.isArray(text)) {
    targets.value = readSegmentTargets(text)
    return
  }

  abortController.value?.abort()
  abortController.value = new AbortController()

  try {
    streamTextGeneration += 1
    animatedTargetIds.clear()
    targets.value = []

    for await (const cluster of readGraphemeClusters(text.getReader(), { signal: abortController.value.signal })) {
      targets.value.push({
        id: `stream:${streamTextGeneration}:${targets.value.length}`,
        grapheme: cluster,
      })

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
}, { immediate: true })

const elements = ref<HTMLElement[]>([])
const animatorCleanupFn = shallowRef<() => void>()
const activeAnimator = shallowRef<Animator>()

onMounted(() => {
  animatorCleanupFn.value = props.animator?.(elements.value.slice())
  activeAnimator.value = props.animator
  targets.value.forEach(target => animatedTargetIds.add(target.id))
})

watch([targets, () => props.animator], ([targets, animator]) => {
  const animatorChanged = activeAnimator.value !== animator
  const targetIds = new Set(targets.map(target => target.id))

  for (const id of animatedTargetIds) {
    if (!targetIds.has(id))
      animatedTargetIds.delete(id)
  }

  if (animatorChanged) {
    animatorCleanupFn.value?.()
    animatedTargetIds.clear()
  }

  const targetElements = elements.value.filter((_, index) => {
    const target = targets[index]
    return target && !animatedTargetIds.has(target.id)
  })

  const cleanup = targetElements.length > 0 ? animator?.(targetElements) : undefined
  if (cleanup) {
    animatorCleanupFn.value = cleanup
  }

  targets.forEach(target => animatedTargetIds.add(target.id))

  activeAnimator.value = animator
}, { deep: true, flush: 'post' }) // <- Ensure post-update refs
</script>

<template>
  <div>
    <span
      v-for="target in targets"
      :key="target.id"
      ref="elements"
      class="inline-block whitespace-pre-wrap color-primary-400 dark:color-primary-100"
      :class="[
        ...(
          typeof props.textClass === 'string'
            ? [props.textClass]
            : (props.textClass || [])
        ),
      ]"
    >
      {{ target.grapheme }}
    </span>
  </div>
</template>
