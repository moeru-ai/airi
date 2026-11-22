<script setup lang="ts">
import { Input } from '@proj-airi/ui'
import { useTemplateRef } from 'vue'

import { iconButtonClasses, quietIconClasses } from './icon-button-classes'

/**
 * A name field with Save and Cancel, for a conversation or a folder of the conversation list.
 *
 * Enter and Save save, and Escape and Cancel cancel. These hand focus back to the owner with `returnFocus`, so a
 * keyboard user continues from the item that the field names. Focus that leaves the field and its buttons saves a name,
 * or cancels an empty field. The owner decides what an empty save does.
 */
const props = defineProps<{
  label: string
  placeholder: string
  saveLabel: string
  cancelLabel: string
  compact: boolean
}>()

const emit = defineEmits<{
  save: [returnFocus: boolean]
  cancel: [returnFocus: boolean]
}>()

const name = defineModel<string>({ required: true })
const root = useTemplateRef<HTMLElement>('root')

function handleFocusOut(event: FocusEvent) {
  if (event.relatedTarget instanceof Node && root.value?.contains(event.relatedTarget))
    return
  if (name.value.trim())
    emit('save', false)
  else
    emit('cancel', false)
}

/** Focuses the field and selects its name, so typing replaces it. */
function focus() {
  const input = root.value?.querySelector('input')
  input?.focus()
  input?.select()
}

defineExpose({ focus })
</script>

<template>
  <div ref="root" :class="['min-w-0 flex flex-1 items-center gap-0.5']" @focusout="handleFocusOut">
    <Input
      v-model="name"
      :aria-label="props.label"
      :placeholder="props.placeholder"
      @click.stop
      @keydown.enter.stop.prevent="emit('save', true)"
      @keydown.esc.stop="emit('cancel', true)"
    />
    <!-- The buttons keep focus in the field on press, so leaving focus does not save before Cancel runs. -->
    <button
      type="button"
      :aria-label="props.saveLabel"
      :title="props.saveLabel"
      :class="[iconButtonClasses, props.compact ? 'size-8' : 'size-9', 'text-primary-500 hover:text-primary-600 dark:text-primary-400 dark:hover:text-primary-300']"
      @pointerdown.prevent
      @click.stop="emit('save', true)"
    >
      <span aria-hidden="true" :class="['i-mingcute:check-line', props.compact ? 'size-4' : 'size-5']" />
    </button>
    <button
      type="button"
      :aria-label="props.cancelLabel"
      :title="props.cancelLabel"
      :class="[iconButtonClasses, props.compact ? 'size-8' : 'size-9', quietIconClasses]"
      @pointerdown.prevent
      @click.stop="emit('cancel', true)"
    >
      <span aria-hidden="true" :class="['i-mingcute:close-line', props.compact ? 'size-4' : 'size-5']" />
    </button>
  </div>
</template>
