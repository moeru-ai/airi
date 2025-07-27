<script setup lang="ts">
import { animate } from 'animejs'
import { computed, ref } from 'vue'

const props = defineProps<{
  initText: string
}>()

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

const text = ref(props.initText)
const highlightedClusterIndex = ref(-1)

const segments = computed(() => [...segmenter.segment(text.value)])

function enterAnimator(e: Element, done: () => void) {
  return animate(e, {
    opacity: [0, 1],
    scale: [0.5, 1],
    ease: 'outQuad',
    duration: 200,
    onComplete: done,
  })
}

function leaveAnimator(e: Element, done: () => void) {
  return animate(e, {
    opacity: [1, 0],
    scale: [1, 0.5],
    ease: 'outQuad',
    duration: 200,
    onComplete: done,
  })
}
</script>

<template>
  <div class="w-full" grid="~ cols-[min-content_auto]" overflow-hidden rounded-lg>
    <div
      bg="primary/5"
      flex="~ items-center justify-end"
      p-2
    >
      Text
    </div>
    <div bg="primary/5" p-2>
      <input v-model="text" bg="primary/10" w-full rounded-lg p-2 text-lg>
    </div>

    <div
      whitespace-nowrap bg="primary/10"
      flex="~ items-center justify-end"
      p-2
    >
      Grapheme clusters
    </div>
    <div bg="primary/10" flex="~ row gap-2 wrap" p-2>
      <TransitionGroup
        :css="false"
        @enter="enterAnimator"
        @leave="leaveAnimator"
      >
        <div
          v-for="(segment, segIndex) in segments"
          :key="segIndex"
          b="~ 2"
          :class="{
            'b-solid b-primary/50 bg-primary/10': highlightedClusterIndex === segIndex,
            'b-dashed b-primary/20': highlightedClusterIndex !== segIndex,
          }"
          h-10 w-10 cursor-pointer rounded-lg text-lg
          flex="~ items-center justify-center"
          @mouseover="highlightedClusterIndex = segIndex"
          @mouseleave="highlightedClusterIndex = -1"
        >
          {{ segment.segment }}
        </div>
      </TransitionGroup>
    </div>

    <div
      whitespace-nowrap bg="primary/15"
      flex="~ items-center justify-end" p-2
    >
      Code points
    </div>
    <div bg="primary/15" flex="~ row gap-2 wrap" p-2>
      <TransitionGroup
        :css="false"
        @enter="enterAnimator"
        @leave="leaveAnimator"
      >
        <template v-for="(segment, segIndex) in segments" :key="segIndex">
          <div
            v-for="(cp, cpIndex) in [...segment.segment]"
            :key="cpIndex"
            flex="~ col items-center gap-1 justify-center"
          >
            <div
              b="~ 2"
              :class="{
                'b-solid b-primary/50 bg-primary/10': highlightedClusterIndex === segIndex,
                'b-dashed b-primary/20': highlightedClusterIndex !== segIndex,
              }"
              flex="~ col items-center justify-center"
              transition="all duration-150 ease-out"
              h-10 w-10 cursor-pointer rounded-lg text-lg
              @mouseover="highlightedClusterIndex = segIndex"
              @mouseleave="highlightedClusterIndex = -1"
            >
              {{ cp }}
            </div>
            <div text-xs text="primary" font-mono>
              {{ cp.codePointAt(0)?.toString(16).toUpperCase() }}
            </div>
          </div>
        </template>
      </TransitionGroup>
    </div>
  </div>
</template>
