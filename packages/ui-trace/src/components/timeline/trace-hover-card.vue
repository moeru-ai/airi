<script setup lang="ts">
/**
 * The hover card text of a trace item. The items on the canvas carry no labels, so the card names the item: who did
 * it, what it is, how it went, and what it links to.
 */
export interface TraceHoverInfo {
  /** The entity, for example `User` or `Agent`. */
  entity?: string
  /** Quieter text after the entity, for example the track and the model. */
  context?: string
  color?: string
  title: string
  parts: string[]
  status?: string
  links: { rel: string, target: string }[]
}

defineProps<{
  /** Undefined renders nothing. */
  info?: TraceHoverInfo
}>()
</script>

<template>
  <template v-if="info">
    <div :class="['flex items-center gap-1.5 min-w-0']">
      <span v-if="info.color" :class="['size-2 shrink-0 rounded-full']" :style="{ backgroundColor: info.color }" />
      <span v-if="info.entity" :class="['shrink-0 font-medium']">{{ info.entity }}</span>
      <span :class="['truncate text-neutral-500 dark:text-neutral-400']">{{ info.context }}</span>
    </div>
    <div :class="['mt-1 text-sm font-medium break-words']">
      {{ info.title }}
    </div>
    <div :class="['mt-0.5 text-neutral-500 tabular-nums dark:text-neutral-400']">
      {{ info.parts.join(' · ') }}
    </div>
    <div v-if="info.status" :class="['mt-1 flex items-center gap-1 text-red-600 dark:text-red-400']">
      <span :class="['i-mingcute:alert-line size-3.5 shrink-0']" />
      <span :class="['break-words']">{{ info.status }}</span>
    </div>
    <div v-for="link in info.links" :key="`${link.rel}:${link.target}`" :class="['mt-1 flex items-center gap-1 text-neutral-500 dark:text-neutral-400']">
      <span :class="['i-mingcute:corner-up-left-line size-3.5 shrink-0']" />
      <span :class="['truncate']">{{ link.rel }}: {{ link.target }}</span>
    </div>
  </template>
</template>
