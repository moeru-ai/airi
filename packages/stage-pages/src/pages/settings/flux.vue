<script setup lang="ts">
import type { FluxBalanceBucket } from '@proj-airi/stage-ui/composables/use-analytics'

import { isFluxPurchaseDisabled, isStageTamagotchi } from '@proj-airi/stage-shared'
import { client } from '@proj-airi/stage-ui/composables/api'
import { useAnalytics } from '@proj-airi/stage-ui/composables/use-analytics'
import { AIRI_PRIVACY_URL, AIRI_TERMS_URL } from '@proj-airi/stage-ui/constants/public-links'
import { isSigningIn } from '@proj-airi/stage-ui/libs/auth'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { Alert, SelectTab, Skeleton } from '@proj-airi/ui'
import { until, useEventListener } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const { credits, isAuthenticated } = storeToRefs(authStore)
const formattedCredits = computed(() => new Intl.NumberFormat().format(credits.value))
const {
  trackCheckoutStarted,
  trackPaywallSeen,
  trackPlanSelected,
  trackPricingViewed,
  trackQuotaLimitReached,
  trackUpgradeClicked,
} = useAnalytics()

const fluxPurchaseDisabled = isFluxPurchaseDisabled()

// On desktop, checkout happens in the external system browser (see handleBuy), so
// the app never receives the success_url redirect that web/mobile use to refresh.
// Re-pull the FLUX balance whenever the window regains focus; the balance source
// of truth is the server (credited by the Stripe webhook).
if (isStageTamagotchi()) {
  useEventListener(window, 'focus', () => {
    if (isAuthenticated.value)
      authStore.updateCredits()
  })
}

interface FluxPackage {
  stripePriceId: string
  label: string
  defaultCurrency: string
  currencies: Record<string, string>
  recommended?: boolean
}

const loadingPriceId = ref<string | null>(null)
const message = ref<{ type: 'success' | 'error', text: string } | null>(null)
const checkoutReturnMessageActive = ref(false)
const packages = ref<FluxPackage[]>([])
const packagesLoading = ref(!fluxPurchaseDisabled)
const selectedCurrency = ref<string>('usd')

const currencyOptions = computed(() => {
  if (packages.value.length === 0)
    return []
  // Currencies supported by all packages
  const first = Object.keys(packages.value[0].currencies)
  return first
    .filter(c => packages.value.every(p => c in p.currencies))
    .map(c => ({ label: c.toUpperCase(), value: c }))
})

/**
 * Buckets Flux balances so monetization analytics never expose exact balances.
 */
function fluxBalanceBucket(balance: number | undefined): FluxBalanceBucket {
  if (balance == null || Number.isNaN(balance))
    return 'unknown'
  if (balance <= 0)
    return 'zero'
  if (balance <= 100)
    return '1_100'
  if (balance <= 1000)
    return '101_1000'
  if (balance <= 10000)
    return '1001_10000'
  return '10000_plus'
}

const capacity = ref(0)

const fluxPercentage = computed(() => {
  if (capacity.value <= 0)
    return credits.value > 0 ? 100 : 0
  return Math.min(100, Math.round((credits.value / capacity.value) * 100))
})

async function fetchStats() {
  try {
    const res = await client.api.v1.flux.stats.$get()
    if (res.ok) {
      const data = await res.json()
      capacity.value = data.capacity
    }
  }
  catch {}
}

async function fetchPackages() {
  try {
    const res = await client.api.v1.stripe.packages.$get()
    if (res.ok) {
      const data = await res.json() as FluxPackage[]
      packages.value = data
      if (data.length > 0)
        selectedCurrency.value = data[0].defaultCurrency
    }
  }
  catch {
    if (!checkoutReturnMessageActive.value)
      message.value = { type: 'error', text: t('settings.pages.flux.packagesError') }
  }
  finally {
    packagesLoading.value = false
  }
}

/**
 * Shows a Stripe return banner that background package refreshes must not replace.
 */
function showCheckoutReturnMessage(type: 'success' | 'error', text: string) {
  checkoutReturnMessageActive.value = true
  message.value = { type, text }
}

watch(isAuthenticated, async (authenticated) => {
  if (!authenticated) {
    capacity.value = 0
    return
  }

  await Promise.allSettled([
    authStore.updateCredits(),
    fetchStats(),
  ])

  if (!fluxPurchaseDisabled && credits.value <= 0) {
    trackQuotaLimitReached({
      limit_type: 'flux',
      current_usage: credits.value,
      limit_value: capacity.value > 0 ? capacity.value : undefined,
      entry: 'pricing',
    })
  }
}, { immediate: true })

