<script setup lang="ts">
import { isStageTamagotchi } from '@proj-airi/stage-shared'
import { client } from '@proj-airi/stage-ui/composables/api'
import { BasicButton } from '@proj-airi/ui'
import { shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ orderId: string }>()
const emit = defineEmits<{ error: [] }>()

const { t } = useI18n()
const loading = shallowRef(false)

async function viewOrder() {
  if (loading.value)
    return

  loading.value = true
  try {
    const response = await client.api.v1.payments[':id'].receipt.$get({ param: { id: props.orderId } })
    if (!response.ok) {
      emit('error')
      return
    }

    const { url } = await response.json()
    if (isStageTamagotchi())
      window.open(url, '_blank', 'noopener,noreferrer')
    else
      window.location.assign(url)
  }
  catch {
    emit('error')
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <BasicButton
    type="button"
    size="unset"
    :aria-label="t('settings.pages.flux.audit.viewOrder')"
    :title="t('settings.pages.flux.audit.viewOrder')"
    :aria-busy="loading"
    :disabled="loading"
    :class="[
      'payment-receipt-action group absolute inset-0 h-full w-full rounded-[inherit] p-0!',
      'cursor-pointer border-none bg-transparent outline-none active:scale-100!',
      'sm:focus-visible:bg-primary-500/10 dark:sm:focus-visible:bg-primary-400/10',
      'focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2',
      'focus-visible:outline-primary-300 dark:focus-visible:outline-primary-400/50',
      'disabled:cursor-wait! disabled:opacity-100!',
    ]"
    @click="viewOrder"
  >
    <span
      aria-hidden="true"
      :class="[
        'pointer-events-none absolute right-3 top-1/2 hidden size-4 -translate-y-1/2 sm:block',
        'text-neutral-400 dark:text-neutral-500',
        'group-hover:text-primary-500 group-focus-visible:text-primary-500',
        'dark:group-hover:text-primary-400 dark:group-focus-visible:text-primary-400',
        loading ? 'i-svg-spinners:ring-resize' : 'i-solar:alt-arrow-right-linear',
      ]"
    />
    <span
      aria-hidden="true"
      :class="[
        'pointer-events-none absolute bottom-2.5 right-3 flex items-center gap-1.5 sm:hidden',
        'text-xs text-neutral-500 font-normal dark:text-neutral-400',
      ]"
    >
      <span v-if="loading" :class="['i-svg-spinners:ring-resize size-3']" />
      {{ t('settings.pages.flux.audit.viewOrder') }}
    </span>
  </BasicButton>
</template>

<style scoped>
.payment-receipt-action {
  -webkit-tap-highlight-color: transparent;
}

@media (hover: hover) {
  .payment-receipt-action:hover {
    --at-apply: bg-primary-500/10 dark:bg-primary-400/10;
  }
}

@media (hover: none) and (pointer: coarse) {
  .payment-receipt-action:active {
    --at-apply: bg-neutral-500/8 dark:bg-neutral-400/10;
  }
}
</style>
