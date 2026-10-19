<script setup lang="ts">
import { Collapsible } from '@proj-airi/ui'

/**
 * The folded line of the chat: hits, a label, and an arrow that unfolds a neutral panel.
 * Tool call groups, the skills of a message, and notices use it, so every folded line in the chat reads the same.
 */
const props = withDefaults(defineProps<{
  /** The icon classes of the hits. The `hits` slot replaces them, for example to animate each hit. */
  icons?: string[]
  /** Where the pill and its panel sit: under the reply, under the owner's message, or in the middle for a notice. */
  align?: 'start' | 'end' | 'center'
  /** How the pill and its panel paint their background; see `ChatHistory`'s `surface`. */
  surface?: 'translucent' | 'opaque'
}>(), {
  icons: () => [],
  align: 'start',
  surface: 'translucent',
})

// A parent can leave out `hits` and `default`. Vue renders the fallback hits, and `$slots.default` is then empty.
defineSlots<{
  /** Hits drawn by the parent. `hitClass` paints each one like the default hits. */
  hits: (props: { hitClass: string[] }) => unknown
  label: (props: Record<string, never>) => unknown
  /** The panel. A pill without it has nothing to unfold, so it shows no arrow and is plain text. */
  default: (props: Record<string, never>) => unknown
}>()

const open = defineModel<boolean>('open', { default: false })

const HIT_CLASS = ['size-4.5 flex items-center justify-center rounded-full', 'bg-white/80 text-primary-600 dark:bg-primary-950/60 dark:text-primary-300']
</script>

<template>
  <!--
    The pill follows the theme color, so it reads as tappable. The unfolded panel is neutral,
    so it stays apart from the reply text whatever theme color the user picks.
  -->
  <Collapsible
    v-model="open"
    :class="[
      'max-w-full flex flex-col gap-1.5',
      props.align === 'end' ? 'items-end' : props.align === 'center' ? 'items-center' : 'items-start',
    ]"
  >
    <template #trigger>
      <!-- A pill without a panel only labels something, so it is no button. -->
      <!-- Each end padding equals the vertical padding, so the first hit and the chevron are concentric with the round ends. -->
      <!-- A pill without a panel ends with its label, which keeps a wider end padding. -->
      <component
        :is="$slots.default ? 'button' : 'span'"
        :type="$slots.default ? 'button' : undefined"
        :aria-expanded="$slots.default ? open : undefined"
        :class="[
          'max-w-full inline-flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 text-xs',
          $slots.default ? 'pr-0.5' : 'pr-2',
          'outline-none transition-colors duration-200',
          'text-primary-700 dark:text-primary-100',
          'focus-visible:ring-2 focus-visible:ring-primary-400/60',
          props.surface === 'opaque'
            ? 'bg-primary-100 shadow-md dark:bg-primary-900'
            : 'bg-primary-100/70 dark:bg-primary-900/50',
          $slots.default ? 'cursor-pointer hover:bg-primary-100 dark:hover:bg-primary-900/80' : '',
        ]"
        @click="open = !open"
      >
        <slot name="hits" :hit-class="HIT_CLASS">
          <span :class="['shrink-0 inline-flex items-center gap-0.5']" aria-hidden="true">
            <span
              v-for="(icon, index) in props.icons"
              :key="index"
              :class="HIT_CLASS"
            >
              <span :class="[icon, 'text-[11px]']" />
            </span>
          </span>
        </slot>
        <span :class="['min-w-0 truncate font-medium']">
          <slot name="label" />
        </span>
        <!-- The chevron sits in a box of the hit size, like the first hit at the other end. -->
        <span v-if="$slots.default" :class="['size-4.5 shrink-0 flex items-center justify-center']" aria-hidden="true">
          <span :class="['i-mingcute:down-line', 'text-xs', 'transition-transform duration-200', open ? 'rotate-180' : '']" />
        </span>
      </component>
    </template>

    <div
      v-if="$slots.default"
      :class="[
        'w-full flex flex-col gap-0.5 rounded-xl p-1.5 text-start',
        'text-neutral-800 dark:text-neutral-100',
        props.surface === 'opaque'
          ? 'bg-neutral-100 shadow-md dark:bg-neutral-800'
          : 'bg-neutral-100/90 dark:bg-neutral-900/80',
      ]"
    >
      <slot />
    </div>
  </Collapsible>
</template>
