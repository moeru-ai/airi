<script setup lang="ts">
import { PageHeader } from '@proj-airi/stage-ui/components'
import { useProvidersStore } from '@proj-airi/stage-ui/stores'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView, useRoute } from 'vue-router'

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
    '/settings/appearance': {
      subtitle: t('settings.title'),
      title: t('settings.pages.themes.title'),
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
  }

  for (const metadata of allProvidersMetadata.value) {
    map[`/settings/providers/${metadata.id}`] = {
      subtitle: t('settings.title'),
      title: t(metadata.nameKey),
    }
  }

  return map
})

// const activeSettingsTutorial = ref('default')
const routeHeaderMetadata = computed(() => routeHeaderMetadataMap.value[route.path])
</script>

<template>
  <div h-full w-full mt="44px" overflow-y-scroll>
    <div
      bg="neutral-100 dark:neutral-900" w="100dvw"
      data-tauri-drag-region
      fixed top="0" z-100 w-full py-2 pl-20 pr-4
    >
      <div data-tauri-drag-region flex>
        <div
          bg="hover:neutral-200 hover:dark:neutral-800"
          transition="all duration-200 ease-in-out"
          flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-0.5
        >
          <div i-solar:settings-bold text="neutral-400 dark:neutral-500" text-nowrap />
          <div><span text-nowrap>Settings</span></div>
        </div>
        <div data-tauri-drag-region w-full />
        <div
          bg="hover:neutral-200 hover:dark:neutral-800"
          transition="all duration-200 ease-in-out"
          flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-0.5
        >
          <div i-solar:info-circle-bold text="neutral-400 dark:neutral-500" text-nowrap />
        </div>
      </div>
    </div>
    <div
      :style="{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
      }"
    >
      <div h-full w-full px-4 pb-4>
        <!-- Content -->
        <div flex="~ col" mx-auto max-w-screen-xl>
          <PageHeader
            :title="routeHeaderMetadata?.title"
            :subtitle="routeHeaderMetadata?.subtitle"
            :disable-back-button="route.path === '/settings'"
          />
          <RouterView />
        </div>
      </div>
    </div>
  </div>
</template>
