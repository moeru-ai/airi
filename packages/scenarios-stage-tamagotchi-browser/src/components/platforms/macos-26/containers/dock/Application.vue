<script setup lang="ts">
import type { StyleValue } from 'vue'

import { inject, toRef } from 'vue'

import { injectDockSize } from './constants'

const props = withDefaults(defineProps<{
  class?: string | string[]
  style?: StyleValue
  baseSize?: number
  running?: boolean
  notificationCount?: number
}>(), {})

const dockSize = toRef(() => inject(injectDockSize, 1))
</script>

<template>
  <div
    :class="[
      ...props.class ? typeof props.class === 'string' ? [props.class] : props.class : [],
      'relative',
    ]"
    :style="{
      ...props.style ? typeof props.style === 'object' ? props.style : {} : {},
      width: `${props.baseSize ? props.baseSize * dockSize : 32 * dockSize}px`,
      height: `${props.baseSize ? props.baseSize * dockSize : 32 * dockSize}px`,
    }"
  >
    <slot />
    <div
      v-if="props.running"
      :class="[
        'absolute top-1/2 right--0.8 translate-y--1/2',
        'rounded-full',
        'bg-white/75',
      ]"
      :style="{
        width: `${3.2 * dockSize}px`,
        height: `${3.2 * dockSize}px`,
      }"
    />
    <div
      v-if="props.notificationCount"
      :class="[
        'absolute top-0 right-[calc(-50%+5%)] translate-x-[-100%] translate-y-[calc(-50%+16%)]',
        'rounded-full',
        'bg-red-500',
      ]"
      :style="{
        width: `${12 * dockSize}px`,
        height: `${12 * dockSize}px`,
      }"
    >
      {{ props.notificationCount }}
    </div>
  </div>
</template>
