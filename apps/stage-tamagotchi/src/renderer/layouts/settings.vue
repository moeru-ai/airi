<script setup lang="ts">
import { PageHeader } from '@proj-airi/stage-ui/components'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView, useRoute } from 'vue-router'

import WindowTitleBar from '../components/Window/TitleBar.vue'

import { useRestoreScroll } from '../composables/use-restore-scroll'

const route = useRoute()
const { t } = useI18n()
const providersStore = useProvidersStore()
const { allProvidersMetadata } = storeToRefs(providersStore)
const scrollContainer = ref<HTMLElement>()
useRestoreScroll(scrollContainer)

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
    '/settings/modules/beat-sync': {
      subtitle: t('settings.title'),
      title: t('settings.pages.modules.beat_sync.title'),
    },
    '/settings/providers': {
      subtitle: t('settings.title'),
      title: t('settings.pages.providers.title'),
    },
    '/settings/data': {
      subtitle: t('settings.title'),
      title: t('settings.pages.data.title'),
    },
    '/settings/scene': {
      subtitle: t('settings.title'),
      title: t('settings.pages.scene.title'),
    },
    '/settings/plugins': {
      subtitle: t('settings.title'),
      title: t('settings.pages.plugins.title'),
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
    '/devtools/markdown-stress': {
      subtitle: t('tamagotchi.settings.devtools.title'),
      title: t('tamagotchi.settings.devtools.pages.markdown-stress.title'),
    },
    '/devtools/context-flow': {
      subtitle: t('tamagotchi.settings.devtools.title'),
      title: t('tamagotchi.settings.devtools.pages.context-flow.title'),
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
  <div h-full w-full bg="$bg-color" flex="~ col">
    <WindowTitleBar :title="routeHeaderMetadata?.title" icon="i-solar:settings-bold" />
    <div
      :style="{
        paddingTop: `44px`,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
      }"

      min-h-0 flex-1
    >
      <div ref="scrollContainer" relative h-full w-full overflow-y-auto scrollbar-none>
        <div flex="~ col" mx-auto h-full max-w-screen-xl>
          <PageHeader
            :title="routeHeaderMetadata?.title"
            :subtitle="routeHeaderMetadata?.subtitle"
            :disable-back-button="route.path === '/settings'"
            px-4
          />
          <div min-h-0 flex-1 px-4>
            <RouterView />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
