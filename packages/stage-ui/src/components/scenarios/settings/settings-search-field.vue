<script setup lang="ts">
import { Input } from '@proj-airi/ui'
import { useEventListener } from '@vueuse/core'
import { computed, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(defineProps<{
  /** What the field searches, for example "Search cards...". Without it, the field searches the settings. */
  placeholder?: string
  /**
   * - `lg`: the main control at the top of a page, such as the settings home. It has the height and the text of the result rows below it.
   * - `md`: a field in a row of other controls, such as the filters of a list. It has the height of a select.
   *
   * @default 'lg'
   */
  size?: 'md' | 'lg'
}>(), {
  size: 'lg',
})

const query = defineModel<string>({ required: true })

const { t } = useI18n()
const field = useTemplateRef<HTMLElement>('field')
const label = computed(() => props.placeholder ?? t('settings.search.placeholder'))

// Cmd+F or Ctrl+F, the find shortcut of the browser, searches with this field while it is on the page.
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
  <div ref="field" :class="['settings-search-field', `settings-search-field-${props.size}`, 'relative']">
    <div
      :class="[
        'i-solar:magnifer-linear',
        'pointer-events-none absolute top-1/2 -translate-y-1/2',
        'text-neutral-400 dark:text-neutral-500',
        props.size === 'lg' ? 'left-3.5 size-5' : 'left-3 size-4',
      ]"
    />
    <!-- The large field has the corners of the result cards that it stands above. 16px text also keeps iOS from zooming in on focus. -->
    <Input
      v-model="query"
      type="search"
      :placeholder="label"
      :aria-label="label"
      :class="props.size === 'lg' ? ['h-11', 'pl-11! pr-3!', 'text-base!', 'rounded-xl!'] : ['h-9', 'pl-9!']"
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

.settings-search-field-lg :deep(input[type='search']::-webkit-search-cancel-button) {
  --at-apply: 'size-5';
}

.settings-search-field :deep(input[type='search']::-webkit-search-cancel-button:hover) {
  --at-apply: 'text-neutral-600 dark:text-neutral-300';
}
</style>
