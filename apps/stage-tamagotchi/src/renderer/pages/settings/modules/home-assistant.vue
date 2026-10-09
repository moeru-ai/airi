<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useHomeAssistantStore } from '@proj-airi/stage-ui/stores/modules/home-assistant'
import { Button, FieldCheckbox, FieldInput, SettingsCard } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { homeAssistantGetConfig, homeAssistantSetConfig } from '../../../../shared/eventa/home-assistant'
import { useTamagotchiHomeAssistantStore } from '../../../stores/tools/home-assistant'

const { t } = useI18n()
/**
 * Translates one key of this page.
 *
 * The status line stores a suffix rather than a translated string. Translating
 * here and again in the template passes an already-rendered message to `t()`,
 * which drops the interpolation parameters.
 */
const tn = (key: string, params?: Record<string, unknown>) => t(`settings.pages.modules.home-assistant.${key}`, params ?? {})

const settings = useHomeAssistantStore()
const { enabled } = storeToRefs(settings)
const toolsStore = useTamagotchiHomeAssistantStore()
const getConfig = useElectronEventaInvoke(homeAssistantGetConfig)
const setConfig = useElectronEventaInvoke(homeAssistantSetConfig)

const baseUrl = ref('')
const token = ref('')
const hasToken = ref(false)
const tokenPreview = ref('')
const busy = ref(false)

/** The line under the buttons: a key suffix, and the values that key interpolates. */
const status = ref<{ suffix: string, params?: Record<string, unknown> } | null>(null)

/** Mirrors what the main process holds, so the module card can show its state. */
function recordCredentials(saved: { baseUrl: string, hasToken: boolean }) {
  settings.setHasCredentials(Boolean(saved.baseUrl) && saved.hasToken)
}

onMounted(async () => {
  const config = await getConfig()
  baseUrl.value = config.baseUrl
  hasToken.value = config.hasToken
  tokenPreview.value = config.tokenPreview
  recordCredentials(config)
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
  tokenPreview.value = saved.tokenPreview
  recordCredentials(saved)
  // The tools live in the leader window. This action is synchronized, so the
  // leader mounts or unmounts them without a reload.
  await toolsStore.refresh()

  return saved
}

async function onSave() {
  busy.value = true
  try {
    await save()
    status.value = { suffix: 'status.saved' }
  }
  catch (error) {
    status.value = { suffix: 'status.failed', params: { message: errorMessageFrom(error) ?? '' } }
  }
  finally {
    busy.value = false
  }
}

async function onTest() {
  busy.value = true
  status.value = { suffix: 'status.testing' }
  try {
    await save()
    const count = await toolsStore.testConnection()
    status.value = { suffix: 'status.reachable', params: { count } }
  }
  catch (error) {
    status.value = { suffix: 'status.failed', params: { message: errorMessageFrom(error) ?? '' } }
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <SettingsCard>
    <FieldCheckbox
      v-model="enabled"
      :label="tn('enable')"
      :description="tn('enable-description')"
    />

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
      :placeholder="hasToken ? tokenPreview : tn('token.placeholder')"
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
        {{ tn(status.suffix, status.params) }}
      </span>
    </div>
  </SettingsCard>
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
