<script setup lang="ts">
import { ref } from 'vue'

import ProviderApiKeyInput from './ProviderApiKeyInput.vue'

const apiKey = ref('')
const filledApiKey = ref('sk-1234567890abcdefghijklmnopqrstuvwxyz')
</script>

<template>
  <Story
    title="API Key Input"
    group="providers"
    :layout="{ type: 'grid', width: 600 }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="empty"
      title="Empty"
    >
      <div class="bg-white p-4 dark:bg-neutral-900">
        <ProviderApiKeyInput
          v-model="apiKey"
          provider-name="OpenAI"
          placeholder="sk-..."
        />
      </div>
    </Variant>

    <Variant
      id="filled"
      title="Filled"
    >
      <div class="bg-white p-4 dark:bg-neutral-900">
        <ProviderApiKeyInput
          v-model="filledApiKey"
          provider-name="OpenAI"
          placeholder="sk-..."
        />
      </div>
    </Variant>

    <Variant
      id="custom-label"
      title="Custom Label"
    >
      <div class="bg-white p-4 dark:bg-neutral-900">
        <ProviderApiKeyInput
          v-model="apiKey"
          provider-name="OpenAI"
          label="Secret API Key"
          description="Enter your secret API key from the provider dashboard"
          placeholder="sk-..."
        />
      </div>
    </Variant>

    <Variant
      id="not-required"
      title="Not Required"
    >
      <div class="bg-white p-4 dark:bg-neutral-900">
        <ProviderApiKeyInput
          v-model="apiKey"
          provider-name="OpenAI"
          :required="false"
          placeholder="sk-..."
        />
      </div>
    </Variant>
  </Story>
</template>
