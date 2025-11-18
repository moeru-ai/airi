<script setup lang="ts">
import type { SidebarItem } from '../composables/sidebar'

import { useCurrentElement } from '@vueuse/core'
import { computed, watch } from 'vue'

import { useSidebarControl } from '../composables/sidebar'

const props = defineProps<{
  item: SidebarItem
}>()
const { isActiveLink } = useSidebarControl(computed(() => props.item))

const elRef = useCurrentElement()

watch(isActiveLink, () => {
  if (isActiveLink.value && elRef.value instanceof HTMLElement) {
    elRef.value.scrollIntoView({
      block: 'center',
    })
  }
}, { immediate: true })
</script>

<template>
  <div
    class="text-muted-foreground hover:bg-card flex items-center rounded-lg text-sm transition-colors duration-150 ease-in-out"
    :class="{ 'is-active !bg-primary/10 !text-primary font-semibold': isActiveLink }"
  >
    <a
      :href="item.link"
      class="h-[2.15rem] w-full inline-flex items-center px-4"
      v-html="item.text"
    />
  </div>
</template>
