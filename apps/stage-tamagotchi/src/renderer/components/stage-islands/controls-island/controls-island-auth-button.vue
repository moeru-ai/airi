<script setup lang="ts">
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { storeToRefs } from 'pinia'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ControlButtonTooltip from './control-button-tooltip.vue'
import ControlButton from './control-button.vue'

import {
  electronAuthStartLogin,
  electronOpenSettings,
} from '../../../../shared/eventa'

defineProps<{
  buttonStyle?: string
  iconClass?: string
}>()

const { t } = useI18n()
const authStore = useAuthStore()
const { isAuthenticated, user, needsLogin, credits } = storeToRefs(authStore)

const startLogin = useElectronEventaInvoke(electronAuthStartLogin)
const openSettings = useElectronEventaInvoke(electronOpenSettings)

const userName = computed(() => user.value?.name)
const userAvatar = computed(() => user.value?.image)

function handleClick() {
  if (isAuthenticated.value) {
    openSettings({ route: '/settings/account' })
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
</script>

<template>
  <div v-if="isAuthenticated" flex="~ col gap-1.5" mb-1.5>
    <!-- Top row: Avatar + Name -->
    <div flex="~ items-center gap-3" px-1 py-0.5>
      <ControlButtonTooltip disable-hoverable-content>
        <ControlButton
          :button-style="[buttonStyle, 'bg-black/20! border-none! p-2.5!']"
          @click="handleClick"
        >
          <img
            v-if="userAvatar"
            :src="userAvatar"
            :alt="userName ?? ''"
            :class="iconClass"
            class="rounded-full object-cover"
          >
          <div v-else i-solar:user-check-rounded-bold :class="iconClass" text="green-600 dark:green-400" />
        </ControlButton>
        <template #tooltip>
          {{ t('tamagotchi.stage.controls-island.account') }}
        </template>
      </ControlButtonTooltip>

      <span
        v-if="userName"
        text="base neutral-800 dark:neutral-200"
        truncate font-bold
      >
        {{ userName }}
      </span>
    </div>

    <!-- Bottom row: Flux balance -->
    <div
      flex="~ items-center justify-between"
      rounded-xl px-3 py-2
      bg="black/5 dark:bg-black/30"
    >
      <span text="xs neutral-500 dark:neutral-400">Flux</span>
      <span text="sm font-bold neutral-800 dark:neutral-200">{{ credits }}</span>
    </div>
  </div>

  <ControlButtonTooltip v-else disable-hoverable-content>
    <ControlButton :button-style="buttonStyle" @click="handleClick">
      <div i-solar:user-bold-duotone :class="iconClass" text="neutral-800 dark:neutral-300" />
    </ControlButton>
    <template #tooltip>
      {{ t('tamagotchi.stage.controls-island.login') }}
    </template>
  </ControlButtonTooltip>
</template>
