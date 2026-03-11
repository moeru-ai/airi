<script setup lang="ts">
import { useVisionModuleStore } from '@proj-airi/stage-ui/stores/modules/vision'
import { Button, FieldCheckbox, FieldInput, FieldSelect } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const visionStore = useVisionModuleStore()

const providerOptions = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Ollama (本地)', value: 'ollama' },
]

const modelOptions = {
  openai: [
    { label: 'GPT-4o', value: 'gpt-4o' },
    { label: 'GPT-4o Mini', value: 'gpt-4o-mini' },
    { label: 'GPT-4 Turbo', value: 'gpt-4-turbo' },
  ],
  ollama: [
    { label: 'llama3.2-vision', value: 'llama3.2-vision' },
    { label: 'llama3.1-vision', value: 'llama3.1-vision' },
    { label: 'qwen2-vl', value: 'qwen2-vl' },
  ],
}

const currentModelOptions = computed(() => modelOptions[visionStore.model.provider] || [])

function saveSettings() {
  visionStore.saveSettings()
}
</script>

<template>
  <div flex="~ col gap-6" max-w-150>
    <div>
      <div text-lg font-bold>
        {{ t('tamagotchi.settings.pages.modules.vision.title') }}
      </div>
      <div text-secondary text-sm>
        {{ t('tamagotchi.settings.pages.modules.vision.description') }}
      </div>
    </div>

    <div flex="~ col gap-4">
      <FieldCheckbox
        v-model="visionStore.enabled"
        :label="t('tamagotchi.settings.pages.modules.vision.enable')"
      />

      <FieldSelect
        v-model="visionStore.model.provider"
        :label="t('tamagotchi.settings.pages.modules.vision.provider')"
        :options="providerOptions"
      />

      <FieldSelect
        v-model="visionStore.model.modelName"
        :label="t('tamagotchi.settings.pages.modules.vision.model')"
        :options="currentModelOptions"
      />

      <FieldInput
        v-if="visionStore.model.provider === 'openai'"
        v-model="visionStore.model.apiKey"
        :label="t('tamagotchi.settings.pages.modules.vision.api-key')"
        type="password"
        placeholder="sk-..."
      />

      <FieldInput
        v-model="visionStore.model.baseUrl"
        :label="t('tamagotchi.settings.pages.modules.vision.base-url')"
        placeholder="https://api.openai.com/v1"
      />

      <FieldCheckbox
        v-model="visionStore.autoCapture.enabled"
        :label="t('tamagotchi.settings.pages.modules.vision.auto-capture')"
      />

      <FieldInput
        v-if="visionStore.autoCapture.enabled"
        v-model="visionStore.autoCapture.interval"
        :label="t('tamagotchi.settings.pages.modules.vision.capture-interval')"
        type="number"
        min="5000"
        step="5000"
      />

      <FieldInput
        v-model="visionStore.cooldown"
        :label="t('tamagotchi.settings.pages.modules.vision.cooldown')"
        type="number"
        min="1000"
        step="1000"
      />

      <Button
        class="mt-4"
        @click="saveSettings"
      >
        {{ t('settings.common.save') }}
      </Button>

      <div v-if="visionStore.isConfigured" class="mt-4 rounded-lg bg-green-100 p-4 text-green-800">
        {{ t('tamagotchi.settings.pages.modules.vision.configured') }}
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.pages.modules.vision.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
