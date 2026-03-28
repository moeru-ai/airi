<script setup lang="ts">
import { useElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { fetchSession } from '@proj-airi/stage-ui/libs/auth'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import ControlButtonTooltip from './control-button-tooltip.vue'
import ControlButton from './control-button.vue'

import {
  electronAuthCallback,
  electronAuthCallbackError,
  electronAuthLogout,
  electronAuthStartLogin,
} from '../../../../shared/eventa'

defineProps<{
  buttonStyle?: string
  iconClass?: string
}>()

const { t } = useI18n()
const authStore = useAuthStore()
const { isAuthenticated, user, needsLogin } = storeToRefs(authStore)
const context = useElectronEventaContext()

const startLogin = useElectronEventaInvoke(electronAuthStartLogin)
const logout = useElectronEventaInvoke(electronAuthLogout)

const userName = computed(() => user.value?.name)
const userAvatar = computed(() => user.value?.image)

function handleClick() {
  if (isAuthenticated.value) {
    logout()
    authStore.user = null
    authStore.session = null
    authStore.token = null
    authStore.refreshToken = null
  }
  else {
    startLogin()
  }
}

// React to needsLogin from other components (e.g. onboarding)
watch(needsLogin, (val) => {
  if (val && !isAuthenticated.value) {
    startLogin()
    needsLogin.value = false
  }
})

// Listen for auth callback events from main process (after OIDC deep link)
let unsubCallback: (() => void) | undefined
let unsubError: (() => void) | undefined

onMounted(() => {
  unsubCallback = context.value.on(electronAuthCallback, async (event) => {
    const tokens = event.body
    if (!tokens)
      return

    authStore.token = tokens.accessToken
    if (tokens.refreshToken)
      authStore.refreshToken = tokens.refreshToken

    // Fetch full session/user data from server using the new token
    await fetchSession()
  })

  unsubError = context.value.on(electronAuthCallbackError, (event) => {
    if (event.body)
      toast.error(event.body.error)
  })
})

onUnmounted(() => {
  unsubCallback?.()
  unsubError?.()
})
</script>

<template>
  <ControlButtonTooltip disable-hoverable-content>
    <ControlButton :button-style="buttonStyle" @click="handleClick">
      <template v-if="isAuthenticated && userAvatar">
        <img
          :src="userAvatar"
          :alt="userName ?? ''"
          :class="iconClass"
          class="rounded-full object-cover"
        >
      </template>
      <template v-else-if="isAuthenticated">
        <div i-solar:user-check-rounded-bold :class="iconClass" text="green-600 dark:green-400" />
      </template>
      <template v-else>
        <div i-solar:user-bold-duotone :class="iconClass" text="neutral-800 dark:neutral-300" />
      </template>
    </ControlButton>
    <template #tooltip>
      {{ isAuthenticated ? t('tamagotchi.stage.controls-island.logout') : t('tamagotchi.stage.controls-island.login') }}
    </template>
  </ControlButtonTooltip>
</template>
