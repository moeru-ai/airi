<script setup lang="ts">
import { PageHeader } from '@proj-airi/stage-ui/components'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView, useRoute } from 'vue-router'

import WindowTitleBar from '../components/Window/TitleBar.vue'

const route = useRoute()
const { t } = useI18n()
const providersStore = useProvidersStore()
const { allProvidersMetadata } = storeToRefs(providersStore)

const routeHeaderMetadataMap = computed(() => {
  const map: Record<string, { subtitle?: string, title: string }> = {
    '/settings/airi-card': {
      subtitle: t('settings.title'),
      title: t('settings.pages.card.title'),
    },
    '/settings/system': {
      subtitle: t('settings.title'),
      title: t('settings.pages.system.title'),
    },
    '/settings/system/general': {
      subtitle: t('settings.title'),
      title: t('settings.pages.system.general.title'),
    },
    '/settings/system/color-scheme': {
      subtitle: t('settings.title'),
      title: t('settings.pages.system.color-scheme.title'),
    },
    '/settings/system/window-shortcuts': {
      subtitle: t('settings.title'),
      title: t('tamagotchi.settings.pages.system.window-shortcuts.title'),
    },
    '/settings/system/developer': {
      subtitle: t('settings.title'),
      title: t('settings.pages.system.developer.title'),
    },
    '/settings/memory': {
      subtitle: t('settings.title'),
      title: t('settings.pages.memory.title'),
    },
    '/settings/models': {
      subtitle: t('settings.title'),
      title: t('settings.pages.models.title'),
    },
    '/settings/modules': {
      subtitle: t('settings.title'),
      title: t('settings.pages.modules.title'),
    },
    '/settings/modules/consciousness': {
      subtitle: t('settings.title'),
      title: t('settings.pages.modules.consciousness.title'),
    },
    '/settings/modules/speech': {
      subtitle: t('settings.title'),
      title: t('settings.pages.modules.speech.title'),
    },
    '/settings/modules/hearing': {
      subtitle: t('settings.title'),
      title: t('settings.pages.modules.hearing.title'),
    },
    '/settings/modules/memory-short-term': {
      subtitle: t('settings.title'),
      title: t('settings.pages.modules.memory-short-term.title'),
    },
    '/settings/modules/memory-long-term': {
      subtitle: t('settings.title'),
      title: t('settings.pages.modules.memory-long-term.title'),
    },
    '/settings/modules/messaging-discord': {
      subtitle: t('settings.title'),
      title: t('settings.pages.modules.messaging-discord.title'),
    },
    '/settings/modules/x': {
      subtitle: t('settings.title'),
      title: t('settings.pages.modules.x.title'),
    },
    '/settings/modules/gaming-minecraft': {
      subtitle: t('settings.title'),
      title: t('settings.pages.modules.gaming-minecraft.title'),
    },
    '/settings/modules/gaming-factorio': {
      subtitle: t('settings.title'),
      title: t('settings.pages.modules.gaming-factorio.title'),
    },
    '/settings/providers': {
      subtitle: t('settings.title'),
      title: t('settings.pages.providers.title'),
    },
    '/settings/scene': {
      subtitle: t('settings.title'),
      title: t('settings.pages.scene.title'),
    },
    '/settings': {
      title: t('settings.title'),
    },

    // Tamagotchi specific
    '/settings/modules/mcp': {
      subtitle: t('settings.title'),
      title: t('settings.pages.modules.mcp-server.title'),
    },
    '/devtools/widgets-calling': {
      subtitle: t('tamagotchi.settings.devtools.title'),
      title: t('tamagotchi.settings.devtools.pages.widgets-calling.title'),
    },
  }

  for (const metadata of allProvidersMetadata.value) {
    map[`/settings/providers/${metadata.category}/${metadata.id}`] = {
      subtitle: t('settings.title'),
      title: t(metadata.nameKey),
    }
  }

  return map
})

// const activeSettingsTutorial = ref('default')
const routeHeaderMetadata = computed(() => {
  return routeHeaderMetadataMap.value[route.path] || routeHeaderMetadataMap.value[`${route.path}/`]
})

</script>

<template>
  <div h-full w-full overflow-y-scroll scrollbar-none bg="$bg-color">
    <WindowTitleBar
      :title="routeHeaderMetadata?.title"
      icon="i-solar:settings-bold"
    />
    <div
      :style="{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
      }"
    >
      <div relative h-full w-full top="44px">
        <!-- Content -->
        <div flex="~ col" mx-auto max-w-screen-xl max-h="[calc(100dvh-44px)]">
          <PageHeader
            :title="routeHeaderMetadata?.title"
            :subtitle="routeHeaderMetadata?.subtitle"
            :disable-back-button="route.path === '/settings'"
            top="44px!" px-4
          />
          <div h-full px-4>
            <RouterView />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
