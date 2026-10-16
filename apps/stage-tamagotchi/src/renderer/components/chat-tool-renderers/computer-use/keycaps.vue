<script setup lang="ts">
/** A key combination as keycaps, for example ⌘ + ⇧ + 4. */
const props = defineProps<{
  keys: string[]
}>()

/** The symbol macOS prints for each key name that AUV takes. Any other key shows as its name. */
const KEY_SYMBOLS: Record<string, string> = {
  cmd: '⌘',
  command: '⌘',
  meta: '⌘',
  shift: '⇧',
  alt: '⌥',
  option: '⌥',
  opt: '⌥',
  ctrl: '⌃',
  control: '⌃',
  return: '↩',
  enter: '↩',
  escape: 'Esc',
  esc: 'Esc',
  tab: '⇥',
  space: 'Space',
  backspace: '⌫',
  delete: '⌫',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
}

function symbolOf(key: string) {
  return KEY_SYMBOLS[key.toLowerCase()] ?? (key.length === 1 ? key.toUpperCase() : key)
}
</script>

<template>
  <span :class="['inline-flex flex-wrap items-center gap-1']">
    <template v-for="(key, index) in props.keys" :key="index">
      <span v-if="index > 0" :class="['text-xs text-neutral-400']" aria-hidden="true">+</span>
      <kbd
        :title="key"
        :class="[
          'min-w-6.5 h-6.5 inline-flex items-center justify-center rounded-md px-1.5 text-[13px] font-semibold font-sans',
          'border border-neutral-200 bg-white shadow-[0_2px_0_#e5e5e5]',
          'dark:border-neutral-700 dark:bg-neutral-800 dark:shadow-[0_2px_0_#404040]',
        ]"
      >{{ symbolOf(key) }}</kbd>
    </template>
  </span>
</template>
