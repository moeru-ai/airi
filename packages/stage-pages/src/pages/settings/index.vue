<script setup lang="ts">
import { IconItem, RippleGrid } from '@proj-airi/stage-ui/components'
import { useRippleGridState } from '@proj-airi/stage-ui/composables/use-ripple-grid-state'
import { useSettingsSearch } from '@proj-airi/stage-ui/composables/use-settings-search'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { Input } from '@proj-airi/ui'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { settingsSearchProviders } from '../../settings-search-providers'

const router = useRouter()
const resolveAnimation = ref<() => void>()
const { t } = useI18n()
const { lastClickedIndex, setLastClickedIndex } = useRippleGridState()

const settingsStore = useSettings()

const removeBeforeEach = router.beforeEach(async (_, __, next) => {
  if (!settingsStore.usePageSpecificTransitions || settingsStore.disableTransitions) {
    next()
    return
  }

  await new Promise<void>((resolve) => {
    resolveAnimation.value = resolve
  })
  removeBeforeEach()
  next()
})

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
</script>

<template>
  <div flex="~ col gap-4" font-normal>
    <div :class="['relative']">
      <div :class="['i-solar:magnifer-linear', 'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2', 'text-neutral-400 dark:text-neutral-500']" />
      <Input
        v-model="searchQuery"
        type="search"
        :placeholder="t('settings.search.placeholder')"
        :aria-label="t('settings.search.placeholder')"
        :class="['pl-9!']"
      />
    </div>
    <!-- Results appear at once while the user types, so they skip the enter animation of the categories. -->
    <div v-if="searching" :class="['flex flex-col gap-4', 'pb-12']">
      <p v-if="!searchResults.length" :class="['text-sm text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.search.empty', { query: searchQuery.trim() }) }}
      </p>
      <IconItem
        v-for="result in searchResults"
        :key="`${result.to}\n${result.title}`"
        :title="result.title"
        :description="result.description"
        :icon="result.icon"
        :to="result.to"
      />
    </div>
    <div v-else pb-12>
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
