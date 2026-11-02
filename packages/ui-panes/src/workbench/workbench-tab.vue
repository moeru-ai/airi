<script setup lang="ts">
import type { IDockviewPanelHeaderProps } from 'dockview-vue'

import { onScopeDispose, shallowRef } from 'vue'

/**
 * A rounded tab, like a browser tab, that floats in the tab bar without touching its edges. A panel can give an icon
 * class with `params: { icon }`.
 *
 * The tab of the panel that its group shows is selected. `isVisible` tells that. `isActive` only tells whether the
 * group has focus, so an unfocused group still marks its shown tab.
 */
const props = defineProps<{
  params: IDockviewPanelHeaderProps<{ icon?: string }>
}>()

const title = shallowRef(props.params.api.title ?? '')
const selected = shallowRef(props.params.api.isVisible)

const disposables = [
  props.params.api.onDidTitleChange(event => title.value = event.title),
  props.params.api.onDidVisibilityChange(event => selected.value = event.isVisible),
]
onScopeDispose(() => disposables.forEach(disposable => disposable.dispose()))
</script>

<template>
  <div :class="['flex h-full items-center px-0.5']">
    <div
      :class="[
        'airi-workbench-tab',
        'flex h-7 items-center gap-1.5 px-2.5 rounded-lg',
        'text-xs font-medium whitespace-nowrap',
        'transition-colors duration-150',
        selected
          ? 'bg-neutral-100 text-neutral-900 ring-1 ring-black/5 dark:bg-neutral-800 dark:text-neutral-100 dark:ring-white/5'
          : 'text-neutral-500 hover:bg-neutral-100/70 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-200',
      ]"
    >
      <span v-if="params.params?.icon" :class="[params.params.icon, 'size-3.5 shrink-0']" />
      <span>{{ title }}</span>
    </div>
  </div>
</template>
