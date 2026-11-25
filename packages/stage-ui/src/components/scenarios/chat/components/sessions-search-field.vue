<script setup lang="ts">
import { Input } from '@proj-airi/ui'
import { useTemplateRef } from 'vue'

import { iconButtonClasses, quietIconClasses } from './icon-button-classes'

/**
 * The search field of the conversation list. It takes the place of the list title while the user searches, at the
 * height of that title, so the list does not move.
 *
 * Escape clears the text first, then closes the field. A field that loses focus with no text closes too.
 */
const props = defineProps<{
  placeholder: string
  /** The name of the button at the end of the field. It closes the field, or clears the text of a persistent field. */
  closeLabel: string
  compact: boolean
  /**
   * The field stays below a list title that has no room for it, as in the floating chat. Its button only clears the
   * text and shows while there is text. Escape on an empty field goes on to the list.
   */
  persistent?: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const query = defineModel<string>({ required: true })
const root = useTemplateRef<HTMLElement>('root')

function focus() {
  root.value?.querySelector('input')?.focus()
}

function handleEscape(event: KeyboardEvent) {
  if (query.value) {
    query.value = ''
    event.stopPropagation()
    return
  }
  if (props.persistent)
    return
  event.stopPropagation()
  emit('close')
}

function handleFocusOut(event: FocusEvent) {
  if (props.persistent || (event.relatedTarget instanceof Node && root.value?.contains(event.relatedTarget)))
    return
  if (!query.value)
    emit('close')
}

/** The button closes the field. A persistent field stays, so its button clears the text and gives focus back to it. */
function handleButton() {
  if (!props.persistent) {
    emit('close')
    return
  }
  query.value = ''
  focus()
}

defineExpose({ focus })
</script>

<template>
  <div
    ref="root"
    :class="['relative flex shrink-0 items-center', props.compact ? 'min-h-8' : 'min-h-11']"
    @keydown.esc="handleEscape"
    @focusout="handleFocusOut"
  >
    <span
      aria-hidden="true"
      :class="[
        'i-mingcute:search-line pointer-events-none absolute top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500',
        props.compact ? 'left-2.5 size-4' : 'left-3 size-5',
      ]"
    />
    <!--
      A quiet fill in the tint of a row hover, with no border and no shadow, so the field reads as part of the list and
      not as a form. The theme color shows only while the field has focus.
    -->
    <Input
      v-model="query"
      variant="primary-dimmed"
      role="searchbox"
      enterkeyhint="search"
      :aria-label="props.placeholder"
      :placeholder="props.placeholder"
      :class="[
        'border-transparent! bg-neutral-500/10! shadow-none! dark:bg-white/8!',
        'focus:border-primary-500/40! dark:focus:border-primary-400/40!',
        props.compact ? 'h-8 pl-8! pr-8! text-sm!' : 'h-11 rounded-xl! pl-10! pr-11! text-base!',
      ]"
    />
    <button
      v-if="!props.persistent || query"
      type="button"
      :aria-label="props.closeLabel"
      :title="props.closeLabel"
      :class="[iconButtonClasses, quietIconClasses, 'absolute top-1/2 -translate-y-1/2', props.compact ? 'right-0.5 size-7' : 'right-1 size-9']"
      @click="handleButton"
    >
      <span aria-hidden="true" :class="['i-mingcute:close-line', props.compact ? 'size-4' : 'size-5']" />
    </button>
  </div>
</template>
