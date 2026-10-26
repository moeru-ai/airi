<script setup lang="ts">
import { settingsSearchProviders } from '@proj-airi/stage-pages/settings-search-providers'
import { IconItem, SettingsNeedsAttention, SettingsSearchField, SettingsSearchResults } from '@proj-airi/stage-ui/components'
import { useSettingsNeedsAttention } from '@proj-airi/stage-ui/composables/use-settings-needs-attention'
import { useSettingsSearch } from '@proj-airi/stage-ui/composables/use-settings-search'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const router = useRouter()
const { t } = useI18n()

const settings = computed(() => {
  return router
    .getRoutes()
    .filter(route => route.meta?.settingsEntry)
    .sort((a, b) => (Number(a.meta?.order ?? 0) - Number(b.meta?.order ?? 0)))
    .map(route => ({
      title: route.meta?.titleKey ? t(route.meta.titleKey as string) : (route.meta?.title as string | undefined) ?? '',
      description: route.meta?.descriptionKey ? t(route.meta.descriptionKey as string) : (route.meta?.description as string | undefined) || '',
      icon: (route.meta?.icon as string | undefined) ?? '',
      to: route.path,
    }))
})

const searchQuery = ref('')
const searchResults = useSettingsSearch(searchQuery, settingsSearchProviders)
const searching = computed(() => searchQuery.value.trim() !== '')
const { items: needsAttention, dismiss: dismissNeedsAttention } = useSettingsNeedsAttention()
</script>

<template>
  <div :class="['flex flex-col gap-4', 'font-normal']">
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
    <div v-else :class="['flex flex-col gap-4', 'pb-12']">
      <!-- Providers whose last check failed. It is secondary, so it scrolls with the list. -->
      <SettingsNeedsAttention
        :items="needsAttention"
        @fix="item => router.push(item.to)"
        @dismiss="item => dismissNeedsAttention(item.id)"
      />
      <IconItem
        v-for="(setting, index) in settings"
        :key="setting.to"
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="250"
        :style="{
          transitionDelay: `${index * 50}ms`,
        }"
        :title="setting.title"
        :description="setting.description"
        :icon="setting.icon"
        :to="setting.to"
      />
    </div>
    <div
      v-motion
      :class="[
        'pointer-events-none text-neutral-200/50 dark:text-neutral-600/20',
        'fixed top-[calc(100dvh-12rem)] bottom-0 right--10 z--1',
        'size-60 flex items-center justify-center',
      ]"
      :initial="{ scale: 0.9, opacity: 0, rotate: 180 }"
      :enter="{ scale: 1, opacity: 1, rotate: 0 }"
      :duration="500"
    >
      <div v-motion :class="['text-60', 'i-solar:settings-bold-duotone']" />
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
