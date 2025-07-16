<script setup lang="ts">
import { ref } from 'vue'

import ProviderBaseUrlInput from './ProviderBaseUrlInput.vue'

const emptyUrl = ref('')
const defaultUrl = ref('https://api.openai.com/v1/')
const customUrl = ref('https://custom-api.example.com/v1/')
</script>

<template>
  <Story
    title="Base URL Input"
    group="providers"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="empty"
      title="Empty"
    >
      <div>
        <ProviderBaseUrlInput
          v-model="emptyUrl"
          placeholder="https://api.example.com/v1/"
        />
      </div>
    </Variant>

    <Variant
      id="default-url"
      title="Default URL"
    >
      <div>
        <ProviderBaseUrlInput
          v-model="defaultUrl"
          placeholder="https://api.openai.com/v1/"
        />
      </div>
    </Variant>

    <Variant
      id="custom-url"
      title="Custom URL"
    >
      <div>
        <ProviderBaseUrlInput
          v-model="customUrl"
          placeholder="https://api.example.com/v1/"
        />
      </div>
    </Variant>

    <Variant
      id="required"
      title="Required"
    >
      <div>
        <ProviderBaseUrlInput
          v-model="emptyUrl"
          placeholder="https://api.example.com/v1/"
          required
        />
      </div>
    </Variant>

    <Variant
      id="custom-label"
      title="Custom Label"
    >
      <div>
        <ProviderBaseUrlInput
          v-model="emptyUrl"
          label="API Endpoint"
          description="The base URL for the API service"
          placeholder="https://api.example.com/v1/"
        />
      </div>
    </Variant>
  </Story>
</template>
