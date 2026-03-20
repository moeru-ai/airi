<script setup lang="ts">
import { Button, FieldCheckbox, FieldInput, FieldSelect, Radio } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { useQQStore } from '../../stores/modules/qq'

const { t } = useI18n()
const qqStore = useQQStore()
const { enabled, method, officialAppId, officialAppSecret, napcatWsUrl, voiceReplyMode, ttsConfigured, voiceGenerationStatus, voiceGenerationLastMessage, configured, connectionStatus, connectionMessage, connectionError, runtimeLogs } = storeToRefs(qqStore)
const logsVisible = ref(false)
const voiceSettingsSaving = ref(false)

const connectionMethods = computed(() => [
  { value: 'official', label: t('settings.pages.modules.messaging-qq.methods.official') },
  { value: 'napcat', label: t('settings.pages.modules.messaging-qq.methods.napcat') },
])
const canAutoPushVoiceSettings = computed(() => {
  return enabled.value
    && method.value === 'official'
    && officialAppId.value.trim().length > 0
    && officialAppSecret.value.trim().length > 0
})

async function saveSettings() {
  await qqStore.saveSettings()
}

function toggleLogs() {
  logsVisible.value = !logsVisible.value
}

function clearLogs() {
  qqStore.clearRuntimeLogs()
}

watch(voiceReplyMode, async (next, prev) => {
  if (next === prev)
    return
  voiceSettingsSaving.value = true
  try {
    if (canAutoPushVoiceSettings.value)
      await qqStore.saveSettings()
    toast.success(t('settings.pages.modules.messaging-qq.voice-settings-saved'))
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : t('settings.pages.modules.messaging-qq.voice-settings-save-failed'))
  }
  finally {
    voiceSettingsSaving.value = false
  }
})
</script>

