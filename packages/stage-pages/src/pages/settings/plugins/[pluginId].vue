<script setup lang="ts">
import type { PluginMetadata } from '@proj-airi/stage-ui/stores/plugins'

import { usePluginsStore } from '@proj-airi/stage-ui/stores/plugins'
import { Button, FieldCheckbox, FieldInput } from '@proj-airi/ui'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const pluginsStore = usePluginsStore()

const pluginId = computed(() => route.params.pluginId as string)

// Get plugin info
const pluginInfo = computed(() => {
  const plugin = pluginsStore.allPlugins.find(p => p.metadata.id === pluginId.value)
  if (plugin) {
    return {
      metadata: plugin.metadata,
      connected: plugin.connected,
      connectedCount: plugin.connectedCount,
    }
  }
  return null
})

const metadata = computed<PluginMetadata | null>(() => pluginInfo.value?.metadata ?? null)
const connected = computed(() => pluginInfo.value?.connected ?? false)

// Plugin settings
const enabled = ref(true)
const configFields = ref<Record<string, string>>({})

// Known plugin-specific fields
const knownPluginFields: Record<string, Array<{ key: string, type: 'text' | 'password', labelKey: string, descriptionKey: string, placeholderKey: string }>> = {
  'youtube-livechat': [
    {
      key: 'clientId',
      type: 'text',
      labelKey: 'settings.pages.plugins.fields.client-id',
      descriptionKey: 'settings.pages.plugins.fields.client-id-description',
      placeholderKey: 'settings.pages.plugins.fields.client-id-placeholder',
    },
    {
      key: 'clientSecret',
      type: 'password',
      labelKey: 'settings.pages.plugins.fields.client-secret',
      descriptionKey: 'settings.pages.plugins.fields.client-secret-description',
      placeholderKey: 'settings.pages.plugins.fields.client-secret-placeholder',
    },
    {
      key: 'streamUrl',
      type: 'text',
      labelKey: 'settings.pages.plugins.fields.stream-url',
      descriptionKey: 'settings.pages.plugins.fields.stream-url-description',
      placeholderKey: 'settings.pages.plugins.fields.stream-url-placeholder',
    },
  ],
  'homeassistant': [
    {
      key: 'baseUrl',
      type: 'text',
      labelKey: 'settings.pages.plugins.fields.base-url',
      descriptionKey: 'settings.pages.plugins.fields.base-url-description',
      placeholderKey: 'settings.pages.plugins.fields.base-url-placeholder',
    },
    {
      key: 'accessToken',
      type: 'password',
      labelKey: 'settings.pages.plugins.fields.access-token',
      descriptionKey: 'settings.pages.plugins.fields.access-token-description',
      placeholderKey: 'settings.pages.plugins.fields.access-token-placeholder',
    },
  ],
  'bilibili-laplace': [
    {
      key: 'roomId',
      type: 'text',
      labelKey: 'settings.pages.plugins.fields.room-id',
      descriptionKey: 'settings.pages.plugins.fields.room-id-description',
      placeholderKey: 'settings.pages.plugins.fields.room-id-placeholder',
    },
  ],
}

const pluginFields = computed(() => knownPluginFields[pluginId.value] || [])

// Initialize
onMounted(() => {
  pluginsStore.fetchConnectedPlugins()
  enabled.value = pluginsStore.isPluginEnabled(pluginId.value)
})

// Watch for enabled changes
watch(enabled, (newValue) => {
  pluginsStore.setPluginEnabled(pluginId.value, newValue)
})

// Save configuration
function saveConfig() {
  const config: Record<string, unknown> = {
    enabled: enabled.value,
    ...configFields.value,
  }
  pluginsStore.configurePlugin(pluginId.value, config)
}

// Start OAuth (for YouTube)
function startOAuth() {
  pluginsStore.configurePlugin(pluginId.value, {
    startOAuth: true,
    clientId: configFields.value.clientId,
    clientSecret: configFields.value.clientSecret,
  })
}

