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
// NOTE: These are not yet ready. They should be able to run independently or built-in with Electron,
// and register capability to server-runtime in order to process in multi-agent pattern instead of single roundtrip for each chat.
// const knownPluginFields: Record<string, Array<{ key: string, type: 'text' | 'password', labelKey: string, descriptionKey: string, placeholderKey: string }>> = {
//   ...
// }

const pluginFields = computed(() => [])

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
  <div :class="['flex', 'flex-col', 'gap-6']">
    <!-- Plugin header -->
    <div :class="['flex', 'flex-row', 'items-center', 'gap-4', 'pb-4', 'border-b', 'border-neutral-200', 'dark:border-neutral-700']">
      <div
        v-if="metadata?.icon"
        :class="[metadata.icon, metadata.iconColor, 'text-4xl']"
      />
      <div :class="['flex', 'flex-col']">
        <h2 :class="['text-xl', 'font-semibold']">
          {{ getTranslatedName(metadata?.name) }}
        </h2>
        <p :class="['text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
          {{ getTranslatedDescription(metadata?.description) }}
        </p>
      </div>
      <div :class="['ml-auto', 'flex', 'flex-row', 'items-center', 'gap-2']">
        <span
          :class="[
            'size-3', 'rounded-full',
            connected ? 'bg-green-500' : 'bg-neutral-300',
            !connected && 'dark:bg-neutral-600',
          ]"
        />
        <span :class="['text-sm', 'text-neutral-600', 'dark:text-neutral-400']">
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
      <div :class="['flex', 'flex-col', 'gap-4']">
        <h3 :class="['text-lg', 'font-medium', 'text-neutral-700', 'dark:text-neutral-300']">
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
        <div v-if="pluginId === 'youtube-livechat'" :class="['pt-2']">
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
      :class="['rounded-lg', 'bg-neutral-100', 'p-4', 'dark:bg-neutral-800']"
    >
      <p :class="['text-neutral-600', 'dark:text-neutral-400']">
        {{ t('settings.pages.plugins.not-connected-hint') }}
      </p>
    </div>

    <!-- Actions -->
    <div :class="['flex', 'flex-row', 'gap-3', 'pt-4']">
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
      :class="['mt-4', 'rounded-lg', 'bg-green-50', 'p-4', 'dark:bg-green-900/20']"
    >
      <div :class="['flex', 'flex-row', 'items-center', 'gap-2']">
        <div :class="['text-green-500', 'i-solar:check-circle-bold']" />
        <span :class="['text-green-700', 'dark:text-green-400']">
          {{ t('settings.pages.plugins.connected-info', { count: pluginInfo?.connectedCount || 0 }) }}
        </span>
      </div>
    </div>
  </div>

  <!-- Background decoration -->
  <div
    v-motion
    :class="[
      'text-neutral-200/50', 'dark:text-neutral-600/20', 'pointer-events-none',
      'fixed', 'bottom-0', 'right--5', 'z--1', 'size-60',
      'flex', 'items-center', 'justify-center',
    ]"
    style="top: calc(100dvh - 15rem)"
    :initial="{ scale: 0.9, opacity: 0, y: 20 }"
    :enter="{ scale: 1, opacity: 1, y: 0 }"
    :duration="500"
  >
    <div v-if="metadata?.icon" :class="[metadata.icon, 'text-60']" />
    <div v-else :class="['text-60', 'i-solar:plug-circle-bold-duotone']" />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
