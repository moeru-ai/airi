<script setup lang="ts">
import type { CapacitorPackage } from '@proj-airi/stage-ui/composables/use-subscription'

import { isFluxPurchaseDisabled } from '@proj-airi/stage-shared'
import { useSubscription } from '@proj-airi/stage-ui/composables/use-subscription'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { FieldCheckbox } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const authStore = useAuthStore()
const { capacitorPercent, fallbackToFlux } = storeToRefs(authStore)

const fluxPurchaseDisabled = isFluxPurchaseDisabled()

const subscription = useSubscription({
  getUserId: () => authStore.user?.id ?? '',
  onChanged: () => authStore.updateCredits(),
})

const message = ref<{ type: 'success' | 'error', text: string } | null>(null)
const preferenceSaving = ref(false)

type CapacitorAction = 'buy' | 'current' | 'upgrade' | 'downgrade'

const currentCapacitor = computed(() => subscription.currentCapacitor.value)

function capacitorAction(pkg: CapacitorPackage): CapacitorAction {
  const current = currentCapacitor.value
  if (!current)
    return 'buy'
  if (pkg.productId === current.productId)
    return 'current'
  const currentPackage = subscription.packages.value.find(item => item.productId === current.productId)
  return currentPackage && pkg.amountMicros < currentPackage.amountMicros ? 'downgrade' : 'upgrade'
}

const ACTION_LABEL: Record<Exclude<CapacitorAction, 'buy'>, string> = {
  current: 'settings.pages.capacitor.currentPackage',
  upgrade: 'settings.pages.capacitor.upgrade',
  downgrade: 'settings.pages.capacitor.downgrade',
}

function actionLabel(pkg: CapacitorPackage): string {
  const action = capacitorAction(pkg)
  if (action === 'buy')
    return ''
  return t(ACTION_LABEL[action])
}

const fallbackChoice = computed({
  get: () => fallbackToFlux.value,
  set: value => void savePreference(value),
})

const currentCapacitorName = computed(() => {
  const current = currentCapacitor.value
  if (!current)
    return t('settings.pages.capacitor.noCapacitor')
  return subscription.packages.value.find(item => item.productId === current.productId)?.name ?? ''
})

const quotaPercentage = computed(() => capacitorPercent.value ?? 0)

function formatDate(iso: string | null): string {
  if (!iso)
    return ''
  return new Date(iso).toLocaleString()
}

onMounted(async () => {
  try {
    await subscription.fetchStatus()
  }
  catch {
    message.value = { type: 'error', text: t('settings.pages.capacitor.statusError') }
  }
  if (!fluxPurchaseDisabled) {
    await subscription.fetchPackages().catch(() => {
      message.value = { type: 'error', text: t('settings.pages.capacitor.packagesError') }
    })
  }
})

async function savePreference(value: boolean) {
  preferenceSaving.value = true
  try {
    await subscription.setFallbackToFlux(value)
  }
  catch {
    message.value = { type: 'error', text: t('settings.pages.capacitor.preferenceError') }
  }
  finally {
    preferenceSaving.value = false
  }
}

function capacitorCardDisabled(pkg: CapacitorPackage): boolean {
  if (subscription.purchasingPackageId.value !== null)
    return true
  const action = capacitorAction(pkg)
  return action === 'current' || (action !== 'buy' && !subscription.managementUrl.value)
}

function handleCapacitor(pkg: CapacitorPackage) {
  const action = capacitorAction(pkg)
  if (action === 'current')
    return
  if (action === 'buy') {
    void handleSubscribe(pkg.packageId)
    return
  }
  const url = subscription.managementUrl.value
  if (url)
    window.open(url, '_blank', 'noopener')
}

async function handleSubscribe(packageId: string) {
  message.value = null
  try {
    const outcome = await subscription.purchaseCapacitor(packageId)
    if (outcome === 'cancelled') {
      message.value = { type: 'error', text: t('settings.pages.capacitor.checkout.canceled') }
      return
    }
    message.value = {
      type: 'success',
      text: t(outcome === 'activated'
        ? 'settings.pages.capacitor.checkout.success'
        : 'settings.pages.capacitor.checkout.pending'),
    }
  }
  catch {
    message.value = { type: 'error', text: t('settings.pages.capacitor.checkout.error') }
  }
}
</script>

