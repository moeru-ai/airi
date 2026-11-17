<script setup lang="ts">
import { isStageTamagotchi } from '@proj-airi/stage-shared'
import { client } from '@proj-airi/stage-ui/composables/api'
import { GhostButton } from '@proj-airi/ui'
import { onScopeDispose, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ orderId: string }>()
const emit = defineEmits<{ error: [], start: [] }>()

const { t } = useI18n()
const loading = shallowRef(false)
const controller = new AbortController()
onScopeDispose(() => controller.abort())

async function viewOrder() {
  if (loading.value)
    return

  emit('start')
  loading.value = true
  try {
    const response = await client.api.v1.payments[':id'].receipt.$get({ param: { id: props.orderId } }, { init: { signal: controller.signal } })
    if (controller.signal.aborted)
      return
    if (!response.ok) {
      emit('error')
      return
    }

    const { url } = await response.json()
    if (controller.signal.aborted)
      return
    if (isStageTamagotchi())
      window.open(url, '_blank', 'noopener,noreferrer')
    else
      window.location.assign(url)
  }
  catch {
    if (!controller.signal.aborted)
      emit('error')
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <GhostButton
    type="button"
    size="sm"
    :label="t('settings.pages.billing.viewReceipt')"
    icon="i-solar:arrow-right-up-linear"
    :loading="loading"
    :disabled="loading"
    :aria-busy="loading"
    @click="viewOrder"
  />
</template>
