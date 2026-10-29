<script setup lang="ts">
import { computed, useSlots } from 'vue'

/** Status meaning of an alert. Each tone has a fixed palette and icon. */
export type AlertTone = 'info' | 'success' | 'warning' | 'danger'

/** Where the `actions` slot renders. */
export type AlertActionsPlacement = 'end' | 'bottom'

/** How assistive technology announces the alert. */
export type AlertLive = 'off' | 'polite' | 'assertive'

const props = withDefaults(defineProps<{
  /** Status meaning. `info` follows the theme hue. @default 'info' */
  tone?: AlertTone
  /** Short summary. Use the `title` slot for rich content. */
  title?: string
  /** Iconify class that replaces the tone icon. */
  icon?: string
  /** Replaces the icon with a spinner for an operation that is still running. @default false */
  loading?: boolean
  /**
   * `end` puts actions at the right of a one-line message. `bottom` puts them under the body.
   * @default 'bottom' with a title, 'end' without a title
   */
  actionsPlacement?: AlertActionsPlacement
  /** Shows a close button that emits `dismiss`. The parent owns the visibility. @default false */
  dismissible?: boolean
  /** Accessible name of the close button. @default 'Dismiss' */
  dismissLabel?: string
  /**
   * Announces the alert when it appears. Use `polite` or `assertive` only for an alert that appears after an action.
   * A static alert that renders with the page keeps `off`, so a screen reader does not read it on page load.
   * @default 'off'
   */
  live?: AlertLive
}>(), { tone: 'info', loading: false, dismissible: false, dismissLabel: 'Dismiss', live: 'off' })

const emit = defineEmits<{
  /** The user clicked the close button. */
  dismiss: []
}>()

defineSlots<{
  /** Body content. Links, `code`, `strong`, paragraphs, and lists get styles. Without a title, the body uses the tone color. */
  default: (props: Record<string, unknown>) => unknown
  /** Rich title content. Replaces the `title` prop. */
  title: (props: Record<string, unknown>) => unknown
  /** Custom icon. Replaces the tone icon and the spinner. */
  icon: (props: Record<string, unknown>) => unknown
  /** Next actions. Use at most one tone-colored button and one neutral button. */
  actions: (props: Record<string, unknown>) => unknown
}>()

const slots = useSlots()

const toneClasses: Record<AlertTone, { container: string, icon: string, title: string, iconName: string }> = {
  info: {
    container: 'bg-primary-500/10 dark:bg-primary-400/12',
    icon: 'text-primary-500 dark:text-primary-400',
    title: 'text-primary-700 dark:text-primary-200',
    iconName: 'i-mingcute:information-fill',
  },
  success: {
    container: 'bg-green-500/10 dark:bg-green-400/12',
    icon: 'text-green-500 dark:text-green-400',
    title: 'text-green-700 dark:text-green-200',
    iconName: 'i-mingcute:check-circle-fill',
  },
  warning: {
    container: 'bg-amber-500/12 dark:bg-amber-400/12',
    icon: 'text-amber-500 dark:text-amber-400',
    title: 'text-amber-700 dark:text-amber-200',
    iconName: 'i-mingcute:warning-fill',
  },
  danger: {
    container: 'bg-red-500/10 dark:bg-red-400/12',
    icon: 'text-red-500 dark:text-red-400',
    title: 'text-red-700 dark:text-red-200',
    iconName: 'i-mingcute:close-circle-fill',
  },
}

const tone = computed(() => toneClasses[props.tone])
const hasTitle = computed(() => !!props.title || !!slots.title)
const role = computed(() => ({ off: undefined, polite: 'status', assertive: 'alert' } as const)[props.live])
const placement = computed<AlertActionsPlacement>(() => props.actionsPlacement ?? (hasTitle.value ? 'bottom' : 'end'))
const iconClass = computed(() => props.loading
  ? 'i-mingcute:loading-fill animate-spin'
  : props.icon ?? tone.value.iconName)
</script>

<template>
  <div
    :data-tone="props.tone"
    :role="role"
    :class="[
      'flex items-start gap-2.5',
      'rounded-xl px-3.5 py-3',
      'text-sm leading-5',
      tone.container,
    ]"
  >
    <div aria-hidden="true" :class="['flex h-5 shrink-0 items-center', tone.icon]">
      <slot name="icon">
        <div :class="[iconClass, 'size-4.5']" />
      </slot>
    </div>

    <div :class="['min-w-0 flex flex-1 flex-col gap-0.5']">
      <div v-if="hasTitle" :class="['font-medium', tone.title]">
        <slot name="title">
          {{ props.title }}
        </slot>
      </div>
      <div
        v-if="slots.default"
        :class="[
          'break-words',
          hasTitle ? 'text-neutral-600 dark:text-neutral-300' : tone.title,
          '[&_a]:font-medium [&_a]:underline [&_a]:underline-offset-2',
          '[&_strong]:font-semibold',
          '[&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]',
          '[&_code]:bg-black/6 dark:[&_code]:bg-white/10',
          '[&_p+p]:mt-1.5',
          '[&_ul]:mt-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:mt-1 [&_ol]:list-decimal [&_ol]:pl-4',
        ]"
      >
        <slot />
      </div>
      <div v-if="slots.actions && placement === 'bottom'" :class="['mt-2 flex flex-wrap items-center gap-2']">
        <slot name="actions" />
      </div>
    </div>

    <div v-if="slots.actions && placement === 'end'" :class="['flex shrink-0 items-center gap-2 self-center']">
      <slot name="actions" />
    </div>

    <button
      v-if="props.dismissible"
      type="button"
      :aria-label="props.dismissLabel"
      :class="[
        '-my-0.5 -mr-1.5 size-6 shrink-0',
        'flex items-center justify-center rounded-md',
        'text-neutral-500 dark:text-neutral-400',
        'transition-colors duration-200 ease-in-out',
        'hover:bg-black/5 hover:text-neutral-700 dark:hover:bg-white/10 dark:hover:text-neutral-200',
        'focus-visible:outline-2 focus-visible:outline-current focus-visible:outline-offset-1',
      ]"
      @click="emit('dismiss')"
    >
      <div :class="['i-mingcute:close-line size-4']" />
    </button>
  </div>
</template>