<template>
  <div flex="~ col gap-6">
    <FieldCheckbox
      v-model="enabled"
      :label="t('settings.pages.modules.messaging-qq.enable')"
      :description="t('settings.pages.modules.messaging-qq.enable-description')"
    />

    <FieldSelect
      v-model="method"
      :label="t('settings.pages.modules.messaging-qq.method')"
      :description="t('settings.pages.modules.messaging-qq.method-description')"
      :options="connectionMethods"
    />

    <FieldInput
      v-if="method === 'official'"
      v-model="officialAppId"
      :label="t('settings.pages.modules.messaging-qq.official-app-id')"
      :description="t('settings.pages.modules.messaging-qq.official-app-id-description')"
      :placeholder="t('settings.pages.modules.messaging-qq.official-app-id-placeholder')"
    />

    <FieldInput
      v-if="method === 'official'"
      v-model="officialAppSecret"
      type="password"
      :label="t('settings.pages.modules.messaging-qq.official-app-secret')"
      :description="t('settings.pages.modules.messaging-qq.official-app-secret-description')"
      :placeholder="t('settings.pages.modules.messaging-qq.official-app-secret-placeholder')"
    />

    <FieldInput
      v-else
      v-model="napcatWsUrl"
      :label="t('settings.pages.modules.messaging-qq.napcat-ws-url')"
      :description="t('settings.pages.modules.messaging-qq.napcat-ws-url-description')"
      :placeholder="t('settings.pages.modules.messaging-qq.napcat-ws-url-placeholder')"
    />

    <div v-if="method === 'official'" flex="~ col gap-3">
      <div flex="~ col gap-1">
        <div text="sm" font-medium>
          {{ t('settings.pages.modules.messaging-qq.voice-reply-mode') }}
        </div>
        <div text="xs neutral-500 dark:neutral-400">
          {{ t('settings.pages.modules.messaging-qq.voice-reply-mode-description') }}
        </div>
      </div>

      <div flex="~ col gap-2">
        <Radio
          id="qq-voice-reply-both"
          v-model="voiceReplyMode"
          name="qq-voice-reply-mode"
          value="both"
          :title="t('settings.pages.modules.messaging-qq.voice-reply-modes.both')"
        />
        <Radio
          id="qq-voice-reply-voice"
          v-model="voiceReplyMode"
          name="qq-voice-reply-mode"
          value="voice"
          :title="t('settings.pages.modules.messaging-qq.voice-reply-modes.voice')"
        />
        <Radio
          id="qq-voice-reply-text"
          v-model="voiceReplyMode"
          name="qq-voice-reply-mode"
          value="text"
          :title="t('settings.pages.modules.messaging-qq.voice-reply-modes.text')"
        />
      </div>

      <div
        v-if="voiceReplyMode !== 'text' && !ttsConfigured"
        :class="[
          'rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800',
          'dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200',
        ]"
      >
        {{ t('settings.pages.modules.messaging-qq.voice-reply-fallback-tip') }}
      </div>

      <div
        :class="[
          'rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800',
          'dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200',
        ]"
      >
        {{ t('settings.pages.modules.messaging-qq.voice-reply-slow-tip') }}
      </div>

      <div flex="~ items-center gap-2" text="xs">
        <span text="neutral-500 dark:neutral-400">
          {{ t('settings.pages.modules.messaging-qq.voice-generation-status') }}
        </span>
        <span
          :class="[
            'rounded-full px-2 py-0.5 font-medium',
            voiceGenerationStatus === 'generating'
              ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200'
              : voiceGenerationStatus === 'success'
                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
                : voiceGenerationStatus === 'failed'
                  ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200'
                  : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200',
          ]"
        >
          {{
            voiceGenerationStatus === 'generating'
              ? t('settings.pages.modules.messaging-qq.voice-generation-status-values.generating')
              : voiceGenerationStatus === 'success'
                ? t('settings.pages.modules.messaging-qq.voice-generation-status-values.success')
                : voiceGenerationStatus === 'failed'
                  ? t('settings.pages.modules.messaging-qq.voice-generation-status-values.failed')
                  : t('settings.pages.modules.messaging-qq.voice-generation-status-values.idle')
          }}
        </span>
        <span v-if="voiceSettingsSaving" text="neutral-500 dark:neutral-400">
          {{ t('settings.pages.modules.messaging-qq.voice-settings-saving') }}
        </span>
      </div>

      <div v-if="voiceGenerationLastMessage" text="xs neutral-500 dark:neutral-400">
        {{ voiceGenerationLastMessage }}
      </div>
    </div>

    <div text="sm neutral-500 dark:neutral-400">
      <span>{{ t('settings.pages.modules.messaging-qq.help-label') }}</span>
      <a
        href="https://napcat.apifox.cn/"
        target="_blank"
        rel="noopener noreferrer"
        text="sky-600 dark:sky-400 hover:sky-500"
      >
        https://napcat.apifox.cn/
      </a>
    </div>

    <div>
      <Button
        :label="t('settings.common.save')"
        variant="primary"
        @click="saveSettings"
      />
    </div>

    <div flex="~ gap-2">
      <Button
        :label="logsVisible ? t('settings.pages.modules.messaging-qq.hide-logs') : t('settings.pages.modules.messaging-qq.show-logs')"
        variant="secondary"
        @click="toggleLogs"
      />
      <Button
        :label="t('settings.pages.modules.messaging-qq.clear-logs')"
        variant="ghost"
        @click="clearLogs"
      />
    </div>

    <div v-if="configured" class="mt-4 rounded-lg bg-green-100 p-4 text-green-800">
      {{ t('settings.pages.modules.messaging-qq.configured') }}
    </div>

    <div v-else-if="connectionStatus === 'connecting'" class="mt-4 rounded-lg bg-sky-100 p-4 text-sky-900">
      {{ connectionMessage || t('settings.pages.modules.messaging-qq.connecting') }}
    </div>

    <div v-if="connectionStatus === 'error'" class="mt-4 rounded-lg bg-red-100 p-4 text-red-800">
      {{ connectionError || t('settings.pages.modules.messaging-qq.connection-error') }}
    </div>

    <div v-if="logsVisible" class="mt-4 border border-neutral-200 rounded-lg bg-neutral-50 p-3 text-sm dark:border-neutral-700 dark:bg-neutral-900">
      <div mb-2 font-semibold>
        {{ t('settings.pages.modules.messaging-qq.runtime-logs') }}
      </div>
      <div max-h-56 overflow-auto border border-neutral-200 rounded bg-white p-2 text-xs leading-5 font-mono dark:border-neutral-700 dark:bg-neutral-950>
        <div
          v-for="log in runtimeLogs"
          :key="log.id"
          :class="[
            log.level === 'error' ? 'text-red-500' : log.level === 'warn' ? 'text-amber-500' : 'text-neutral-700 dark:text-neutral-300',
          ]"
        >
          [{{ log.at }}] [{{ log.level.toUpperCase() }}] {{ log.message }}
        </div>
        <div v-if="runtimeLogs.length === 0" class="text-neutral-400">
          {{ t('settings.pages.modules.messaging-qq.runtime-logs-empty') }}
        </div>
      </div>
    </div>

    <div
      :class="[
        'rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800',
        'dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200',
      ]"
    >
      {{ t('settings.pages.modules.messaging-qq.pre-chat-tip') }}
    </div>
  </div>
</template>
