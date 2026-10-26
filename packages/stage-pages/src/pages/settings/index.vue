<script setup lang="ts">
import { IconItem, RippleGrid, SettingsNeedsAttention, SettingsSearchField, SettingsSearchResults } from '@proj-airi/stage-ui/components'
import { useRippleGridState } from '@proj-airi/stage-ui/composables/use-ripple-grid-state'
import { useSettingsNeedsAttention } from '@proj-airi/stage-ui/composables/use-settings-needs-attention'
import { useSettingsSearch } from '@proj-airi/stage-ui/composables/use-settings-search'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { settingsSearchProviders } from '../../settings-search-providers'

const router = useRouter()
const { t } = useI18n()
const { lastClickedIndex, setLastClickedIndex } = useRippleGridState()

const settings = computed(() => {
  return router
    .getRoutes()
    .filter(route => route.meta?.settingsEntry)
    .sort((a, b) => (Number(a.meta?.order ?? 0) - Number(b.meta?.order ?? 0)))
    .map(route => ({
      title: route.meta?.titleKey ? t(route.meta.titleKey as string) : (route.meta?.title as string | undefined),
      description: route.meta?.descriptionKey ? t(route.meta.descriptionKey as string) : (route.meta?.description as string | undefined) || '',
      icon: route.meta?.icon as string | undefined,
      to: route.path,
    }))
})

const searchQuery = ref('')
const searchResults = useSettingsSearch(searchQuery, settingsSearchProviders)
const searching = computed(() => searchQuery.value.trim() !== '')
const { items: needsAttention, dismiss: dismissNeedsAttention } = useSettingsNeedsAttention()
</script>

<template>
  <div flex="~ col gap-4" font-normal>
    <!-- The search stays at the top while the list scrolls under it, as the page header does above it. -->
    <!-- It is the first element, so it rests where it sticks and does not move when the list starts to scroll. -->
    <div :class="['sticky top-0 z-10', 'bg-$bg-color', 'pb-2']">
      <SettingsSearchField v-model="searchQuery" />
    </div>
    <!-- Results appear at once while the user types, so they skip the enter animation of the categories. -->
    <div v-if="searching" :class="['pb-12']">
      <p v-if="!searchResults.length" :class="['text-sm text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.search.empty', { query: searchQuery.trim() }) }}
      </p>
      <SettingsSearchResults v-else :results="searchResults" :query="searchQuery" />
    </div>
    <div v-else pb-12>
      <!-- Providers whose last check failed. It is secondary, so it scrolls with the list. -->
      <SettingsNeedsAttention
        :items="needsAttention"
        :class="['mb-4']"
        @fix="item => router.push(item.to)"
        @dismiss="item => dismissNeedsAttention(item.id)"
      />
      <RippleGrid
        :items="settings"
        :get-key="item => item.to"
        :columns="1"
        :origin-index="lastClickedIndex"
        @item-click="({ globalIndex }) => setLastClickedIndex(globalIndex)"
      >
        <template #item="{ item }">
          <IconItem
            :title="item.title || ''"
            :description="item.description"
            :icon="item.icon"
            :to="item.to"
          />
        </template>
      </RippleGrid>
    </div>
    <div
      v-motion
      text="neutral-200/50 dark:neutral-600/20" pointer-events-none
      fixed top="[calc(100dvh-12rem)]" bottom-0 right--10 z--1
      :initial="{ scale: 0.9, opacity: 0, rotate: 180 }"
      :enter="{ scale: 1, opacity: 1, rotate: 0 }"
      :duration="500"
      size-60
      flex items-center justify-center
    >
      <div v-motion text="60" i-solar:settings-bold-duotone />
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.title
  stageTransition:
    name: slide
</route>
