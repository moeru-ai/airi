<script setup lang="ts">
import type { DefaultTheme } from 'vitepress/theme'

import { Icon } from '@iconify/vue'
import { CollapsibleContent, CollapsibleRoot, CollapsibleTrigger } from 'reka-ui'

import DocSidebarItem from './DocSidebarItem.vue'

defineProps<{
  items: DefaultTheme.SidebarItem[]
}>()
</script>

<template>
  <div
    v-for="item in items"
    :key="item.text"
  >
    <CollapsibleRoot
      v-if="item.items?.length"
      v-slot="{ open }"
      class="mb-6"
      :default-open="true"
    >
      <CollapsibleTrigger class="group w-full inline-flex items-center justify-between pb-2 pl-4 pr-4 text-sm font-bold">
        <span>{{ item.text }}</span>
        <Icon
          icon="lucide:chevron-down"
          class="text-muted-foreground group-hover:text-foreground text-lg transition"
          :class="{ '-rotate-90': !open }"
        />
      </CollapsibleTrigger>
      <CollapsibleContent class="data-[state=open]:animate-slideDown data-[state=closed]:animate-slideUp overflow-hidden">
        <DocSidebarItem
          v-for="subitem in item.items"
          :key="subitem.text"
          :item="subitem"
        />
      </CollapsibleContent>
    </CollapsibleRoot>

    <DocSidebarItem
      v-else
      :item="item"
    />
  </div>
</template>