// Go back
function goBack() {
  router.push('/settings/plugins')
}

// Get translated name
function getTranslatedName(name: string | undefined): string {
  if (!name)
    return pluginId.value
  if (name.startsWith('settings.'))
    return t(name)
  return name
}

// Get translated description
function getTranslatedDescription(description: string | undefined): string {
  if (!description)
    return ''
  if (description.startsWith('settings.'))
    return t(description)
  return description
}
</script>

<template>
  <div flex="~ col gap-6">
    <!-- Plugin header -->
    <div flex="~ row items-center gap-4" pb-4 border-b="1 neutral-200 dark:neutral-700">
      <div
        v-if="metadata?.icon"
        :class="[metadata.icon, metadata.iconColor]"
        text-4xl
      />
      <div flex="~ col">
        <h2 text-xl font-semibold>
          {{ getTranslatedName(metadata?.name) }}
        </h2>
        <p text-sm text-neutral-500 dark:text-neutral-400>
          {{ getTranslatedDescription(metadata?.description) }}
        </p>
      </div>
      <div ml-auto flex="~ row items-center gap-2">
        <span
          :class="connected ? 'bg-green-500' : 'bg-neutral-300 dark:bg-neutral-600'"
          size-3 rounded-full
        />
        <span text-sm text-neutral-600 dark:text-neutral-400>
          {{ connected ? t('settings.pages.plugins.status.connected') : t('settings.pages.plugins.status.disconnected') }}
        </span>
      </div>
    </div>

    <!-- Enable/Disable toggle -->
    <FieldCheckbox
      v-model="enabled"
      :label="t('settings.pages.plugins.enable')"
      :description="t('settings.pages.plugins.enable-description')"
    />

    <!-- Plugin-specific fields -->
    <template v-if="pluginFields.length > 0">
      <div flex="~ col gap-4">
        <h3 text-lg font-medium text-neutral-700 dark:text-neutral-300>
          {{ t('settings.pages.plugins.configuration') }}
        </h3>

        <FieldInput
          v-for="field in pluginFields"
          :key="field.key"
          v-model="configFields[field.key]"
          :type="field.type"
          :label="t(field.labelKey)"
          :description="t(field.descriptionKey)"
          :placeholder="t(field.placeholderKey)"
        />

        <!-- OAuth button for YouTube -->
        <div v-if="pluginId === 'youtube-livechat'" pt-2>
          <Button
            :label="t('settings.pages.plugins.start-oauth')"
            variant="secondary"
            @click="startOAuth"
          />
        </div>
      </div>
    </template>

    <!-- Generic message for unknown plugins -->
    <div
      v-else-if="!connected"
      rounded-lg bg-neutral-100 p-4 dark:bg-neutral-800
    >
      <p text-neutral-600 dark:text-neutral-400>
        {{ t('settings.pages.plugins.not-connected-hint') }}
      </p>
    </div>

    <!-- Actions -->
    <div flex="~ row gap-3" pt-4>
      <Button
        :label="t('settings.common.save')"
        variant="primary"
        @click="saveConfig"
      />
      <Button
        :label="t('settings.pages.plugins.back')"
        variant="secondary"
        @click="goBack"
      />
    </div>

    <!-- Connection status info -->
    <div
      v-if="connected"
      mt-4 rounded-lg bg-green-50 p-4 class="dark:bg-green-900/20"
    >
      <div flex="~ row items-center gap-2">
        <div text-green-500 i-solar:check-circle-bold></div>
        <span text-green-700 dark:text-green-400>
          {{ t('settings.pages.plugins.connected-info', { count: pluginInfo?.connectedCount || 0 }) }}
        </span>
      </div>
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
    <div v-if="metadata?.icon" text="60" :class="metadata.icon"></div>
    <div v-else text="60" i-solar:plug-circle-bold-duotone></div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
