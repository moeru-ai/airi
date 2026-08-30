<script setup lang="ts">
import { isStageTamagotchi } from '@proj-airi/stage-shared'
import { Callout } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const showWebLimit = !isStageTamagotchi()
</script>

<template>
  <Callout
    v-if="showWebLimit"
    :label="t('settings.pages.providers.provider.custom-model.platform-limit.title')"
    theme="orange"
    data-testid="custom-model-web-limit"
  >
    {{ t('settings.pages.providers.provider.custom-model.platform-limit.web') }}
  </Callout>
</template>
