<script setup lang="ts">
import { useElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  electronAuthCallback,
  electronAuthCallbackError,
  electronAuthStartLogin,
  electronOpenSettings,
} from '../../../../shared/eventa'

const props = defineProps<{
  buttonStyle?: string
  iconClass?: string
}>()

const { t } = useI18n()
const authStore = useAuthStore()
const { isAuthenticated, user, needsLogin, credits } = storeToRefs(authStore)
const context = useElectronEventaContext()

const startLogin = useElectronEventaInvoke(electronAuthStartLogin)
const openSettings = useElectronEventaInvoke(electronOpenSettings)

const loggingIn = ref(false)

const userName = computed(() => user.value?.name)
const userAvatar = computed(() => user.value?.image)

function handleClick() {
  if (isAuthenticated.value) {
    openSettings({ route: '/settings/account' })
  }
  else {
    doLogin()
  }
}

function doLogin() {
  loggingIn.value = true
  startLogin()
}

// Clear loading state on callback or error from main process.
// No cleanup needed — this component lives for the window's lifetime.
context.value.on(electronAuthCallback, () => {
  loggingIn.value = false
})
context.value.on(electronAuthCallbackError, () => {
  loggingIn.value = false
})

// React to needsLogin from other components (e.g. onboarding)
watch(needsLogin, (val) => {
  if (val && !isAuthenticated.value) {
    doLogin()
    needsLogin.value = false
  }
})

// Clear loading when authenticated
watch(isAuthenticated, (val) => {
  if (val)
    loggingIn.value = false
})
</script>

<template>
  <!-- Logging in state -->
  <div v-if="loggingIn && !isAuthenticated" flex="~ col gap-1.5" mb-1.5>
    <div
      flex="~ items-center gap-3"
      rounded-xl px-3 py-2.5
      bg="black/5 dark:white/5"
    >
      <div
        :class="[
          'size-4 shrink-0',
          'i-svg-spinners:ring-resize',
          'text-primary-500 dark:text-primary-400',
        ]"
      />
      <span text="sm neutral-500 dark:neutral-400" truncate>
        {{ t('tamagotchi.stage.controls-island.logging-in') }}
      </span>
    </div>
  </div>

  <!-- Authenticated state -->
  <div v-else-if="isAuthenticated" flex="~ col gap-1.5" mb-1.5>
    <button
      type="button"
      :class="[
        'flex min-w-0 items-center gap-2.5',
        'rounded-xl px-2.5 py-2',
        'bg-transparent hover:bg-black/5 dark:hover:bg-white/5',
        'transition-colors duration-200',
        'cursor-pointer border-none outline-none',
        'w-full text-left',
        props.buttonStyle,
      ]"
      @click="handleClick"
    >
      <div
        :class="[
          'size-8 shrink-0 overflow-hidden rounded-full',
          'bg-primary-100 dark:bg-primary-900/40',
          'flex items-center justify-center',
        ]"
      >
        <img
          v-if="userAvatar"
          :src="userAvatar"
          :alt="userName ?? ''"
          class="size-full object-cover"
        >
        <div v-else i-solar:user-check-rounded-bold class="size-4 text-primary-500 dark:text-primary-400" />
      </div>
      <div class="min-w-0 flex flex-1 flex-col items-start gap-0.5">
        <span
          :class="[
            'w-full truncate',
            'text-sm font-semibold',
            'text-neutral-800 dark:text-neutral-200',
          ]"
        >
          {{ userName }}
        </span>

        <!-- Flux balance: horizontal pill -->
        <div
          :class="[
            'flex items-center gap-1',
            'rounded-md px-1.5 py-0.5',
            'bg-primary-500/12 dark:bg-primary-400/12',
            'text-[10px] font-semibold',
            'text-primary-600 dark:text-primary-400',
          ]"
        >
          <div
            :class="[
              'i-solar:battery-charge-bold-duotone',
              'size-3 shrink-0',
            ]"
          />
          <span class="whitespace-nowrap leading-tight">{{ credits }} Flux</span>
        </div>
      </div>
    </button>
  </div>

  <!-- Not authenticated state -->
  <div v-else mb-1.5>
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
      @click="handleClick"
    >
      <div
        i-solar:login-3-bold-duotone
        :class="[
          props.iconClass ?? 'size-4.5',
          'shrink-0 text-primary-500 dark:text-primary-400',
        ]"
      />
      <span text="sm primary-600 dark:primary-400" font-medium>
        {{ t('tamagotchi.stage.controls-island.login') }}
      </span>
    </button>
  </div>
</template>
