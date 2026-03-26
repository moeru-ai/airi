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
        ...chars.length > 0 ? chars.at(-1)! : [],
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
  <div
    :class="[
      'flex flex-col items-center justify-start gap-1',
      'min-h-80 w-full rounded-lg bg-primary/5 p-2',
    ]"
  >
    <div
      :class="[
        'flex grow flex-row items-stretch gap-2',
        'w-full rounded-lg bg-primary/5 p-2',
      ]"
    >
      <div
        :class="[
          'flex flex-col items-center justify-start gap-1',
          'py-2',
        ]"
      >
        <div
          :class="[
            'transition-all duration-150 ease-out',
            'flex flex-row items-center',
            'cursor-pointer rounded-lg p-2 hover:bg-primary/10',
          ]"
          @click="isPlaying = !isPlaying"
        >
          <div
            v-if="!isPlaying"
            :class="[
              'i-lucide:play cursor-pointer',
            ]"
          />
          <div
            v-else
            :class="[
              'i-lucide:pause cursor-pointer',
            ]"
          />
        </div>

        <div
          :class="[
            'flex flex-row items-center',
            'cursor-pointer rounded-lg p-2 hover:bg-primary/10',
            'transition-all duration-150 ease-out',
          ]"
          @click="stepForward"
        >
          <div
            :class="[
              'i-lucide:step-forward',
            ]"
          />
        </div>

        <div
          :class="[
            'flex flex-row items-center',
            'cursor-pointer rounded-lg p-2 hover:bg-primary/10',
            'transition-all duration-150 ease-out',
          ]"
          @click="stepBack"
        >
          <div
            :class="[
              'i-lucide:step-back',
            ]"
          />
        </div>
      </div>

      <div
        :class="[
          'flex grow flex-row items-start gap-1',
          'w-full overflow-x-scroll rounded-lg bg-primary/5 p-2',
          'transition-all duration-150 ease-out',
        ]"
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

    <div
      :class="[
        'flex flex-row flex-wrap items-center justify-center gap-1',
        'py-2 text-xs',
      ]"
    >
      <div
        :class="[
          'w-full text-center font-semibold md:w-auto md:text-unset',
        ]"
      >
        {{ lang === 'zh-Hans' ? '图例' : 'Legend' }}
      </div>
      <div
        :class="[
          'flex shrink-0 items-center justify-center',
          'rounded-lg border-2 border-dotted border-primary/20 px-2',
          'transition-all duration-150 ease-out',
        ]"
      >
        {{ lang === 'zh-Hans' ? '字符' : 'Character' }}
      </div>
      <div
        :class="[
          'flex shrink-0 items-center justify-center',
          'rounded-lg border-2 border-dashed border-primary/20 px-2',
          'transition-all duration-150 ease-out',
        ]"
      >
        {{ lang === 'zh-Hans' ? '不完整字素簇' : 'Incomplete cluster' }}
      </div>
      <div
        :class="[
          'flex shrink-0 items-center justify-center',
          'rounded-lg border-2 border-solid border-primary/50 bg-primary/10 px-2',
          'transition-all duration-150 ease-out',
        ]"
      >
        {{ lang === 'zh-Hans' ? '完整字素簇' : 'Complete cluster' }}
      </div>
    </div>
  </div>
</template>
