<script setup lang="ts">
import { shallowRef } from 'vue'

withDefaults(defineProps<{
  name: string
  description?: string
  coverUrl?: string
  coverBackgroundUrl?: string
  avatarUrl?: string
  coverFit?: 'cover' | 'contain'
  layout?: 'portrait' | 'horizontal'
}>(), { coverFit: 'cover', layout: 'portrait' })

const failedCover = shallowRef<string>()
</script>

<template>
  <article :class="['group relative isolate overflow-hidden rounded-3xl shadow-sm', 'bg-white dark:bg-neutral-900', layout === 'horizontal' ? 'min-h-44 flex' : 'aspect-[12/19]']">
    <div :class="['relative overflow-hidden rounded-2xl', 'bg-white dark:bg-neutral-900', layout === 'horizontal' ? 'w-1/3 shrink-0' : 'h-70% w-full']">
      <img v-if="coverBackgroundUrl" :src="coverBackgroundUrl" alt="" :class="['absolute inset-0 h-full w-full object-cover']">
      <img
        v-if="coverUrl && coverUrl !== failedCover"
        :src="coverUrl"
        alt=""
        :class="['h-full w-full transition duration-300 ease-in-out', layout === 'horizontal' ? 'absolute inset-0' : 'relative', coverFit === 'contain' ? 'object-contain' : 'object-cover']"
        @error="failedCover = coverUrl"
      >
      <div v-else :class="['h-full flex items-center justify-center text-primary-300 dark:text-primary-700']">
        <span :class="['i-solar:ghost-bold-duotone text-5xl']" aria-hidden="true" />
      </div>
      <slot name="cover-actions" />
    </div>
    <div :class="['relative min-w-0 flex flex-col gap-2', layout === 'horizontal' ? 'flex-1 justify-center p-4' : 'h-30% justify-between overflow-hidden px-3 pb-3 pt-2']">
      <div :class="['flex items-center justify-between gap-3']">
        <div :class="['min-w-0 flex items-center gap-2']">
          <img v-if="avatarUrl" :src="avatarUrl" alt="" :class="['h-7 w-7 shrink-0 rounded-full object-cover']">
          <h3 :class="['text-lg font-semibold', layout === 'horizontal' ? 'break-words' : 'line-clamp-1']">
            {{ name }}
          </h3>
        </div>
        <slot name="meta" />
      </div>
      <p :class="['text-xs text-neutral-500 dark:text-neutral-400', layout === 'horizontal' ? 'break-words' : 'line-clamp-3 max-h-12 flex-1 overflow-hidden text-ellipsis']">
        {{ description }}
      </p>
      <slot name="footer" />
    </div>
    <div :class="['pointer-events-none absolute inset-0 z--1 overflow-hidden']" aria-hidden="true">
      <img v-if="coverUrl && coverUrl !== failedCover" :src="coverUrl" alt="" :class="['h-full w-full scale-300 object-contain transition duration-300 ease-in-out group-hover:scale-350']">
      <div :class="['absolute inset-0 bg-white/70 backdrop-blur-lg dark:bg-neutral-900/80']" />
    </div>
  </article>
</template>
