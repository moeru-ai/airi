<script setup lang="ts">
import type { PluginConfigSnapshot } from '../../../../shared/eventa/plugin/config'

import { Button, Callout, FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { usePluginSettingsStore } from '../../../stores/settings/plugin-settings'

// NOTICE: The import paths for eventa types go up 4 levels to reach src/shared,
// while the store path goes up 3 levels to reach src/renderer/stores.

const pluginSettingsStore = usePluginSettingsStore()
const { plugins, loading, error } = storeToRefs(pluginSettingsStore)
const { t } = useI18n()

const tn = (key: string, params?: Record<string, unknown>) => t(`tamagotchi.settings.pages.plugins.${key}`, params ?? {})

interface PluginConfigEditorState {
  loading: boolean
  configSnapshot?: PluginConfigSnapshot
  values: Record<string, unknown>
  savedValues: Record<string, unknown>
  error?: string
}

const configEditors = ref<Record<string, PluginConfigEditorState>>({})

const sortedPlugins = computed(() => {
  return [...plugins.value].sort((a, b) => {
    if (a.enabled !== b.enabled) {
      return a.enabled ? -1 : 1
    }
    return (a.displayName || a.name).localeCompare(b.displayName || b.name)
  })
})

function getStatusLabel(loaded: boolean): string {
  return loaded ? tn('status.loaded') : tn('status.stopped')
}

function getEditorState(name: string): PluginConfigEditorState {
  if (!configEditors.value[name]) {
    configEditors.value[name] = {
      loading: false,
      values: {},
      savedValues: {},
    }
  }
  return configEditors.value[name]
}

function isDirty(name: string): boolean {
  const state = getEditorState(name)
  if (!state.configSnapshot)
    return false
  for (const key of Object.keys(state.configSnapshot.schema)) {
    if (state.values[key] !== state.savedValues[key]) {
      return true
    }
  }
  return false
}

function cancelConfig(name: string) {
  const state = getEditorState(name)
  state.values = { ...state.savedValues }
  state.error = undefined
}

async function loadConfig(name: string) {
  const state = getEditorState(name)
  state.loading = true
  try {
    const snapshot = await pluginSettingsStore.getPluginConfig(name)
    state.configSnapshot = snapshot
    state.values = { ...snapshot.values }
    state.savedValues = { ...snapshot.values }
  }
  catch (err) {
    console.warn('[plugin-settings] failed to load config:', err)
  }
  finally {
    state.loading = false
  }
}

async function saveConfig(name: string) {
  const state = getEditorState(name)
  state.error = undefined
  const newConfig: Record<string, unknown> = {}
  if (state.configSnapshot) {
    for (const key of Object.keys(state.configSnapshot.schema)) {
      const value = state.values[key]
      const field = state.configSnapshot.schema[key]
      if (value !== undefined) {
        if (field.type === 'number') {
          if (value === '') {
            continue
          }
          const num = Number(value)
          if (Number.isNaN(num)) {
            state.error = `${field.label}: invalid number "${value}"`
            return
          }
          newConfig[key] = num
        }
        else if (field.type === 'boolean') {
          newConfig[key] = value === true || value === 'true'
        }
        else {
          newConfig[key] = value
        }
      }
    }
  }
  try {
    await pluginSettingsStore.savePluginConfig(name, newConfig)
    await loadConfig(name)
  }
  catch (err) {
    console.warn('[plugin-settings] failed to save config:', err)
  }
}

onMounted(() => {
  pluginSettingsStore.refresh()
})

watch(plugins, (newPlugins, oldPlugins) => {
  const oldNames = new Set(oldPlugins?.map(p => p.name) ?? [])

  const newNames = new Set(newPlugins.map(p => p.name))
  for (const name of Object.keys(configEditors.value)) {
    if (!newNames.has(name)) {
      delete configEditors.value[name]
    }
  }

  for (const plugin of newPlugins) {
    if (!oldNames.has(plugin.name)) {
      loadConfig(plugin.name)
    }
  }
})

watch(loading, (isLoading) => {
  if (!isLoading && plugins.value.length > 0) {
    for (const plugin of plugins.value) {
      if (!configEditors.value[plugin.name]?.configSnapshot) {
        loadConfig(plugin.name)
      }
    }
  }
})
</script>

<template>
  <div :class="['flex', 'flex-col', 'gap-4']">
    <Callout
      v-if="error"
      theme="orange"
      :label="t('settings.pages.data.title')"
    >
      {{ error }}
    </Callout>

    <div v-if="loading && plugins.length === 0" :class="['flex', 'items-center', 'justify-center', 'py-8']">
      <span :class="['text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
        {{ t('settings.pages.data.title') }}
      </span>
    </div>

    <div v-if="!loading && plugins.length === 0" :class="['flex', 'items-center', 'justify-center', 'py-8']">
      <span :class="['text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
        {{ tn('no-description') }}
      </span>
    </div>

    <div
      v-for="plugin in sortedPlugins"
      :key="plugin.name"
      :class="[
        'flex', 'flex-col', 'gap-2',
        'rounded-xl', 'border', 'border-neutral-100', 'dark:border-neutral-800/25',
        'bg-white', 'dark:bg-neutral-900',
        'p-4',
      ]"
    >
      <div :class="['flex', 'items-start', 'justify-between', 'gap-3']">
        <div :class="['flex', 'flex-col', 'gap-1', 'flex-1', 'min-w-0']">
          <div :class="['flex', 'items-center', 'gap-2']">
            <span :class="['text-base', 'font-medium', 'text-neutral-900', 'dark:text-neutral-100']">
              {{ plugin.displayName || plugin.name }}
            </span>
            <span
              v-if="plugin.version"
              :class="['text-xs', 'text-neutral-400', 'dark:text-neutral-500']"
            >
              v{{ plugin.version }}
            </span>
          </div>
          <div :class="['flex', 'items-center', 'gap-2']">
            <span
              :class="['inline-block', 'size-2', 'rounded-full', plugin.loaded ? 'bg-green-500' : 'bg-neutral-400']"
            />
            <span :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
              {{ getStatusLabel(plugin.loaded) }}
            </span>
          </div>
          <div
            v-if="plugin.description"
            :class="['text-sm', 'text-neutral-500', 'dark:text-neutral-400']"
          >
            {{ plugin.description }}
          </div>
        </div>
      </div>

      <div
        v-if="getEditorState(plugin.name).loading"
        :class="['text-sm', 'text-neutral-500', 'dark:text-neutral-400', 'py-2']"
      >
        {{ t('settings.pages.data.title') }}
      </div>
      <div
        v-else-if="getEditorState(plugin.name).configSnapshot"
        :class="['flex', 'flex-col', 'gap-2', 'pt-2']"
      >
        <div :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
          {{ tn('config.description') }}
        </div>
        <div
          v-for="(field, key) in getEditorState(plugin.name).configSnapshot?.schema ?? {}"
          :key="key"
          class="field-row"
        >
          <FieldInput
            v-if="field.type === 'boolean'"
            v-model="getEditorState(plugin.name).values[key]"
            :label="field.label"
            type="checkbox"
          />
          <FieldInput
            v-else-if="field.type === 'secret'"
            v-model="getEditorState(plugin.name).values[key]"
            :label="field.label"
            type="password"
            :placeholder="field.placeholder"
          />
          <FieldInput
            v-else-if="field.type === 'number'"
            v-model="getEditorState(plugin.name).values[key]"
            :label="field.label"
            type="number"
            :placeholder="field.placeholder"
          />
          <FieldInput
            v-else
            v-model="getEditorState(plugin.name).values[key]"
            :label="field.label"
            :placeholder="field.placeholder"
          />
        </div>
        <div
          v-if="getEditorState(plugin.name).error"
          :class="['text-sm', 'text-red-500', 'dark:text-red-400']"
        >
          {{ getEditorState(plugin.name).error }}
        </div>
        <div :class="['flex', 'items-center', 'gap-2']">
          <Button
            v-if="isDirty(plugin.name)"
            variant="ghost"
            size="sm"
            @click="cancelConfig(plugin.name)"
          >
            {{ tn('actions.cancel') }}
          </Button>
          <Button
            variant="primary"
            size="sm"
            :disabled="!isDirty(plugin.name)"
            @click="saveConfig(plugin.name)"
          >
            {{ tn('actions.save') }}
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.field-row :deep(.max-w-full > label) {
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
}
</style>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.pages.plugins.title
  subtitleKey: settings.title
  descriptionKey: tamagotchi.settings.pages.plugins.description
  icon: i-solar:widget-5-bold-duotone
  settingsEntry: true
  order: 5
  stageTransition:
    name: slide
</route>
