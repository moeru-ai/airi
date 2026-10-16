<script setup lang="ts">
import type { WebSearchResultLink } from '../../../../tools/web-search'

import { computed } from 'vue'

/** The hits of one web search, as one card per source. A card opens its page in the browser. */
const props = defineProps<{
  links: WebSearchResultLink[]
}>()

const cards = computed(() => props.links.map((link, index) => {
  const site = URL.parse(link.url)?.hostname ?? link.url
  return { key: `${index}:${link.url}`, url: link.url, title: link.title, site, initial: site.charAt(0).toUpperCase() }
}))
</script>

<template>
  <ul :class="['flex flex-col gap-1.5']">
    <li v-for="card in cards" :key="card.key">
      <a
        :href="card.url"
        target="_blank"
        rel="noopener noreferrer"
        :class="[
          'flex items-center gap-2 rounded-lg px-2 py-1.5 outline-none',
          'transition-colors duration-200',
          'bg-white/75 hover:bg-white dark:bg-neutral-800/60 dark:hover:bg-neutral-800',
          'focus-visible:ring-2 focus-visible:ring-primary-400/60',
        ]"
      >
        <span
          :class="['size-5 shrink-0 inline-flex items-center justify-center rounded-[5px]', 'text-[11px] font-semibold text-white', 'bg-primary-500']"
          aria-hidden="true"
        >{{ card.initial }}</span>
        <span :class="['min-w-0 flex flex-col']">
          <span :class="['truncate text-xs', 'text-neutral-800 dark:text-neutral-100']">{{ card.title }}</span>
          <span :class="['truncate text-[10px]', 'text-neutral-400 dark:text-neutral-500']">{{ card.site }}</span>
        </span>
      </a>
    </li>
  </ul>
</template>
