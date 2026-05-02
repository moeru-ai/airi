<script setup lang="ts">
import { ref } from 'vue'

const props = withDefaults(defineProps<{
  title: string
  defaultOpen?: boolean
  badge?: string
}>(), {
  defaultOpen: false,
  badge: '',
})

const open = ref(props.defaultOpen)
</script>

<template>
  <div class="border border-neutral-200 rounded-lg bg-white dark:border-neutral-800 dark:bg-neutral-900">
    <button
      type="button"
      class="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
      :class="open ? 'rounded-t-lg' : 'rounded-lg'"
      @click="open = !open"
    >
      <div class="flex items-center gap-2 text-sm text-neutral-700 font-medium dark:text-neutral-200">
        <span
          class="i-solar-alt-arrow-right-outline h-3.5 w-3.5 flex-none text-neutral-400 transition-transform duration-150 dark:text-neutral-500"
          :class="open ? 'rotate-90' : ''"
        />
        {{ title }}
      </div>
      <span
        v-if="badge"
        class="flex-none rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-600 font-medium tracking-wide uppercase dark:bg-neutral-800 dark:text-neutral-400"
      >
        {{ badge }}
      </span>
    </button>
    <div v-show="open" class="border-t border-neutral-200 px-3 pb-3 pt-3 dark:border-neutral-800">
      <slot />
    </div>
  </div>
</template>
