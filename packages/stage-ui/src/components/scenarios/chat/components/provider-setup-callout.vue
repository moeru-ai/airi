<script setup lang="ts">
import { Alert, Button } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

const emit = defineEmits<{
  /** The host opens the provider settings. Each host has its own way to open them. */
  configure: []
}>()

const { t } = useI18n()
</script>

<template>
  <Alert
    tone="warning"
    :title="t('stage.chat.provider-configuration.title')"
  >
    {{ t('stage.chat.provider-configuration.description') }}
    <template #actions>
      <Button size="sm" color="amber" variant="primary" @click="emit('configure')">
        {{ t('stage.chat.provider-configuration.action') }}
      </Button>
    </template>
  </Alert>
</template>
