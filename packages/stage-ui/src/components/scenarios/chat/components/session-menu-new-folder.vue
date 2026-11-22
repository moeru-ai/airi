<script setup lang="ts">
import { Button, Input, MenuItem } from '@proj-airi/ui'
import { nextTick, ref, shallowRef, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * The New folder entry of a conversation menu. Selecting it keeps the menu open and turns the entry into a name field
 * with a Create button. The menu owner closes the menu after `create`.
 */
const emit = defineEmits<{
  create: [name: string]
}>()

const { t } = useI18n()
const editing = shallowRef(false)
const name = ref('')
const field = useTemplateRef<HTMLElement>('field')

async function startEditing(event: Event) {
  event.preventDefault()
  editing.value = true
  await nextTick()
  // The menu moves focus to its own container when the selected item unmounts. That runs before this continuation.
  field.value?.querySelector('input')?.focus()
}

function create() {
  const value = name.value.trim()
  if (value)
    emit('create', value)
}
</script>

<template>
  <!-- The text button says what happens. A check mark in the same menu marks the current choice. -->
  <div v-if="editing" ref="field" :class="['flex items-center gap-1.5 px-1 py-1']">
    <Input
      v-model="name"
      :aria-label="t('stage.chat.sessions.folder-name')"
      :placeholder="t('stage.chat.sessions.folder-name-placeholder')"
      @keydown.enter.stop.prevent="create"
    />
    <Button
      size="sm"
      color="primary"
      :disabled="!name.trim()"
      :class="['shrink-0']"
      @click="create"
    >
      {{ t('stage.chat.sessions.create-folder') }}
    </Button>
  </div>
  <MenuItem v-else @select="startEditing">
    <span aria-hidden="true" :class="['i-mingcute:new-folder-line size-4 shrink-0']" />
    {{ t('stage.chat.sessions.new-folder') }}
  </MenuItem>
</template>
