<script setup lang="ts">
import { PageHeader } from '@proj-airi/stage-ui/components'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { useTheme } from '@proj-airi/ui'
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView, useRoute } from 'vue-router'

import { themeColorFromValue, useThemeColor } from '../composables/theme-color'

const route = useRoute()
const { isDark: dark } = useTheme()
const { t } = useI18n()
const providersStore = useProvidersStore()
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

  try {
    const metadata = providersStore.getProviderMetadata(providerId)
    return t(metadata.nameKey)
  }
  catch {
    return undefined
  }
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

const { updateThemeColor } = useThemeColor(themeColorFromValue({ light: 'rgb(255 255 255)', dark: 'rgb(18 18 18)' }))
watch(dark, () => updateThemeColor(), { immediate: true })
watch(route, () => updateThemeColor(), { immediate: true })
onMounted(() => updateThemeColor())
</script>

<template>
  <div
    :style="{
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingRight: 'env(safe-area-inset-right, 0px)',
      paddingLeft: 'env(safe-area-inset-left, 0px)',
    }"
    h-full w-full
  >
    <!-- Content -->
    <div class="max-h-full px-3 py-0 2xl:max-w-screen-2xl md:py-0 xl:px-4" flex="~ col" mx-auto h-full min-h-0>
      <PageHeader
        :title="routeHeaderMetadata?.title || ''"
        :subtitle="routeHeaderMetadata?.subtitle"
        :disable-back-button="route.path === '/settings'"
      />
      <div id="settings-scroll-container" relative min-h-0 flex-1 overflow-y-auto scrollbar-none>
        <RouterView />
      </div>
    </div>
  </div>
</template>
