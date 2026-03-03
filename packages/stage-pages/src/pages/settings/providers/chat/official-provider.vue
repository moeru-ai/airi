<script setup lang="ts">
import {
  ProviderSettingsContainer,
  ProviderSettingsLayout,
} from '@proj-airi/stage-ui/components'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { Callout } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const router = useRouter()
const { t } = useI18n()
const authStore = useAuthStore()
const providersStore = useProvidersStore()
const { isAuthenticated, credits, isLoginOpen } = storeToRefs(authStore)

const providerId = 'official-provider'
const providerMetadata = providersStore.getProviderMetadata(providerId)

// Automatically enable official provider when authenticated
watch(isAuthenticated, (val) => {
  if (val) {
    providersStore.forceProviderConfigured(providerId)
  }
}, { immediate: true })

function handleLogin() {
  isLoginOpen.value = true
}
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata?.localizedName"
    :provider-icon-color="providerMetadata?.iconColor"
    :on-back="() => router.back()"
  >
    <ProviderSettingsContainer>
      <div v-if="!isAuthenticated" flex flex-col gap-4>
        <Callout theme="primary">
          <template #label>
            {{ t('settings.dialogs.onboarding.official.title') }}
          </template>
          <div flex flex-col gap-3>
            <p>{{ t('settings.dialogs.onboarding.loginPrompt') }}</p>
            <button
              type="button"
              class="w-fit rounded-lg bg-primary-500 px-4 py-2 text-white transition-colors active:scale-95 hover:bg-primary-600"
              @click="handleLogin"
            >
              {{ t('settings.dialogs.onboarding.loginAction') }}
            </button>
          </div>
        </Callout>
      </div>

      <div v-else flex flex-col gap-6>
        <div class="rounded-xl bg-neutral-100/50 p-6 backdrop-blur-sm dark:bg-neutral-800/50">
          <div flex items-center justify-between>
            <div flex flex-col gap-1>
              <span text="sm neutral-500 dark:neutral-400 font-medium uppercase tracking-wider">
                {{ t('settings.dialogs.onboarding.flux') }}
              </span>
              <span text="3xl font-bold text-primary-600 dark:text-primary-400">
                {{ credits }}
              </span>
            </div>
            <button
              type="button"
              class="rounded-full bg-primary-500/10 px-6 py-2 text-sm text-primary-600 font-semibold transition-all dark:bg-primary-400/10 hover:bg-primary-500 dark:text-primary-400 hover:text-white dark:hover:bg-primary-400 dark:hover:text-neutral-900"
              @click="router.push('/settings/flux')"
            >
              {{ t('settings.dialogs.onboarding.buyFlux') }}
            </button>
          </div>
        </div>

        <div class="border border-neutral-200/50 rounded-xl p-4 dark:border-neutral-700/50">
          <div flex items-center gap-3>
            <div class="h-2 w-2 animate-pulse rounded-full bg-green-500" />
            <span text="sm neutral-600 dark:neutral-300">
              {{ t('settings.pages.providers.provider.common.status.valid') }}
            </span>
          </div>
        </div>
      </div>
    </ProviderSettingsContainer>
  </ProviderSettingsLayout>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
