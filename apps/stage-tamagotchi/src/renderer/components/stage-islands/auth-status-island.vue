<script setup lang="ts">
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { StatusCapsule } from '@proj-airi/stage-ui/components'
import { Button } from '@proj-airi/ui'
import { useTimeoutFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { electronAuthStartLogin } from '../../../shared/eventa'
import { useAuthStatusStore } from '../../stores/auth-status'

const { t } = useI18n()
const { status } = storeToRefs(useAuthStatusStore())
const dismissedAttempt = ref<string>()
const startLogin = useElectronEventaInvoke(electronAuthStartLogin)
const { start, stop } = useTimeoutFn(() => {
  if (status.value?.state === 'success')
    status.value = undefined
}, 3000, { immediate: false })
const label = computed(() => {
  switch (status.value?.state) {
    case 'success': return t('stage.status.signed-in')
    case 'error': return t('stage.status.sign-in-error')
    case 'confirming': return t('stage.status.confirming')
    default: return t('stage.status.signing-in')
  }
})
watch(status, (value) => {
  stop()
  if (value?.state === 'success')
    start()
}, { immediate: true })
</script>

<template>
  <StatusCapsule
    v-if="status && status.attemptId !== dismissedAttempt"
    placement="below"
    align="center"
    :data-status="status.state"
    :tone="status.state === 'error' ? 'error' : 'neutral'"
    :label="label"
    :details="status.error"
    :reveal="status.state === 'success'"
  >
    <template #indicator>
      <span
        aria-hidden="true"
        :class="['t-icon-swap auth-status-icons size-4']"
        :data-state="status.state === 'waiting' || status.state === 'confirming' ? 'a' : 'b'"
      >
        <span data-icon="a" :class="['t-icon size-4']">
          <span :class="['i-solar:refresh-linear auth-pending block size-4']" />
        </span>
        <span data-icon="b" :class="['t-icon size-4']">
          <span :class="['block size-4', status.state === 'error' ? 'i-solar:danger-circle-linear' : 'i-solar:check-circle-linear']" />
        </span>
      </span>
    </template>
    <div :class="['mt-3 w-full flex items-center gap-2']">
      <Button
        size="sm"
        icon="i-solar:close-circle-line-duotone"
        :label="t('stage.status.dismiss')"
        :class="['min-w-0 flex-1 whitespace-nowrap']"
        @click="dismissedAttempt = status?.attemptId"
      />
      <Button
        v-if="status.state === 'error'"
        size="sm"
        color="primary"
        variant="primary"
        icon="i-solar:login-3-line-duotone"
        :label="t('tamagotchi.stage.controls-island.login')"
        :class="['min-w-0 flex-1 whitespace-nowrap']"
        @click="startLogin()"
      />
    </div>
  </StatusCapsule>
</template>

<style scoped>
.auth-status-icons {
  /* Keep the 16px symbols legible throughout the cross-fade. */
  --icon-swap-blur: 0px;
  --icon-swap-start-scale: 0.85;
}
.auth-pending {
  animation: auth-spin 1.2s linear infinite;
}
@keyframes auth-spin {
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .auth-pending { animation: none; }
}
</style>
