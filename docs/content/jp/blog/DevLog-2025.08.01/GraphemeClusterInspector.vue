<script setup lang="ts">
import { animate } from 'animejs'
import { useData } from 'vitepress'
import { computed, ref } from 'vue'

import CharacterShowcase from './CharacterShowcase.vue'

const props = defineProps<{
  initText: string
}>()

const { lang } = useData()

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
  <div class="w-full" grid="~ cols-[auto] md:cols-[min-content_auto]" overflow-hidden rounded-lg>
    <div
      bg="primary/5"
      flex="~ items-center justify-start md:justify-end"
      p="2 md:e-0" text-sm font-semibold
    >
      {{ lang === 'zh-Hans' ? '文本' : 'Text' }}
    </div>
    <div bg="primary/5" p-2>
      <input v-model="text" name="text" bg="primary/10" w-full rounded-lg p-2 text="md:lg">
    </div>

    <div
      whitespace-nowrap bg="primary/10"
      flex="~ items-center justify-start md:justify-end"
      p="2 md:e-0" text-sm font-semibold
    >
      {{ lang === 'zh-Hans' ? '字素簇' : 'Grapheme clusters' }}
    </div>
    <div bg="primary/10" flex="~ row gap-2 wrap" p-2>
      <TransitionGroup
        :css="false"
        @enter="enterAnimator"
        @leave="leaveAnimator"
      >
        <CharacterShowcase
          v-for="(segment, segIndex) in segments"
          :key="segIndex"
          :variant="highlightedClusterIndex === segIndex ? 'active' : 'default'"
          cursor-pointer
          :value="segment.segment"
          @mouseover="highlightedClusterIndex = segIndex"
          @mouseleave="highlightedClusterIndex = -1"
        />
      </TransitionGroup>
    </div>

    <div
      whitespace-nowrap bg="primary/15"
      flex="~ items-center justify-start md:justify-end"
      p="2 md:e-0" text-sm font-semibold
    >
      {{ lang === 'zh-Hans' ? '字符' : 'Characters' }}
    </div>
    <div bg="primary/15" flex="~ row gap-2 wrap" p-2>
      <TransitionGroup
        :css="false"
        @enter="enterAnimator"
        @leave="leaveAnimator"
      >
        <template v-for="(segment, segIndex) in segments" :key="segIndex">
          <CharacterShowcase
            v-for="(cp, cpIndex) in [...segment.segment]"
            :key="`${segIndex}-${cpIndex}`"
            :variant="highlightedClusterIndex === segIndex ? 'active' : 'default'"
            :value="cp"
            code-point
            cursor-pointer
            @mouseover="highlightedClusterIndex = segIndex" @mouseleave="highlightedClusterIndex = -1"
          />
        </template>
      </TransitionGroup>
    </div>
  </div>
</template>
