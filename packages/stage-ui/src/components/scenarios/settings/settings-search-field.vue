<script setup lang="ts">
import { Input } from '@proj-airi/ui'
import { useEventListener } from '@vueuse/core'
import { useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

const query = defineModel<string>({ required: true })

const { t } = useI18n()
const field = useTemplateRef<HTMLElement>('field')

// Cmd+F or Ctrl+F, the find shortcut of the browser, finds settings while this field is on the page.
// It moves the focus to the field from anywhere on the page, and selects the old query, so typing replaces it.
useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  const command = event.metaKey || event.ctrlKey
  if (!command || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'f')
    return
  event.preventDefault()
  const input = field.value?.querySelector('input')
  input?.focus()
  input?.select()
})
</script>

<template>
  <div ref="field" :class="['settings-search-field', 'relative']">
    <div :class="['i-solar:magnifer-linear', 'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2', 'text-neutral-400 dark:text-neutral-500']" />
    <Input
      v-model="query"
      type="search"
      :placeholder="t('settings.search.placeholder')"
      :aria-label="t('settings.search.placeholder')"
      :class="['pl-9!']"
    />
  </div>
</template>

<style scoped>
/* The clear button is the native one of a search field, drawn as the magnifier on the left is: a linear icon in light gray. */
.settings-search-field :deep(input[type='search']::-webkit-search-cancel-button) {
  --at-apply: 'i-solar:close-circle-linear size-4 text-neutral-400 dark:text-neutral-500';
  -webkit-appearance: none;
  appearance: none;
  cursor: pointer;
}

.settings-search-field :deep(input[type='search']::-webkit-search-cancel-button:hover) {
  --at-apply: 'text-neutral-600 dark:text-neutral-300';
}
</style>
