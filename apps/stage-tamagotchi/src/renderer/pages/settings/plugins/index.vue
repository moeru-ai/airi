<script setup lang="ts">
import type { PluginManifestSummary } from '../../../../shared/eventa/plugin/host'

import { errorMessageFrom } from '@moeru/std'
import { Section } from '@proj-airi/stage-ui/components'
import { Button, Callout, GhostButton } from '@proj-airi/ui'
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { usePluginsStore } from '../../../stores/plugins'

const { t } = useI18n()
const pluginsStore = usePluginsStore()

function chipClasses(theme: 'neutral' | 'emerald') {
  if (theme === 'emerald') {
    return [
      'rounded-full border px-2 py-0.5 text-xs',
      'border-emerald-300 bg-emerald-100 text-emerald-700',
      'dark:border-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
    ]
  }

  return [
    'rounded-full border px-2 py-0.5 text-xs',
    'border-neutral-300 bg-neutral-100 text-neutral-700',
    'dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  ]
}

async function refresh() {
  try {
    await pluginsStore.refresh()
  }
  catch (error) {
    toast.error(errorMessageFrom(error) ?? t('tamagotchi.settings.pages.plugins.errors.refresh'))
  }
}

async function togglePlugin(plugin: PluginManifestSummary) {
  try {
    if (plugin.enabled) {
      await pluginsStore.disableAndUnload(plugin.extensionId, plugin.path)
    }
    else {
      await pluginsStore.enableAndLoad(plugin.extensionId, plugin.path)
    }
  }
  catch (error) {
    toast.error(errorMessageFrom(error) ?? t('tamagotchi.settings.pages.plugins.errors.toggle', { extensionId: plugin.extensionId }))
  }
}

async function reloadPlugin(plugin: PluginManifestSummary) {
  try {
    await pluginsStore.reload(plugin.extensionId)
  }
  catch (error) {
    toast.error(errorMessageFrom(error) ?? t('tamagotchi.settings.pages.plugins.errors.reload', { extensionId: plugin.extensionId }))
  }
}

async function openFolder() {
  try {
    await pluginsStore.openFolder()
  }
  catch (error) {
    toast.error(errorMessageFrom(error) ?? t('tamagotchi.settings.pages.plugins.errors.open-folder'))
  }
}

onMounted(refresh)
</script>

<template>
  <div :class="['flex flex-col gap-4', 'pb-12']">
    <Callout v-if="!pluginsStore.loading && pluginsStore.sortedPlugins.length === 0" theme="violet">
      <template #label>
        {{ t('tamagotchi.settings.pages.plugins.empty.title') }}
      </template>
      <div :class="['text-sm', 'text-neutral-600 dark:text-neutral-300']">
        {{ t('tamagotchi.settings.pages.plugins.empty.description') }}
      </div>
    </Callout>

    <Section
      :title="t('tamagotchi.settings.pages.plugins.installed')"
      icon="i-solar:plug-circle-bold-duotone"
      inner-class="gap-3"
    >
      <div :class="['flex flex-wrap items-center gap-2']">
        <Button
          :label="t('tamagotchi.settings.pages.plugins.actions.refresh')"
          icon="i-solar:refresh-bold-duotone"
          size="sm"
          :loading="pluginsStore.loading"
          @click="refresh"
        />
        <GhostButton
          :label="t('tamagotchi.settings.pages.plugins.actions.open-folder')"
          icon="i-solar:folder-open-bold-duotone"
          size="sm"
          :disabled="!pluginsStore.root"
          @click="openFolder"
        />
      </div>

      <div
        v-for="plugin in pluginsStore.sortedPlugins"
        :key="plugin.path"
        :class="[
          'rounded-xl p-3',
          'border border-neutral-300 dark:border-neutral-800',
          'bg-white/70 dark:bg-neutral-950/60',
        ]"
      >
        <div :class="['flex flex-wrap items-center justify-between gap-2']">
          <div :class="['flex flex-wrap items-center gap-2']">
            <div :class="['font-semibold']">
              {{ plugin.extensionId }}
            </div>
            <span :class="chipClasses('neutral')">
              v{{ plugin.version }}
            </span>
            <span :class="chipClasses(plugin.enabled ? 'emerald' : 'neutral')">
              {{ plugin.enabled ? t('tamagotchi.settings.pages.plugins.status.enabled') : t('tamagotchi.settings.pages.plugins.status.disabled') }}
            </span>
            <span :class="chipClasses(plugin.loaded ? 'emerald' : 'neutral')">
              {{ plugin.loaded ? t('tamagotchi.settings.pages.plugins.status.loaded') : t('tamagotchi.settings.pages.plugins.status.not-loaded') }}
            </span>
          </div>

          <div :class="['flex flex-wrap items-center gap-2']">
            <Button
              size="sm"
              :label="plugin.enabled ? t('tamagotchi.settings.pages.plugins.actions.disable') : t('tamagotchi.settings.pages.plugins.actions.enable')"
              :icon="plugin.enabled ? 'i-solar:stop-bold-duotone' : 'i-solar:play-bold-duotone'"
              :disabled="pluginsStore.loading"
              :loading="pluginsStore.pendingExtensionId === plugin.extensionId"
              @click="togglePlugin(plugin)"
            />
            <GhostButton
              size="sm"
              :label="t('tamagotchi.settings.pages.plugins.actions.reload')"
              icon="i-solar:restart-bold-duotone"
              :disabled="pluginsStore.loading || !plugin.enabled"
              :loading="pluginsStore.pendingExtensionId === plugin.extensionId"
              @click="reloadPlugin(plugin)"
            />
          </div>
        </div>

        <div :class="['mt-2 break-all font-mono text-xs opacity-70']">
          {{ plugin.path }}
        </div>
      </div>

      <div v-if="pluginsStore.root" :class="['mt-1 text-xs opacity-70']">
        <span>{{ t('tamagotchi.settings.pages.plugins.folder') }}: </span>
        <span :class="['break-all font-mono']">{{ pluginsStore.root }}</span>
      </div>
    </Section>

    <div
      v-motion
      :class="[
        'pointer-events-none fixed bottom-0 z--1 flex items-center justify-center',
        'right--5 top-[calc(100dvh-12rem)] size-60',
        'text-neutral-200/50 dark:text-neutral-600/20',
      ]"
      :initial="{ scale: 0.9, opacity: 0, rotate: 180 }"
      :enter="{ scale: 1, opacity: 1, rotate: 0 }"
      :duration="500"
    >
      <div :class="['text-60', 'i-solar:plug-circle-bold-duotone']" />
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.plugins.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.plugins.description
  icon: i-solar:plug-circle-bold-duotone
  settingsEntry: true
  order: 10
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
