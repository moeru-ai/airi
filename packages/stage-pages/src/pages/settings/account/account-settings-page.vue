<script setup lang="ts">
import DangerZoneSection from '@proj-airi/stage-ui/components/scenarios/settings/account/danger-zone-section.vue'
import EmailSection from '@proj-airi/stage-ui/components/scenarios/settings/account/email-section.vue'
import LinkedAccountsSection from '@proj-airi/stage-ui/components/scenarios/settings/account/linked-accounts-section.vue'
import PasswordSection from '@proj-airi/stage-ui/components/scenarios/settings/account/password-section.vue'
import ProfileSection from '@proj-airi/stage-ui/components/scenarios/settings/account/profile-section.vue'

import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { Button } from '@proj-airi/ui'
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
  <div :class="['flex flex-col gap-6', 'p-4', 'max-w-4xl mx-auto w-full']">
    <template v-if="isAuthenticated">
      <!-- Welcome Header -->
      <div :class="[
        'flex flex-col md:flex-row items-center md:items-start gap-6',
        'rounded-2xl p-8',
        'bg-gradient-to-br from-primary-50 to-white dark:from-primary-950/40 dark:to-neutral-900',
        'border border-primary-100 dark:border-primary-900/50 shadow-sm'
      ]">
        <div :class="['size-24 rounded-full overflow-hidden', 'bg-white dark:bg-neutral-800', 'flex items-center justify-center', 'border-4 border-white dark:border-neutral-800 shadow-md']">
          <img
            v-if="userAvatar"
            :src="userAvatar"
            :alt="userName"
            :class="['size-full object-cover']"
          >
          <div
            v-else
            :class="['i-solar:user-circle-bold-duotone', 'size-12 text-primary-300 dark:text-primary-700']"
          />
        </div>

        <div :class="['flex flex-col items-center md:items-start gap-1 flex-1 py-2']">
          <span :class="['text-sm font-medium text-primary-600 dark:text-primary-400']">
            {{ t('settings.pages.account.signedInAs') }}
          </span>
          <h2 :class="['text-2xl font-bold text-neutral-900 dark:text-white']">
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

      <!-- Flux Balance -->
      <RouterLink
        to="/settings/flux"
        :class="[
          'flex items-center justify-between',
          'rounded-2xl p-5',
          'bg-white dark:bg-neutral-900',
          'border border-neutral-200 dark:border-neutral-800 shadow-sm',
          'hover:border-primary-300 dark:hover:border-primary-700',
          'transition-all duration-200 ease-in-out',
          'no-underline text-inherit',
        ]"
      >
        <div :class="['flex items-center gap-4']">
          <div :class="['p-3 rounded-xl bg-primary-50 dark:bg-primary-900/30 text-primary-500']">
            <div :class="['i-solar:battery-charge-bold-duotone', 'size-6']" />
          </div>
          <div :class="['flex flex-col']">
            <span :class="['text-sm font-medium text-neutral-500 dark:text-neutral-400']">
              {{ t('settings.pages.account.fluxBalance') }}
            </span>
            <span :class="['text-2xl font-bold text-neutral-900 dark:text-white leading-none mt-1']">
              {{ credits }}
            </span>
          </div>
        </div>
        <div :class="['flex items-center gap-1', 'text-sm font-medium text-primary-500 transition-transform group-hover:translate-x-1']">
          <span>{{ t('settings.pages.account.viewFluxDetails') }}</span>
          <div :class="['i-solar:alt-arrow-right-linear', 'size-4']" />
        </div>
      </RouterLink>

      <div :class="['flex flex-col gap-6']">
        <ProfileSection />
        <LinkedAccountsSection />
        <PasswordSection />
        <EmailSection />
        <DangerZoneSection />
      </div>

      <div :class="['flex justify-end mt-4']">
        <Button
          variant="danger"
          :label="t('settings.pages.account.logout')"
          @click="emit('logout')"
        />
      </div>
    </template>

    <template v-else>
      <div :class="['flex flex-col items-center gap-6', 'rounded-2xl p-10', 'bg-white dark:bg-neutral-900', 'border border-neutral-200 dark:border-neutral-800 shadow-sm']">
        <div :class="['p-6 rounded-full bg-neutral-50 dark:bg-neutral-800']">
          <div :class="['i-solar:user-circle-bold-duotone', 'size-16 text-neutral-400 dark:text-neutral-500']" />
        </div>
        <div :class="['text-center max-w-sm']">
          <h2 :class="['text-xl font-bold text-neutral-900 dark:text-white mb-2']">Authentication Required</h2>
          <p :class="['text-sm text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.pages.account.notLoggedIn') }}
          </p>
        </div>
        <button
          :class="[
            'rounded-xl py-3 px-8 mt-2',
            'text-sm font-semibold shadow-sm',
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
