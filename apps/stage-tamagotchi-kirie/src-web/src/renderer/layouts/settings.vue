<script setup lang="ts">
import { isStageTamagotchi } from '@proj-airi/stage-shared'
import { PageHeader } from '@proj-airi/stage-ui/components'
import { useSettingsSearchReveal } from '@proj-airi/stage-ui/composables/use-settings-search'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView, useRoute } from 'vue-router'

import WindowTitleBar from '../components/Window/TitleBar.vue'

import { useRestoreScroll } from '../composables/use-restore-scroll'

const route = useRoute()
const { t } = useI18n()
const providersStore = useProviderStore()
const scrollContainer = ref<HTMLElement>()
useRestoreScroll(scrollContainer)
// A search result opens its page with the setting in the query. Scroll to that row and highlight it.
// This watcher comes after the scroll restore, so it scrolls on from the restored position.
useSettingsSearchReveal(scrollContainer)

const routeMeta = computed(() => route.meta as {
  titleKey?: string
  subtitleKey?: string
  title?: string
  subtitle?: string
})

const providerTitle = computed(() => {
  if (!route.path.startsWith('/settings/providers/'))
    return undefined

  const segments = route.path.split('/').filter(Boolean)
  const providerId = segments[3]

  if (!providerId)
    return undefined

  return providersStore.findProviderDefinition(providerId)?.nameLocalize({ t })
})

// const activeSettingsTutorial = ref('default')
const routeHeaderMetadata = computed(() => {
  const { titleKey, subtitleKey, title, subtitle } = routeMeta.value
  const resolvedTitle = titleKey ? t(titleKey) : title
  const resolvedSubtitle = subtitleKey ? t(subtitleKey) : subtitle

  if (resolvedTitle || resolvedSubtitle) {
    return {
      title: resolvedTitle,
      subtitle: resolvedSubtitle,
    }
  }

  if (providerTitle.value) {
    return {
      title: providerTitle.value,
      subtitle: t('settings.title'),
    }
  }

  return undefined
})
</script>

<template>
  <div :class="['h-full w-full', 'flex flex-col', 'bg-$bg-color']">
    <WindowTitleBar :title="routeHeaderMetadata?.title ?? ''" icon="i-solar:settings-bold" />
    <div
      :style="{
        paddingTop: `44px`,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
      }"
      :class="['min-h-0 flex-1', 'flex flex-col']"
    >
      <!-- The header stays above the scroll container, as in the shared settings layout. -->
      <!-- A sticky part of a page, such as the settings search, then sticks right below it. -->
      <PageHeader
        :title="routeHeaderMetadata?.title ?? ''"
        :subtitle="routeHeaderMetadata?.subtitle ?? ''"
        :disable-back-button="isStageTamagotchi() && route.path === '/settings'"
        :class="['mx-auto max-w-screen-xl', 'px-4']"
      />
      <div ref="scrollContainer" :class="['relative min-h-0 w-full flex-1', 'overflow-y-auto scrollbar-none']">
        <div :class="['mx-auto h-full max-w-screen-xl', 'px-4']">
          <RouterView />
        </div>
      </div>
    </div>
  </div>
</template>
