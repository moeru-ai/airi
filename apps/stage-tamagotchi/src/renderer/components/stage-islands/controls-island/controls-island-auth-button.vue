<script setup lang="ts">
import { useElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { formatUnreadBadge } from '@proj-airi/stage-ui/components'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { Avatar } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  electronAuthCallback,
  electronAuthCallbackError,
  electronAuthStartLogin,
  electronOpenSettings,
} from '../../../../shared/eventa'

const props = defineProps<{
  active: boolean
  buttonStyle?: string
  iconClass?: string
  /** The polled unread count of Notifications. The island owns the inbox store. @default 0 */
  notificationsUnread?: number
}>()

const emit = defineEmits<{
  /** The bell on the account card asks the menu to show the Notifications list in place. */
  openNotifications: []
}>()

const { t } = useI18n()
const unread = computed(() => props.notificationsUnread ?? 0)
const notificationsLabel = computed(() => unread.value > 0
  ? t('stage.notifications.open-unread', { count: unread.value })
  : t('stage.notifications.open'))
const authStore = useAuthStore()
const { isAuthenticated, user, needsLogin, credits } = storeToRefs(authStore)
const context = useElectronEventaContext()

const startSigningIn = useElectronEventaInvoke(electronAuthStartLogin)
const openSettings = useElectronEventaInvoke(electronOpenSettings)

const signingIn = ref(false)

const userName = computed(() => user.value?.name)
const userAvatar = computed(() => user.value?.image)

function handleClick() {
  if (isAuthenticated.value) {
    openSettings({ route: '/settings/account' })
  }
  else {
    doSigningIn()
  }
}

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
  <div v-if="signingIn && !isAuthenticated" flex="~ col gap-1.5" mb-1.5>
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
  <div v-else-if="isAuthenticated" :class="['mb-1.5 flex items-center gap-1']">
    <button
      type="button"
      :class="[
        'flex min-w-0 items-center gap-2.5',
        'rounded-xl px-2.5 py-2',
        'bg-transparent hover:bg-black/5 dark:hover:bg-white/5',
        'transition-colors duration-200',
        'cursor-pointer border-none outline-none',
        'min-w-0 flex-1 text-left',
        props.buttonStyle,
      ]"
      @click="handleClick"
    >
      <Avatar
        :src="userAvatar"
        :class="[
          'size-8 shrink-0 overflow-hidden rounded-full',
          'bg-primary-100 dark:bg-primary-900/40',
          'flex items-center justify-center',
        ]"
      />
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
    <button
      type="button"
      data-testid="controls-island-notifications"
      :aria-label="notificationsLabel"
      :title="t('stage.notifications.title')"
      :class="[
        'relative shrink-0 flex items-center gap-1 rounded-xl px-2 py-2',
        'bg-transparent hover:bg-black/5 dark:hover:bg-white/5',
        'transition-colors duration-200 cursor-pointer border-none outline-none',
        'focus-visible:outline-2 focus-visible:outline-primary-500',
      ]"
      @click="emit('openNotifications')"
    >
      <span aria-hidden="true" :class="['i-solar:bell-outline text-neutral-800 dark:text-neutral-300', props.iconClass ?? 'size-5']" />
      <span
        v-if="unread > 0"
        aria-hidden="true"
        :class="['min-w-5 rounded-full bg-primary-500 px-1.5 text-center text-xs text-white font-medium leading-5']"
      >
        {{ formatUnreadBadge(unread) }}
      </span>
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
