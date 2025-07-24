<script setup lang="ts">
import type { SearchResult } from 'minisearch'
import type { GenericComponentInstance } from 'reka-ui'
import type { Ref } from 'vue'

// @ts-expect-error ignoring
import Mark from 'mark.js/src/vanilla.js'
import MiniSearch from 'minisearch'

import { Icon } from '@iconify/vue'
import { computedAsync, debouncedWatch } from '@vueuse/core'
import { DialogClose, ListboxContent, ListboxFilter, ListboxItem, ListboxRoot } from 'reka-ui'
import { useData } from 'vitepress'
import { markRaw, nextTick, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { LRUCache } from '../functions/cache'

const emits = defineEmits<{
  close: []
}>()

const { localeIndex } = useData()
const { t } = useI18n()

const filterText = ref('')
const enableNoResults = ref(false)
const resultsEl = shallowRef<HTMLElement>()
const searchIndexData = shallowRef()
const results: Ref<(SearchResult & Result)[]> = shallowRef([])
const listboxRef = ref<GenericComponentInstance<typeof ListboxRoot>>()

interface Result {
  title: string
  titles: string[]
  text?: string
}

onMounted(() => {
  // @ts-expect-error internal function
  import('@localSearchIndex').then((m) => {
    searchIndexData.value = m.default
  })
})

const mark = computedAsync(async () => {
  if (!resultsEl.value)
    return
  return markRaw(new Mark(resultsEl.value))
}, null)

const searchIndex = computedAsync(async () =>
  markRaw(
    MiniSearch.loadJSON<Result>(
      (await searchIndexData.value[localeIndex.value]?.())?.default,
      {
        fields: ['title', 'titles', 'text'],
        storeFields: ['title', 'titles'],
        searchOptions: {
          fuzzy: 0.2,
          prefix: true,
          boost: { title: 4, text: 2, titles: 1 },
        },
      },
    ),
  ),
)

const cache = new LRUCache(16) // 16 files

debouncedWatch(
  () => [searchIndex.value, filterText.value] as const,
  async ([index, filterTextValue], old, onCleanup) => {
    if (old?.[0] !== index) {
      // in case of hmr
      cache.clear()
    }

    let canceled = false
    onCleanup(() => {
      canceled = true
    })

    if (!index)
      return

    // Search
    results.value = index
      .search(filterTextValue)
      .slice(0, 16) as (SearchResult & Result)[]

    if (canceled)
      return

    const terms = new Set<string>()

    results.value = results.value.map((r) => {
      const [id, anchor] = r.id.split('#')
      const map = cache.get(id)
      const text = map?.get(anchor) ?? ''
      for (const term in r.match) {
        terms.add(term)
      }
      return { ...r, text }
    })

    await nextTick()
    if (canceled)
      return

    await new Promise((r) => {
      mark.value?.unmark({
        done: () => {
          mark.value?.markRegExp(formMarkRegex(terms), { done: r })
        },
      })
    })

    enableNoResults.value = true
    listboxRef.value?.highlightFirstItem()
  },
  { debounce: 200, immediate: true },
)

watch(filterText, () => {
  enableNoResults.value = false
})

function formMarkRegex(terms: Set<string>) {
  return new RegExp(
    [...terms]
      .sort((a, b) => b.length - a.length)
      .map(term => `(${term.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&').replace(/-/g, '\\x2d')})`)
      .join('|'),
    'gi',
  )
}
</script>

<template>
  <ListboxRoot ref="listboxRef">
    <div class="list-box w-full flex items-center px-6">
      <ListboxFilter
        v-model="filterText"
        class="placeholder:text-muted-foreground h-12 w-full flex-1 bg-transparent text-sm outline-none md:h-14 focus:outline-none"
        :placeholder="t('docs.theme.search.placeholder')"
        auto-focus
      />
      <DialogClose>
        <Icon icon="lucide:x" />
      </DialogClose>
    </div>

    <ListboxContent
      :ref="(node) => {
        if (node && '$el' in node) {
          resultsEl = node.$el
        }
      }"
      as="ul"
      class="border-muted max-h-[55vh] overflow-auto border-t md:border-y empty:hidden md:empty:block md:empty:border-t-0"
    >
      <ListboxItem
        v-for="p in results"
        :key="p.id"
        :value="p.id"
        class="text-muted-foreground text-sm data-[highlighted]:bg-primary/10 data-[highlighted]:text-primary data-[highlighted]:font-semibold"
        as-child
        @select="emits('close')"
      >
        <a
          :href="p.id"
          class="w-full inline-flex px-6 py-4"
        >
          <div class="flex flex-wrap items-center">
            <!-- <span>#</span> -->
            <span
              v-for="(title, index) in p.titles"
              :key="index"
              class="flex items-center"
            >
              <span
                class="text"
                v-html="title"
              />
              <Icon
                icon="lucide:chevron-right"
                inline
                class="mx-1 md:mx-2"
              />
            </span>
            <span>
              <span
                class="text"
                v-html="p.title"
              />
            </span>
          </div>
        </a>
      </ListboxItem>

      <li
        v-if="filterText && !results.length && enableNoResults"
        class="text-foreground flex items-center justify-center p-16 text-sm"
      >
        No results for "<strong>{{ filterText }}</strong>"
      </li>
    </ListboxContent>

    <div class="list-box-tips items-center gap-4 px-6 py-4 text-sm hidden md:flex">
      <span class="inline-flex items-center gap-1 leading-4">
        <kbd aria-label="Up arrow" data-keyboard-key="up-arrow" mr-1 inline-block />
        <kbd aria-label="Down arrow" data-keyboard-key="down-arrow" />
        to navigate
      </span>
      <span class="inline-flex items-center gap-1 leading-4">
        <kbd aria-label="Enter" data-keyboard-key="enter">
          enter
        </kbd>
        to select
      </span>
      <span class="inline-flex items-center gap-1 leading-4">
        <kbd aria-label="Escape" data-keyboard-key="esc">esc</kbd>
        to close
      </span>
    </div>
  </ListboxRoot>
</template>
