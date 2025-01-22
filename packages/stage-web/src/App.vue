<script setup lang="ts">
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { storeToRefs } from 'pinia'
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView } from 'vue-router'

const i18n = useI18n()
const settings = storeToRefs(useSettings())

watch(settings.language, () => {
  i18n.locale.value = settings.language.value
})
</script>

<template>
  <RouterView />
</template>
