<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { Button, FieldInput } from '@proj-airi/ui'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { homeAssistantGetConfig, homeAssistantSetConfig } from '../../../../shared/eventa/home-assistant'
import { useTamagotchiHomeAssistantStore } from '../../../stores/tools/home-assistant'

const { t } = useI18n()
const tn = (key: string) => t(`settings.pages.modules.home-assistant.${key}`)

const toolsStore = useTamagotchiHomeAssistantStore()
const getConfig = useElectronEventaInvoke(homeAssistantGetConfig)
const setConfig = useElectronEventaInvoke(homeAssistantSetConfig)

const baseUrl = ref('')
const token = ref('')
const hasToken = ref(false)
const busy = ref(false)

/** The line under the buttons. It carries a message key and its interpolation. */
const status = ref<{ key: string, params?: Record<string, unknown> } | null>(null)

onMounted(async () => {
  const config = await getConfig()
  baseUrl.value = config.baseUrl
  hasToken.value = config.hasToken
})

/**
 * Writes the form into the main process.
 *
 * An empty token field keeps the stored token, so the user can change the
 * address without pasting the secret again.
 */
async function save() {
  const saved = await setConfig({
    baseUrl: baseUrl.value,
    ...(token.value ? { token: token.value } : {}),
  })

  baseUrl.value = saved.baseUrl
  token.value = ''
  hasToken.value = saved.hasToken
  // The tools live in the leader window. This action is synchronized, so the
  // leader mounts or unmounts them without a reload.
  await toolsStore.refresh()

  return saved
}

async function onSave() {
  busy.value = true
  try {
    await save()
    status.value = { key: 'status.saved' }
  }
  catch (error) {
    status.value = { key: 'status.failed', params: { message: errorMessageFrom(error) ?? '' } }
  }
  finally {
    busy.value = false
  }
}

async function onTest() {
  busy.value = true
  status.value = { key: 'status.testing' }
  try {
    await save()
    const count = await toolsStore.testConnection()
    status.value = { key: 'status.reachable', params: { count } }
  }
  catch (error) {
    status.value = { key: 'status.failed', params: { message: errorMessageFrom(error) ?? '' } }
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div flex="~ col gap-6">
    <FieldInput
      v-model="baseUrl"
      :label="tn('base-url.label')"
      :description="tn('base-url.description')"
      :placeholder="tn('base-url.placeholder')"
      autocomplete="off"
    />

    <FieldInput
      v-model="token"
      type="password"
      :label="tn('token.label')"
      :description="hasToken ? tn('token.saved') : tn('token.description')"
      :placeholder="tn('token.placeholder')"
      autocomplete="off"
    />

    <p text="sm neutral-500 dark:neutral-400">
      {{ tn('note') }}
    </p>

    <div flex="~ row items-center gap-3">
      <Button :disabled="busy" @click="onSave">
        {{ tn('actions.save') }}
      </Button>
      <Button :disabled="busy" variant="secondary" @click="onTest">
        {{ tn('actions.test') }}
      </Button>
      <span v-if="status" text="sm neutral-500 dark:neutral-400">
        {{ t(status.key, status.params ?? {}) }}
      </span>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.home-assistant.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
