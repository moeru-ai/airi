<script setup lang="ts">
import type { SidebarItem } from '../composables/sidebar'

import { Icon } from '@iconify/vue'
import { useCurrentElement } from '@vueuse/core'
import { CollapsibleContent, CollapsibleRoot, CollapsibleTrigger } from 'reka-ui'
import { computed, watch } from 'vue'

import { useSidebarControl } from '../composables/sidebar'

const props = withDefaults(defineProps<{
  item: SidebarItem
  depth?: number
}>(), {
  depth: 0,
})
const { collapsed, hasActiveLink, hasChildren, isActiveLink } = useSidebarControl(computed(() => props.item))

const elRef = useCurrentElement()
const isOpen = computed({
  get: () => !collapsed.value,
  set: (value: boolean) => collapsed.value = !value,
})
const contentStyle = computed(() => {
  return {
    paddingLeft: `${0.75 + props.depth * 0.875}rem`,
  }
})

watch(isActiveLink, () => {
  if (isActiveLink.value && elRef.value instanceof HTMLElement) {
    elRef.value.scrollIntoView({
      block: 'center',
    })
  }
}, { immediate: true })
</script>

<template>
  <CollapsibleRoot
    v-if="hasChildren"
    v-slot="{ open }"
    v-model:open="isOpen"
    class="w-full"
  >
    <CollapsibleTrigger
      :class="[
        'group w-full inline-flex items-center justify-between rounded-lg py-1 pr-3 text-sm transition-colors duration-150 ease-in-out mb-0.5',
        hasActiveLink ? 'text-foreground' : 'text-muted-foreground',
        'hover:bg-primary/10 hover:text-primary',
      ]"
    >
      <span
        :style="contentStyle"
        class="min-w-0 flex-1 truncate text-left font-semibold"
        v-html="item.text"
      />
      <Icon
        icon="lucide:chevron-down"
        class="ml-2 flex-none text-lg text-muted-foreground transition group-hover:text-foreground"
        :class="{ '-rotate-90': !open }"
      />
    </CollapsibleTrigger>
    <CollapsibleContent
      :class="[
        'overflow-hidden data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown flex flex-col gap-1',
      ]"
    >
      <DocSidebarItem
        v-for="subitem in item.items"
        :key="subitem.text"
        :item="subitem"
        :depth="depth + 1"
      />
    </CollapsibleContent>
  </CollapsibleRoot>

  <div
    v-else
    :class="[
      'flex w-full items-center rounded-lg text-sm transition-colors duration-150 ease-in-out hover:bg-card',
      isActiveLink ? 'is-active !bg-primary/10 !text-primary font-semibold' : '',
      'hover:bg-primary/10 hover:text-primary',
    ]"
  >
    <a
      :href="item.link"
      :style="contentStyle"
      class="min-h-[2.15rem] w-full inline-flex items-center py-0.5 pr-3"
      v-html="item.text"
    />
  </div>
</template>
