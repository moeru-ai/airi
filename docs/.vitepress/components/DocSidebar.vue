<script setup lang="ts">
import type { DefaultTheme } from 'vitepress/theme'

import DocSidebarItem from './DocSidebarItem.vue'

defineProps<{
  items: DefaultTheme.SidebarItem[]
}>()
</script>

<template>
  <DocSidebarItem
    v-for="item in items"
    :key="item.text"
    :item="item"
  />
</template>
