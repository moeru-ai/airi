<script setup lang="ts">
import { isCustomProvidersDisabled } from '@proj-airi/stage-shared'
import { Alert, Button } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAuthStore } from '../../../../stores/auth'

const emit = defineEmits<{
  /** The host opens the provider settings. Each host has its own way to open them. */
  configure: []
  /** The host starts sign-in. Each host has its own login flow. */
  signIn: []
}>()

const { t } = useI18n()
const { isAuthenticated } = storeToRefs(useAuthStore())

// Sign-in configures the official provider, so it is the shortest path to a ready chat.
const suggestSignIn = computed(() => !isAuthenticated.value)
const customProvidersEnabled = !isCustomProvidersDisabled()

const title = computed(() => suggestSignIn.value
  ? t('stage.chat.provider-configuration.sign-in-title')
  : t('stage.chat.provider-configuration.title'))
const description = computed(() => {
  if (!suggestSignIn.value)
    return t('stage.chat.provider-configuration.description')
  return customProvidersEnabled
    ? t('stage.chat.provider-configuration.sign-in-description')
    : t('stage.chat.provider-configuration.sign-in-description-official-only')
})
</script>

<template>
  <Alert tone="warning" :title="title">
    {{ description }}
    <template #actions>
      <template v-if="suggestSignIn">
        <Button size="sm" color="amber" variant="primary" @click="emit('signIn')">
          {{ t('stage.chat.provider-configuration.sign-in-action') }}
        </Button>
        <Button v-if="customProvidersEnabled" size="sm" variant="secondary" @click="emit('configure')">
          {{ t('stage.chat.provider-configuration.action') }}
        </Button>
      </template>
      <Button v-else size="sm" color="amber" variant="primary" @click="emit('configure')">
        {{ t('stage.chat.provider-configuration.action') }}
      </Button>
    </template>
  </Alert>
</template>
