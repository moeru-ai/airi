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
          class="text-lg text-muted-foreground transition group-hover:text-foreground"
          :class="{ '-rotate-90': !open }"
        />
      </CollapsibleTrigger>
      <CollapsibleContent class="overflow-hidden data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown">
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