<template>
  <div :class="['flex flex-col gap-6', 'p-4']">
    <div
      v-if="message"
      :class="[
        'rounded-lg p-3 text-sm',
        message.type === 'success'
          ? 'bg-green-500/10 text-green-600 dark:text-green-400'
          : 'bg-red-500/10 text-red-600 dark:text-red-400',
      ]"
    >
      {{ message.text }}
    </div>

    <!-- Current capacitor card -->
    <div :class="['relative overflow-hidden rounded-2xl', 'bg-neutral-100 p-6 sm:p-8 dark:bg-neutral-800']">
      <div
        :class="['capacitor-progress-bar absolute inset-y-0 left-0', 'bg-primary-500/20 dark:bg-primary-400/20']"
      />
      <div :class="['relative z-1 flex items-center justify-start gap-4 text-left', 'sm:flex-col sm:justify-center sm:gap-2 sm:text-center']">
        <div :class="['i-solar:star-bold-duotone size-12 shrink-0 text-primary-500', 'sm:mx-auto sm:size-14']" />
        <div :class="['flex flex-col gap-1']">
          <h2 v-if="currentCapacitorName" :class="['text-3xl font-bold tracking-tight', 'sm:text-4xl']">
            {{ currentCapacitorName }}
          </h2>
          <p v-if="capacitorPercent != null" :class="['text-sm text-neutral-500']">
            {{ t('settings.pages.capacitor.remaining', { percent: capacitorPercent }) }}
          </p>
          <p v-else :class="['text-sm text-neutral-500']">
            {{ t('settings.pages.capacitor.description') }}
          </p>
          <p v-if="currentCapacitor?.expiresAt" :class="['text-xs text-neutral-400']">
            {{ currentCapacitor.willRenew
              ? t('settings.pages.capacitor.renewsAt', { date: formatDate(currentCapacitor.expiresAt) })
              : t('settings.pages.capacitor.expiresAt', { date: formatDate(currentCapacitor.expiresAt) }) }}
          </p>
          <a
            v-if="subscription.managementUrl.value"
            :href="subscription.managementUrl.value"
            target="_blank"
            rel="noopener"
            :class="['text-xs text-primary-600 underline underline-offset-2', 'dark:text-primary-400']"
          >
            {{ t('settings.pages.capacitor.manageSubscription') }}
          </a>
        </div>
      </div>
    </div>

    <!-- Flux fallback preference -->
    <FieldCheckbox
      v-model="fallbackChoice"
      :disabled="preferenceSaving || !currentCapacitor"
      :label="t('settings.pages.capacitor.fallbackToFlux')"
      :description="t('settings.pages.capacitor.fallbackToFluxHint')"
    />

    <!-- Packages -->
    <div v-if="!fluxPurchaseDisabled && subscription.packages.value.length > 0" :class="['flex flex-col gap-4']">
      <div :class="['grid grid-cols-1 gap-4', 'sm:grid-cols-2']">
        <button
          v-for="(pkg, index) in subscription.packages.value" :key="pkg.packageId"
          :disabled="capacitorCardDisabled(pkg)"
          :class="[
            'group relative flex flex-row items-center justify-between gap-4 overflow-hidden text-left',
            'sm:flex-col sm:items-center sm:justify-center sm:gap-2 sm:text-center',
            'rounded-2xl border-2 bg-white p-6',
            'border-neutral-200 dark:border-neutral-800 dark:bg-neutral-900',
            'transition-all duration-300 ease-out',
            'hover:-translate-y-1 hover:border-primary-400 hover:shadow-md dark:hover:border-primary-500',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
            subscription.purchasingPackageId.value !== null && subscription.purchasingPackageId.value !== pkg.packageId ? 'opacity-50 grayscale-50 cursor-not-allowed' : '',
            capacitorCardDisabled(pkg) ? 'cursor-not-allowed' : 'cursor-pointer',
          ]"
          @click="handleCapacitor(pkg)"
        >
          <div
            v-if="subscription.purchasingPackageId.value === pkg.packageId"
            :class="['absolute inset-0 z-10 flex items-center justify-center', 'bg-white/60 backdrop-blur-sm dark:bg-neutral-900/60']"
          >
            <div :class="['i-svg-spinners:90-ring-with-bg size-8 text-primary-500']" />
          </div>

          <div :class="['relative z-1 w-full flex flex-col gap-1', 'sm:items-center']">
            <div v-if="pkg.name" :class="['text-sm text-neutral-500 font-medium transition-colors', 'dark:text-neutral-400', 'group-hover:text-primary-600 dark:group-hover:text-primary-400']">
              {{ pkg.name }}
            </div>
            <div v-if="pkg.benefit" :class="['text-xs text-neutral-400']">
              {{ pkg.benefit }}
            </div>
            <div :class="['flex items-baseline justify-start gap-1', 'sm:justify-center']">
              <span :class="['text-2xl text-neutral-800 font-bold', 'dark:text-neutral-100']">
                {{ pkg.formattedPrice }}
              </span>
              <span :class="['text-sm text-neutral-400']">
                {{ t('settings.pages.capacitor.perMonth') }}
              </span>
            </div>
            <div v-if="actionLabel(pkg)" :class="['text-xs text-primary-600 font-medium', 'dark:text-primary-400']">
              {{ actionLabel(pkg) }}
            </div>
          </div>

          <div :class="['relative z-1 flex items-center gap-1 text-primary-200 transition-colors', 'dark:text-primary-800/60', 'group-hover:text-primary-300 sm:hidden dark:group-hover:text-primary-700']">
            <div
              v-for="i in Math.min(index + 1, 2)" :key="i"
              :class="['i-solar:star-bold-duotone size-8', 'sm:size-10']"
            />
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.capacitor-progress-bar {
  width: 100%;
  animation: capacitor-progress-bar-grow 1s cubic-bezier(0.4, 0, 0.2, 1) 0.5s forwards;
}

@keyframes capacitor-progress-bar-grow {
  0% {
    width: 100%;
    opacity: 0.5;
  }
  100% {
    width: v-bind('`${quotaPercentage}%`');
    opacity: 1;
  }
}
</style>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.capacitor.title
  icon: i-solar:star-bold-duotone
</route>
