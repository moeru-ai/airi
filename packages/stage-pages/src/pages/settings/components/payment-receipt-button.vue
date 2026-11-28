<script setup lang="ts">
import { client } from '@proj-airi/stage-ui/composables/api'
import { GhostButton } from '@proj-airi/ui'
import { onScopeDispose, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ orderId: string }>()
const emit = defineEmits<{ error: [], start: [] }>()

const { t } = useI18n()
const loading = shallowRef(false)
const controller = new AbortController()
const { signal } = controller
onScopeDispose(() => controller.abort())

async function openReceipt() {
  if (loading.value)
    return

  emit('start')
  loading.value = true
  try {
    const response = await client.api.v1.payments[':id'].receipt.$get(
      { param: { id: props.orderId } },
      { init: { signal } },
    )
    if (!response.ok)
      throw new Error('Failed to load payment receipt')

    const { url } = await response.json()
    if (signal.aborted)
      return
    window.open(url, '_blank', 'noopener,noreferrer')
  }
  catch {
    if (!signal.aborted)
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
    :aria-busy="loading"
    @click="openReceipt"
  />
</template>
