<script setup lang="ts">
import { isStageTamagotchi } from '@proj-airi/stage-shared'
import { PageHeader } from '@proj-airi/stage-ui/components'
import { settingsFullBleedHostKey } from '@proj-airi/stage-ui/composables/settings-full-bleed'
import { useSettingsSearchReveal } from '@proj-airi/stage-ui/composables/use-settings-search'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { useTheme } from '@proj-airi/ui'
import { computed, onMounted, provide, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView, useRoute } from 'vue-router'

import HeaderLink from '../components/Layouts/HeaderLink.vue'

import { themeColorFromValue, useThemeColor } from '../composables/theme-color'

const route = useRoute()
const scrollContainer = useTemplateRef<HTMLDivElement>('scrollContainer')

// RouterView reuses this viewport across settings and devtools pages. Reset it
// after the new page renders, but preserve scrolling for query or anchor changes.
watch(() => route.path, () => {
  if (scrollContainer.value)
    scrollContainer.value.scrollTop = 0
}, { flush: 'post' })
// A search result opens its page with the setting in the query. Scroll to that row and highlight it.
useSettingsSearchReveal(scrollContainer)

// A page that fills the screen, for example the phone model editor, claims the area under the header.
const fullBleedClaims = ref(0)
const fullBleed = computed(() => fullBleedClaims.value > 0)
provide(settingsFullBleedHostKey, {
  claim() {
    fullBleedClaims.value++
    let released = false
    return () => {
      if (released)
        return

      released = true
      fullBleedClaims.value--
    }
  },
})

const { isDark: dark } = useTheme()
const { t } = useI18n()
const providersStore = useProviderStore()
const routeMeta = computed(() => route.meta as {
  titleKey?: string
  subtitleKey?: string
  title?: string
  subtitle?: string
  disableBackButton?: boolean
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
    :class="['h-full w-full', 'flex flex-col']"
  >
    <!-- Header -->
    <div
      v-if="!isStageTamagotchi()"
      :class="['px-0 py-1 hidden sm:block', 'md:px-3 md:py-3', 'w-full gap-2', 'bg-$bg-color']"
    >
      <HeaderLink />
    </div>
    <!-- Content -->
    <div
      :class="[
        'px-3 py-0 2xl:max-w-screen-2xl md:py-0 xl:px-4',
        isStageTamagotchi() ? 'sm:max-h-[calc(100%)] max-h-[calc(100%)]' : 'sm:max-h-[calc(100%-56px)] max-h-full',
        'relative mx-auto flex min-h-0 w-full flex-1 flex-col',
      ]"
    >
      <!-- Over a full-bleed page, the header floats on top. Only its buttons take input, so the page under it stays usable. -->
      <div
        :class="[
          fullBleed ? 'pointer-events-none absolute inset-x-3 top-0 z-10 xl:inset-x-4 [&_button]:pointer-events-auto' : '',
        ]"
      >
        <PageHeader
          :title="routeHeaderMetadata?.title || ''"
          :subtitle="routeHeaderMetadata?.subtitle"
          :disable-back-button="routeMeta.disableBackButton || (isStageTamagotchi() && route.path === '/settings')"
          :transparent="fullBleed"
        />
      </div>
      <!-- The scroll area reaches the screen edges and pads its content instead. A full-bleed page gets no padding. -->
      <div
        id="settings-scroll-container"
        ref="scrollContainer"
        :class="[
          'relative', 'min-h-0', 'flex-1', 'overflow-y-auto', 'scrollbar-none',
          '-mx-3 xl:-mx-4',
          fullBleed ? '' : 'px-3 xl:px-4',
        ]"
      >
        <RouterView />
      </div>
    </div>
  </div>
</template>
