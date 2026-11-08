<script setup lang="ts">
import type { BlurFadeOptions } from '../poppin-text/animators'

import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue'

import { playBlurFade } from '../poppin-text/animators'

const props = defineProps<{
  /** The text before the rewrite. */
  from: string
  /** The text after the rewrite. */
  to: string
  /**
   * The root element tag.
   * @default 'span'
   */
  as?: string
  motion?: BlurFadeOptions
}>()

const emit = defineEmits<{
  /** The new text shows completely. It also fires at once when the texts are equal or motion is reduced. */
  (e: 'finished'): void
}>()

interface Change {
  readonly kind: 'equal' | 'removed' | 'added'
  readonly text: string
}

// Word segmentation also splits Chinese and Japanese text into words, so a rewrite keeps unchanged words in place.
const words = new Intl.Segmenter(undefined, { granularity: 'word' })
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/**
 * Compares two texts word by word with the longest common subsequence. Runs of the same kind are merged.
 * A rewrite usually changes words at several places, for example a filler word at the start and the punctuation at
 * the end, so only these places animate.
 *
 * @example
 * diffWords('um turn on the lite', 'Turn on the light.')
 * // => removed 'um turn', added 'Turn', equal ' on the ', removed 'lite', added 'light.'
 */
function diffWords(from: string, to: string): Change[] {
  const fromWords = Array.from(words.segment(from), segment => segment.segment)
  const toWords = Array.from(words.segment(to), segment => segment.segment)
  // The common start and end are equal by definition. A long draft usually changes only its newest sentence, so the
  // table below covers only the changed middle, not the whole draft.
  let start = 0
  while (start < fromWords.length && start < toWords.length && fromWords[start] === toWords[start])
    start += 1
  let end = 0
  while (end < fromWords.length - start && end < toWords.length - start && fromWords[fromWords.length - 1 - end] === toWords[toWords.length - 1 - end])
    end += 1
  const before = fromWords.slice(start, fromWords.length - end)
  const after = toWords.slice(start, toWords.length - end)

  // `common[i][j]` is the length of the longest common subsequence of `before[i..]` and `after[j..]`.
  const common = Array.from({ length: before.length + 1 }, () => new Uint32Array(after.length + 1))
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--)
      common[i]![j] = before[i] === after[j] ? common[i + 1]![j + 1]! + 1 : Math.max(common[i + 1]![j]!, common[i]![j + 1]!)
  }

  const changes: Change[] = []
  const push = (kind: Change['kind'], text: string) => {
    const last = changes.at(-1)
    if (last?.kind === kind)
      changes[changes.length - 1] = { kind, text: last.text + text }
    else if (text)
      changes.push({ kind, text })
  }
  push('equal', fromWords.slice(0, start).join(''))
  let i = 0
  let j = 0
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      push('equal', before[i]!)
      i += 1
      j += 1
    }
    else if (j >= after.length || (i < before.length && common[i + 1]![j]! >= common[i]![j + 1]!)) {
      push('removed', before[i]!)
      i += 1
    }
    else {
      push('added', after[j]!)
      j += 1
    }
  }
  push('equal', fromWords.slice(fromWords.length - end).join(''))
  return changes
}

const changes = computed(() => diffWords(props.from, props.to))

/** The changes on screen in one phase. A changed run splits into graphemes, which animate in reading order. */
function visible(hidden: Change['kind']) {
  return changes.value
    .filter(change => change.kind !== hidden)
    .map(change => ({ ...change, graphemes: change.kind === 'equal' ? [] : Array.from(graphemes.segment(change.text), segment => segment.segment) }))
}

/**
 * - `leaving`: the old words of every change blur out, from the first change to the last.
 * - `entering`: the new words blur in, in the same order.
 * - `finished`: the new text shows as plain text.
 */
const phase = shallowRef<'leaving' | 'entering' | 'finished'>('leaving')
const elements = useTemplateRef<HTMLElement[]>('animated')
let stop: (() => void) | undefined
let unmounted = false

onMounted(async () => {
  if (changes.value.some(change => change.kind === 'removed')) {
    const leave = playBlurFade(elements.value ?? [], 'out', props.motion)
    stop = leave.stop
    await leave.finished
  }
  if (unmounted)
    return

  phase.value = 'entering'
  await nextTick()
  const enter = playBlurFade(elements.value ?? [], 'in', props.motion)
  stop = enter.stop
  await enter.finished
  if (unmounted)
    return

  phase.value = 'finished'
  emit('finished')
})

onBeforeUnmount(() => {
  unmounted = true
  stop?.()
})
</script>

<template>
  <!-- v-text keeps template whitespace out of a pre-wrap parent. Vue removes the newlines between these tags. -->
  <component :is="props.as ?? 'span'">
    <span v-if="phase === 'finished'" v-text="props.to" />
    <template v-else>
      <template v-for="(change, index) in visible(phase === 'leaving' ? 'added' : 'removed')" :key="`${phase}:${index}`">
        <span v-if="change.kind === 'equal'" v-text="change.text" />
        <template v-else>
          <span v-for="(grapheme, offset) in change.graphemes" :key="offset" ref="animated" v-text="grapheme" />
        </template>
      </template>
    </template>
  </component>
</template>
