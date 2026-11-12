<script setup lang="ts">
import { useElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useFluxStatus } from '@proj-airi/stage-ui/composables/use-flux-status'
import { AIRI_FLUX_URL } from '@proj-airi/stage-ui/constants/public-links'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { Avatar } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ControlMenuRow from './control-menu-row.vue'

import {
  electronAuthCallback,
  electronAuthCallbackError,
  electronAuthStartLogin,
} from '../../../../shared/eventa'

const props = defineProps<{
  active: boolean
  buttonStyle?: string
  iconClass?: string
}>()

const emit = defineEmits<{
  openSettings: [route: string]
}>()

const { t } = useI18n()
const authStore = useAuthStore()
const { isAuthenticated, user, needsLogin } = storeToRefs(authStore)
const context = useElectronEventaContext()

const startSigningIn = useElectronEventaInvoke(electronAuthStartLogin)
const { subscribed, low, valueLabel: fluxValue } = useFluxStatus()
const fluxIcon = computed(() => subscribed.value ? 'i-solar:star-outline' : 'i-solar:battery-charge-outline')

const signingIn = ref(false)

function doSigningIn() {
  signingIn.value = true
  startSigningIn()
}

// Each listener belongs to this mounted menu, including its hidden measurement state.
const stopCallback = context.value.on(electronAuthCallback, () => {
  signingIn.value = false
})
const stopError = context.value.on(electronAuthCallbackError, () => {
  signingIn.value = false
})
onScopeDispose(() => {
  stopCallback()
  stopError()
})

// Hidden measurement must keep login requests for the visible menu.
watch([needsLogin, () => props.active], async ([requested, active]) => {
  if (active && requested && !isAuthenticated.value && await authStore.consumeLoginRequest())
    doSigningIn()
})

// Clear loading when authenticated
watch(isAuthenticated, (val) => {
  if (val)
    signingIn.value = false
})
</script>

<template>
  <!-- Signing in state -->
  <div v-if="signingIn && !isAuthenticated">
    <div
      :class="['flex items-center gap-3 rounded-xl bg-black/5 px-3 py-2.5 dark:bg-white/5']"
    >
      <div
        :class="[
          'size-4 shrink-0',
          'i-svg-spinners:ring-resize',
          'text-primary-500 dark:text-primary-400',
        ]"
      />
      <span :class="['truncate text-sm text-neutral-500 dark:text-neutral-400']">
        {{ t('tamagotchi.stage.controls-island.logging-in') }}
      </span>
    </div>
  </div>

  <!-- Authenticated state -->
  <div v-else-if="isAuthenticated" :class="['flex flex-col gap-1.5']">
    <ControlMenuRow
      data-testid="controls-island-account"
      :label="user?.name || t('settings.pages.account.title')"
      @click="emit('openSettings', '/settings/account')"
    >
      <template #leading>
        <Avatar
          :src="user?.image"
          :seed="user?.id"
          :class="[
            'size-8 flex items-center justify-center rounded-full',
            'bg-primary-100 dark:bg-primary-900/40',
          ]"
        />
      </template>
    </ControlMenuRow>

    <ControlMenuRow
      data-testid="controls-island-flux"
      :label="t('settings.pages.flux.title')"
      :icon="fluxIcon"
      :icon-class="props.iconClass"
      @click="emit('openSettings', AIRI_FLUX_URL)"
    >
      <span
        :class="[
          'shrink-0 text-xs font-semibold tabular-nums',
          subscribed && low ? 'text-orange-600 dark:text-orange-300' : 'text-neutral-600 dark:text-neutral-300',
        ]"
      >
        {{ fluxValue }}
      </span>
    </ControlMenuRow>
  </div>

  <!-- Not authenticated state -->
  <div v-else>
    <button
      type="button"
      :class="[
        'flex items-center gap-2.5',
        'w-full rounded-xl px-3 py-2.5',
        'bg-primary-500/10 hover:bg-primary-500/20',
        'dark:bg-primary-400/10 dark:hover:bg-primary-400/20',
        'transition-colors duration-200',
        'cursor-pointer border-none outline-none',
        'text-left',
        props.buttonStyle,
      ]"
      @click="doSigningIn"
    >
      <div
        :class="[
          'i-solar:login-3-bold-duotone',
          props.iconClass ?? 'size-4.5',
          'shrink-0 text-primary-500 dark:text-primary-400',
        ]"
      />
      <span :class="['text-sm text-primary-600 font-medium dark:text-primary-400']">
        {{ t('tamagotchi.stage.controls-island.login') }}
      </span>
    </button>
  </div>
</template>
