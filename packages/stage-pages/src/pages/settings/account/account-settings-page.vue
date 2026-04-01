<script setup lang="ts">
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

const emit = defineEmits<{
  login: []
  logout: []
}>()

const { t } = useI18n()
const authStore = useAuthStore()
const { isAuthenticated, user, credits } = storeToRefs(authStore)

const userName = computed(() => user.value?.name ?? '')
const userEmail = computed(() => user.value?.email ?? null)
const userAvatar = computed(() => user.value?.image ?? null)
</script>

<template>
  <div :class="['flex flex-col gap-6', 'p-4']">
    <template v-if="isAuthenticated">
      <div :class="['flex flex-col items-center gap-3', 'rounded-xl p-6', 'bg-neutral-50 dark:bg-neutral-900']">
        <div :class="['size-20 rounded-full overflow-hidden', 'bg-neutral-200 dark:bg-neutral-700', 'flex items-center justify-center']">
          <img
            v-if="userAvatar"
            :src="userAvatar"
            :alt="userName"
            :class="['size-full object-cover']"
          >
          <div
            v-else
            :class="['i-solar:user-circle-bold-duotone', 'size-12 text-neutral-400']"
          />
        </div>

        <div :class="['flex flex-col items-center gap-1']">
          <span :class="['text-sm text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.pages.account.signedInAs') }}
          </span>
          <h2 :class="['text-lg font-semibold']">
            {{ userName }}
          </h2>
          <p
            v-if="userEmail"
            :class="['text-sm text-neutral-500 dark:text-neutral-400']"
          >
            {{ userEmail }}
          </p>
        </div>
      </div>

      <RouterLink
        to="/settings/flux"
        :class="[
          'flex items-center justify-between',
          'rounded-xl p-4',
          'border border-neutral-200 dark:border-neutral-800',
          'hover:bg-neutral-50 dark:hover:bg-neutral-800/50',
          'transition-colors',
          'no-underline text-inherit',
        ]"
      >
        <div :class="['flex items-center gap-3']">
          <div :class="['i-solar:battery-charge-bold-duotone', 'size-6 text-primary-500']" />
          <div :class="['flex flex-col']">
            <span :class="['text-sm font-medium']">
              {{ t('settings.pages.account.fluxBalance') }}
            </span>
            <span :class="['text-2xl font-bold']">
              {{ credits }}
            </span>
          </div>
        </div>
        <div :class="['flex items-center gap-1', 'text-sm text-neutral-500 dark:text-neutral-400']">
          <span>{{ t('settings.pages.account.viewFluxDetails') }}</span>
          <div :class="['i-solar:alt-arrow-right-linear', 'size-4']" />
        </div>
      </RouterLink>

      <button
        :class="[
          'mt-4 w-full rounded-lg py-2.5 px-4',
          'text-sm font-medium',
          'text-red-600 dark:text-red-400',
          'bg-red-500/10 hover:bg-red-500/20',
          'border border-red-200 dark:border-red-800/50',
          'transition-colors cursor-pointer',
        ]"
        @click="emit('logout')"
      >
        {{ t('settings.pages.account.logout') }}
      </button>
    </template>

    <template v-else>
      <div :class="['flex flex-col items-center gap-6', 'rounded-xl p-8', 'bg-neutral-50 dark:bg-neutral-900']">
        <div :class="['i-solar:user-circle-bold-duotone', 'size-16 text-neutral-300 dark:text-neutral-600']" />
        <p :class="['text-sm text-neutral-500 dark:text-neutral-400', 'text-center max-w-xs']">
          {{ t('settings.pages.account.notLoggedIn') }}
        </p>
        <button
          :class="[
            'rounded-lg py-2.5 px-6',
            'text-sm font-medium',
            'text-white',
            'bg-primary-500 hover:bg-primary-600',
            'transition-colors cursor-pointer',
          ]"
          @click="emit('login')"
        >
          {{ t('settings.pages.account.login') }}
        </button>
      </div>
    </template>
  </div>
</template>