onMounted(() => {
  if (!fluxPurchaseDisabled)
    void fetchPackages()

  if (route.query.success === 'true') {
    showCheckoutReturnMessage('success', t('settings.pages.flux.checkout.success'))
    router.replace({ query: {} })
  }
  else if (route.query.canceled === 'true') {
    showCheckoutReturnMessage('error', t('settings.pages.flux.checkout.canceled'))
    router.replace({ query: {} })
  }

  if (!fluxPurchaseDisabled) {
    trackPaywallSeen({
      entry_surface: 'settings_flux',
      reason: 'manual_topup',
      flux_balance_bucket: fluxBalanceBucket(credits.value),
    })
    trackPricingViewed('settings_flux', 'one_time')
  }
})

async function handleBuy(stripePriceId: string) {
  // OpenPanel funnel step 2: user picked a plan. price_minor_unit lives on
  // the Stripe webhook (server-side `payment_completed`); we deliberately
  // don't send a formatted-string price from the SPA so funnels don't get
  // poisoned by currency-formatting drift.
  trackUpgradeClicked({
    source_page: 'settings_flux',
    current_plan: 'flux',
    trigger: 'manual_topup',
  })
  trackPlanSelected(stripePriceId, {
    currency: selectedCurrency.value,
    entry_surface: 'settings_flux',
  })

  loadingPriceId.value = stripePriceId
  checkoutReturnMessageActive.value = false
  message.value = null
  try {
    if (!isAuthenticated.value) {
      await authStore.requestLogin()
      // The sign-in starts on the next tick. Keep the spinner until it settles or the page unloads.
      await nextTick()
      await until(isSigningIn).toBe(false)
      return
    }

    const res = await client.api.v1.stripe.checkout.$post({ json: { stripePriceId, currency: selectedCurrency.value } })
    if (!res.ok) {
      const data = await res.json() as { error?: string, message?: string }
      message.value = { type: 'error', text: data.message || t('settings.pages.flux.checkout.error') }
      return
    }
    const data = await res.json()
    if (data.url) {
      // Start capture before redirecting to Stripe so fetch keepalive can
      // finish delivery after the page unloads.
      trackCheckoutStarted(stripePriceId, {
        currency: selectedCurrency.value,
        entry_surface: 'settings_flux',
      })
      // Electron renderer runs from file:// and cannot navigate to Stripe in-window
      // (the settings window would load checkout.stripe.com and never come back).
      // window.open routes through setWindowOpenHandler -> shell.openExternal, so the
      // system browser handles payment. Web keeps the in-window redirect.
      if (isStageTamagotchi())
        window.open(data.url, '_blank')
      else
        window.location.href = data.url
    }
  }
  catch {
    message.value = { type: 'error', text: t('settings.pages.flux.checkout.error') }
  }
  finally {
    loadingPriceId.value = null
  }
}
</script>

