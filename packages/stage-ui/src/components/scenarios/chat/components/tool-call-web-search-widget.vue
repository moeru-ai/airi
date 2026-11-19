<script setup lang="ts">
import type { WebSearchResultLink } from '../../../../tools/web-search'

import { isWebUrl } from '@proj-airi/stage-shared'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

/** The hits of one web search, as one card per source. A card opens its page in the browser. */
const props = defineProps<{
  query: string
  links: WebSearchResultLink[]
}>()

const { t } = useI18n()

function parseUrl(value: string) {
  try {
    return new URL(value)
  }
  catch {
    return undefined
  }
}

const cards = computed(() => props.links.map((link, index) => {
  const site = parseUrl(link.url)?.hostname ?? link.url
  // As in the citations of a reply, only a web page becomes a link. A hit with another scheme stays a card without a link.
  const href = isWebUrl(link.url) ? link.url : undefined
  return { key: `${index}:${link.url}`, href, title: link.title, snippet: link.snippet, favicon: link.favicon, site, initial: site.charAt(0).toUpperCase() }
}))

// A site without an icon, or with an icon that does not load, shows the first letter of its name.
const brokenIcons = ref(new Set<string>())

function markBroken(key: string) {
  brokenIcons.value = new Set(brokenIcons.value).add(key)
}
</script>

<template>
  <div :class="['flex flex-col gap-1.5']">
    <span :class="['text-[11px]', 'text-neutral-500 dark:text-neutral-400']">
      {{ t('stage.chat.web-search-tool-call.results', { query: props.query, count: props.links.length }) }}
    </span>
    <ul :class="['flex flex-col gap-1.5']">
      <li v-for="card in cards" :key="card.key">
        <a
          :href="card.href"
          :target="card.href ? '_blank' : undefined"
          rel="noopener noreferrer"
          :class="[
            'flex items-start gap-2 rounded-lg px-2 py-1.5 outline-none',
            'transition-colors duration-200',
            'bg-white/75 hover:bg-white dark:bg-neutral-800/60 dark:hover:bg-neutral-800',
            'focus-visible:ring-2 focus-visible:ring-primary-400/60',
          ]"
        >
          <img
            v-if="card.favicon && !brokenIcons.has(card.key)"
            :src="card.favicon"
            alt=""
            :class="['mt-px size-5 shrink-0 rounded-[5px] object-contain']"
            @error="markBroken(card.key)"
          >
          <span
            v-else
            :class="['mt-px size-5 shrink-0 inline-flex items-center justify-center rounded-[5px]', 'text-[11px] font-semibold text-white', 'bg-primary-500']"
            aria-hidden="true"
          >{{ card.initial }}</span>
          <span :class="['min-w-0 flex flex-col']">
            <span :class="['truncate text-xs', 'text-neutral-800 dark:text-neutral-100']">{{ card.title }}</span>
            <span :class="['truncate text-[10px]', 'text-neutral-400 dark:text-neutral-500']">{{ card.site }}</span>
            <span v-if="card.snippet" :class="['mt-0.5 line-clamp-2 text-[11px]', 'text-neutral-500 dark:text-neutral-400']">{{ card.snippet }}</span>
          </span>
        </a>
      </li>
    </ul>
  </div>
</template>
