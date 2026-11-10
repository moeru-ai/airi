<script setup lang="ts">
import StartupScreen from '@proj-airi/ui-loading-screens/startup-screen'

import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useStartupResourcesStore } from '../../../stores/startup-resources'

defineProps<{ logoSrc: string }>()

const emit = defineEmits<{
  (e: 'finished'): void
  (e: 'skipModel'): void
}>()
const { t } = useI18n()
const startup = useStartupResourcesStore()
const { progress, failed, ready } = storeToRefs(startup)
const errorTitle = computed(() => failed.value
  ? t('stage.startup.failed-resource', { resource: t(`stage.startup.resources.${failed.value.id}`) })
  : t('stage.startup.failed'))
const phase = ref<'splash' | 'loading' | 'done'>('splash')
const opened = ref(false)
let opening: Promise<void>

function retry() {
  window.location.reload()
}

onMounted(() => {
  opening = new Promise(resolve => setTimeout(resolve, 500))
  phase.value = 'loading'
  opened.value = true
})

watch([ready, opened], async ([isReady, isOpen]) => {
  if (!isReady || !isOpen || phase.value === 'done')
    return
  await opening
  await nextTick()
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  phase.value = 'done'
  emit('finished')
})
</script>

<template>
  <div class="startup-covered-content" :inert="phase !== 'done'" :aria-hidden="phase !== 'done' ? 'true' : undefined">
    <slot />
  </div>
  <StartupScreen
    :phase="failed ? 'error' : phase"
    :progress="progress"
    :logo-src="logoSrc"
    :label="t('stage.operations.load-models-status.loading')"
    :error-title="errorTitle"
    :error-hint="t(failed?.id === 'model' ? 'stage.startup.recover-model' : 'stage.startup.recover')"
    :error-message="failed?.error"
    :error-details-label="t('stage.startup.details')"
    :error-details-close-label="t('stage.startup.close-details')"
    :retry-label="t('stage.startup.retry')"
    :alternative-label="failed?.id === 'model' ? t('stage.startup.continue-without-model') : undefined"
    @retry="retry"
    @alternative="emit('skipModel')"
  />
</template>

<style scoped>
.startup-covered-content {
  display: contents;
}
</style>