<template>
  <div :class="['flex flex-col gap-6 min-h-full p-4']">
    <!-- Message banner -->
    <Alert
      v-if="message"
      :tone="message.type === 'success' ? 'success' : 'danger'"
      live="polite"
    >
      {{ message.text }}
    </Alert>

    <!-- Battery Card -->
    <div v-if="isAuthenticated" :class="['relative overflow-hidden rounded-2xl bg-neutral-100 dark:bg-neutral-800 p-6 sm:p-8']">
      <!-- Background Progress -->
      <div
        class="flux-progress-bar absolute inset-y-0 left-0 bg-primary-500/20 dark:bg-primary-400/20"
      />

      <!-- Content -->
      <div :class="['relative z-1 flex items-center justify-start sm:flex-col sm:justify-center gap-4 sm:gap-2 text-left sm:text-center']">
        <div :class="['i-solar:battery-charge-bold-duotone size-12 shrink-0 text-primary-500 sm:mx-auto sm:size-14']" />
        <div :class="['flex flex-col gap-1']">
          <h2 :class="['text-3xl font-bold tracking-tight sm:text-4xl']">
            {{ formattedCredits }}
          </h2>
          <p :class="['text-sm text-neutral-500']">
            {{ t(fluxPurchaseDisabled ? 'settings.pages.account.fluxBalance' : 'settings.pages.flux.description') }}
          </p>
        </div>
      </div>
    </div>

    <div v-if="!fluxPurchaseDisabled" :class="['flex flex-col gap-4']">
      <!-- Currency selector -->
      <Skeleton v-if="packagesLoading" :class="['h-9 w-40 rounded-lg']" />
      <div v-else-if="currencyOptions.length > 1" :class="['flex justify-start sm:justify-end']">
        <SelectTab
          v-model="selectedCurrency"
          size="sm"
          :options="currencyOptions"
        />
      </div>

      <div :class="['grid grid-cols-1 sm:grid-cols-3 gap-4']" :aria-busy="packagesLoading">
        <template v-if="packagesLoading">
          <div
            v-for="i in 3" :key="i"
            :class="[
              'flex flex-row sm:flex-col items-center justify-between sm:justify-center gap-4 sm:gap-3',
              'rounded-2xl p-6 bg-neutral-50 dark:bg-neutral-900',
            ]"
          >
            <div :class="['flex flex-col sm:items-center gap-2 w-full']">
              <Skeleton :class="['h-4 w-20 rounded-md']" />
              <Skeleton :class="['h-8 w-28 rounded-md']" />
            </div>
            <Skeleton :class="['h-8 w-16 rounded-lg sm:hidden']" />
          </div>
        </template>
        <button
          v-for="(pkg, index) in packages" :key="pkg.stripePriceId"
          :disabled="loadingPriceId !== null"
          :class="[
            'group relative flex flex-row sm:flex-col items-center justify-between sm:justify-center overflow-hidden text-left sm:text-center gap-4 sm:gap-2',
            'rounded-2xl p-6 transition-all duration-300 ease-out',
            // The badge marks the recommended package. A tinted fill sets it apart without a border.
            pkg.recommended ? 'bg-primary-50 dark:bg-primary-900/30 shadow-sm' : 'bg-neutral-50 dark:bg-neutral-900',
            'hover:-translate-y-1 hover:shadow-md active:translate-y-0 active:scale-[0.99]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
            loadingPriceId !== null && loadingPriceId !== pkg.stripePriceId ? 'opacity-50 grayscale-50 cursor-not-allowed' : 'cursor-pointer',
          ]"
          @click="handleBuy(pkg.stripePriceId)"
        >
          <!-- Recommended Badge -->
          <div
            v-if="pkg.recommended"
            class="absolute right-0 top-0 flex items-center gap-1 rounded-bl-xl bg-primary-500 px-2.5 py-1 text-[10px] text-white font-bold tracking-wider uppercase shadow-sm"
          >
            <div class="i-solar:star-fall-bold-duotone size-3" />
            HOT
          </div>

          <!-- Loading Overlay -->
          <div
            v-if="loadingPriceId === pkg.stripePriceId"
            class="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-sm dark:bg-neutral-900/60"
          >
            <div class="i-svg-spinners:90-ring-with-bg size-8 text-primary-500" />
          </div>

          <div :class="['flex flex-col sm:items-center gap-1 relative z-1 w-full']">
            <div :class="['text-sm text-neutral-500 dark:text-neutral-400 font-medium transition-colors group-hover:text-primary-600 dark:group-hover:text-primary-400']">
              {{ pkg.label }}
            </div>
            <div :class="['flex items-baseline justify-start sm:justify-center gap-1']">
              <span :class="['text-2xl text-neutral-800 dark:text-neutral-100 font-bold']">
                {{ pkg.currencies[selectedCurrency] ?? pkg.currencies[pkg.defaultCurrency] }}
              </span>
            </div>
          </div>

          <!-- Battery Icons (Mobile Only) -->
          <div :class="['flex items-center gap-1 relative z-1 text-primary-200 transition-colors dark:text-primary-800/60 group-hover:text-primary-300 sm:hidden dark:group-hover:text-primary-700']">
            <div
              v-for="i in Math.min(index + 1, 3)" :key="i"
              class="i-solar:battery-charge-bold-duotone size-8 sm:size-10"
            />
          </div>
        </button>
      </div>
    </div>

    <div v-if="!isAuthenticated" :class="['flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mt-auto pb-2 pt-6 text-xs text-neutral-500']">
      <a :class="['hover:text-primary-500']" :href="AIRI_TERMS_URL" target="_blank" rel="noreferrer">
        {{ t('settings.pages.flux.terms') }}
      </a>
      <a :class="['hover:text-primary-500']" :href="AIRI_PRIVACY_URL" target="_blank" rel="noreferrer">
        {{ t('settings.pages.flux.privacy') }}
      </a>
      <a :class="['hover:text-primary-500']" href="mailto:airi@moeru.ai">
        airi@moeru.ai
      </a>
    </div>
  </div>
</template>

<style scoped>
.flux-progress-bar {
  width: 100%;
  animation: flux-progress-bar-grow 1s cubic-bezier(0.4, 0, 0.2, 1) 0.5s forwards;
}

@keyframes flux-progress-bar-grow {
  0% {
    width: 100%;
    opacity: 0.5;
  }
  100% {
    width: v-bind('`${fluxPercentage}%`');
    opacity: 1;
  }
}
</style>

<route lang="yaml">
meta:
  layout: settings
  onboarding: false
  titleKey: settings.pages.flux.title
  icon: i-solar:battery-charge-bold-duotone
</route>
