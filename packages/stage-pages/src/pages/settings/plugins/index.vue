<script setup lang="ts">
import { IconStatusItem, RippleGrid } from '@proj-airi/stage-ui/components'
import { useRippleGridState } from '@proj-airi/stage-ui/composables/use-ripple-grid-state'
import { usePluginsStore } from '@proj-airi/stage-ui/stores/plugins'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const pluginsStore = usePluginsStore()
const { lastClickedIndex, setLastClickedIndex } = useRippleGridState()

onMounted(() => {
  pluginsStore.fetchConnectedPlugins()
})

const pluginsList = computed(() =>
  pluginsStore.allPlugins.map(plugin => ({
    id: plugin.metadata.id,
    name: typeof plugin.metadata.name === 'string' && plugin.metadata.name.startsWith('settings.')
      ? t(plugin.metadata.name)
      : plugin.metadata.name,
    description: typeof plugin.metadata.description === 'string' && plugin.metadata.description.startsWith('settings.')
      ? t(plugin.metadata.description)
      : plugin.metadata.description,
    icon: plugin.metadata.icon,
    iconColor: plugin.metadata.iconColor,
    to: `/settings/plugins/${plugin.metadata.id}`,
    configured: plugin.connected,
  })),
)
</script>

<template>
  <div>
    <RippleGrid
      :items="pluginsList"
      :columns="{ default: 1, sm: 2 }"
      :origin-index="lastClickedIndex"
      @item-click="({ globalIndex }) => setLastClickedIndex(globalIndex)"
    >
      <template #item="{ item: plugin }">
        <IconStatusItem
          :title="plugin.name"
          :description="plugin.description"
          :icon="plugin.icon"
          :icon-color="plugin.iconColor"
          :to="plugin.to"
          :configured="plugin.configured"
        />
      </template>
    </RippleGrid>

    <!-- Empty state when no plugins -->
    <div
      v-if="pluginsList.length === 0 && !pluginsStore.loading"
      flex="~ col items-center justify-center"
      py-12
    >
      <div text-6xl text-neutral-300 i-solar:plug-circle-bold-duotone dark:text-neutral-600></div>
      <p mt-4 text-neutral-500 dark:text-neutral-400>
        {{ t('settings.pages.plugins.empty') }}
      </p>
    </div>

    <!-- Loading state -->
    <div
      v-if="pluginsStore.loading"
      flex="~ col items-center justify-center"
      py-12
    >
      <div text-4xl text-primary-500 i-svg-spinners:ring-resize></div>
      <p mt-4 text-neutral-500 dark:text-neutral-400>
        {{ t('settings.pages.plugins.loading') }}
      </p>
    </div>

    <!-- Error state -->
    <div
      v-if="pluginsStore.error"
      flex="~ col items-center justify-center"
      rounded-lg bg-red-50 p-4 class="dark:bg-red-900/20"
    >
      <div text-4xl text-red-500 i-solar:danger-triangle-bold-duotone></div>
      <p mt-2 text-red-600 dark:text-red-400>
        {{ pluginsStore.error }}
      </p>
      <button
        mt-4 rounded-lg bg-red-500 px-4 py-2 text-white
        hover:bg-red-600
        @click="pluginsStore.fetchConnectedPlugins()"
      >
        {{ t('settings.pages.plugins.retry') }}
      </button>
    </div>
  </div>

  <!-- Background decoration -->
  <div
    v-motion
    class="text-neutral-200/50 dark:text-neutral-600/20" pointer-events-none
    fixed top="[calc(100dvh-15rem)]" bottom-0 right--5 z--1
    :initial="{ scale: 0.9, opacity: 0, y: 20 }"
    :enter="{ scale: 1, opacity: 1, y: 0 }"
    :duration="500"
    size-60
    flex items-center justify-center
  >
    <div text="60" i-solar:plug-circle-bold-duotone />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
