<script setup lang="ts">
import { settingsSearchProviders } from '@proj-airi/stage-pages/settings-search-providers'
import { IconItem } from '@proj-airi/stage-ui/components'
import { useSettingsSearch } from '@proj-airi/stage-ui/composables/use-settings-search'
import { Input } from '@proj-airi/ui'
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
</script>

<template>
  <div :class="['flex flex-col gap-4', 'font-normal']">
    <div />
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
    <div v-else :class="['flex flex-col gap-4', 'pb-12']">
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
