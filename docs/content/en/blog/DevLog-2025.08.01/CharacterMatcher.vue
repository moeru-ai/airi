<script setup lang="ts">
import { animate } from 'animejs'
import { useData } from 'vitepress'
import { ref, watchEffect } from 'vue'

import CharacterShowcase from './CharacterShowcase.vue'

interface Character {
  value: string
  variant?: InstanceType<typeof CharacterShowcase>['variant']
}

function interpolate(characters: string[], initial?: Character[]) {
  return characters.reduce<Character[][]>((chars, c) => {
    return [
      ...chars,
      [
        ...chars.length > 0 ? chars[chars.length - 1] : [],
        { value: c, variant: 'dotted' },
      ],
    ]
  }, initial ? [initial] : [])
}

const STATES: Character[][] = [
  ...interpolate([...'💆🏼‍♀️'].splice(0, 2)),
  ...interpolate([...'💆🏼‍♀️'].splice(2), [{ value: '💆🏼', variant: 'default' }]),
  ...interpolate([...'👩🏻‍💻'].splice(0, 2), [{ value: '💆🏼‍♀️', variant: 'default' }]),
  ...interpolate([...'👩🏻‍💻'].splice(2), [{ value: '💆🏼‍♀️', variant: 'active' }, { value: '👩🏻', variant: 'default' }]),
  [{ value: '💆🏼‍♀️', variant: 'active' }, { value: '👩🏻‍💻', variant: 'active' }],
]

const { lang } = useData()

const stateIndex = ref(0)
const isPlaying = ref(true)
const animationHandle = ref<number>()

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

watchEffect(() => {
  if (!import.meta.env.SSR) {
    if (isPlaying.value) {
      animationHandle.value = window.setInterval(() => {
        stateIndex.value = (stateIndex.value + 1) % STATES.length
      }, 1000)
    }
    else {
      if (animationHandle.value) {
        window.clearInterval(animationHandle.value)
        animationHandle.value = undefined
      }
    }
  }
})

function stepForward() {
  isPlaying.value = false
  stateIndex.value = (stateIndex.value + 1) % STATES.length
}

function stepBack() {
  isPlaying.value = false
  stateIndex.value = (stateIndex.value - 1 + STATES.length) % STATES.length
}
</script>

<template>
  <div flex="~ col items-center justify-start gap-1" bg="primary/5" min-h-80 w-full rounded-lg p-2>
    <div flex="~ row items-stretch gap-2 grow" bg="primary/5" w-full rounded-lg p-2>
      <div flex="~ col items-center justify-start gap-1" py-2>
        <div
          flex="~ row items-center"
          rounded-lg p="2"
          bg="hover:primary/10"
          transition="~ all duration-150 ease-out"
          cursor="pointer"
          @click="isPlaying = !isPlaying"
        >
          <div v-if="!isPlaying" i-lucide:play cursor="pointer" />
          <div v-else i-lucide:pause cursor="pointer" />
        </div>

        <div
          flex="~ row items-center"
          rounded-lg p="2"
          bg="hover:primary/10"
          transition="~ all duration-150 ease-out"
          cursor="pointer"
          @click="stepForward"
        >
          <div i-lucide:step-forward />
        </div>

        <div
          flex="~ row items-center"
          rounded-lg p="2"
          bg="hover:primary/10"
          transition="~ all duration-150 ease-out"
          cursor="pointer"
          @click="stepBack"
        >
          <div i-lucide:step-back />
        </div>
      </div>

      <div
        flex="~ row items-start gap-1 grow"
        transition="~ all duration-150 ease-out"
        overflow="x-scroll"
        bg="primary/5" w-full rounded-lg p-2
      >
        <TransitionGroup
          :css="false"
          @enter="enterAnimator"
          @leave="leaveAnimator"
        >
          <CharacterShowcase
            v-for="(c, i) in STATES[stateIndex]"
            :key="i"
            :value="c.value"
            :variant="c.variant"
            code-point
          />
        </TransitionGroup>
      </div>
    </div>

    <div flex="~ row items-center justify-center gap-1 wrap" py-2 text-xs>
      <div font-semibold w="full md:auto" text="center md:unset">
        {{ lang === 'zh-Hans' ? '图例' : 'Legend' }}
      </div>
      <div
        b="~ 2 dotted primary/20"
        rounded-lg px-2
        flex="~ items-center justify-center shrink-0"
        transition="~ all duration-150 ease-out"
      >
        {{ lang === 'zh-Hans' ? '字符' : 'Character' }}
      </div>
      <div
        b="~ 2 dashed primary/20"
        rounded-lg px-2
        flex="~ items-center justify-center shrink-0"
        transition="~ all duration-150 ease-out"
      >
        {{ lang === 'zh-Hans' ? '不完整字素簇' : 'Incomplete cluster' }}
      </div>
      <div
        b="~ 2 solid primary/50"
        bg="primary/10"
        rounded-lg px-2
        flex="~ items-center justify-center shrink-0"
        transition="~ all duration-150 ease-out"
      >
        {{ lang === 'zh-Hans' ? '完整字素簇' : 'Complete cluster' }}
      </div>
    </div>
  </div>
</template>
