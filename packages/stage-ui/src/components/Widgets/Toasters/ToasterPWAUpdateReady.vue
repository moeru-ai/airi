<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div w-full>
    <div>
      {{ t('toaster.pwaUpdateReady.message') }}
    </div>
  </div>
</template>
