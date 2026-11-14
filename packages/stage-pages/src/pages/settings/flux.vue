<script setup lang="ts">
import type { FluxBalanceBucket } from '@proj-airi/stage-ui/composables/use-analytics'

import { isCapacitorAvailable, isFluxPurchaseDisabled, isStageTamagotchi } from '@proj-airi/stage-shared'
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
import { RouterLink, useRoute, useRouter } from 'vue-router'

import CapacitorSection from '../../components/capacitor-section.vue'

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
/** The page leads with the Capacitor subscription when this build can sell it. */
const subscriptionAvailable = isCapacitorAvailable()
const showCapacitor = computed(() => isAuthenticated.value && subscriptionAvailable)

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

    <!-- The subscription leads the page. The section opens on the Capacitor card. -->
    <CapacitorSection v-if="showCapacitor" data-testid="flux-subscription" />

    <!-- One-time Flux packs. A signed-in user also sees the balance of purchased Flux. -->
    <section
      v-if="!fluxPurchaseDisabled || isAuthenticated"
      data-testid="flux-purchase"
      :class="['flex flex-col gap-3.5']"
    >
      <div :class="['flex items-baseline justify-between gap-4']">
        <div>
          <h2 :class="['mb-1 text-xl']">
            {{ t(fluxPurchaseDisabled ? 'settings.pages.account.fluxBalance' : 'settings.pages.flux.packages.title') }}
          </h2>
          <p v-if="!fluxPurchaseDisabled" :class="['text-[13px]', 'text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.pages.flux.packages.description') }}
          </p>
        </div>
        <i18n-t
          v-if="isAuthenticated"
          keypath="settings.pages.flux.balance"
          tag="span"
          scope="global"
          data-testid="flux-balance"
          :class="['shrink-0 text-[13px]', 'text-neutral-500 dark:text-neutral-400']"
        >
          <template #balance>
            <span :class="['text-lg tabular-nums', 'text-neutral-900 dark:text-neutral-50']">{{ formattedCredits }}</span>
          </template>
        </i18n-t>
      </div>

      <div v-if="!fluxPurchaseDisabled" data-testid="flux-packages" :class="['flex flex-col gap-3']">
        <!-- Currency selector -->
        <Skeleton v-if="packagesLoading" :class="['h-9 w-40 rounded-lg']" />
        <div v-else-if="currencyOptions.length > 1" :class="['flex justify-start']">
          <SelectTab
            v-model="selectedCurrency"
            :options="currencyOptions"
            size="sm"
          />
        </div>

        <!-- The grid takes any number of packs. A row that is full starts the next row. -->
        <div :class="['grid grid-cols-[repeat(auto-fill,minmax(156px,1fr))] gap-2.5']" :aria-busy="packagesLoading">
          <template v-if="packagesLoading">
            <Skeleton v-for="i in 3" :key="i" :class="['h-17 rounded-xl']" />
          </template>
          <button
            v-for="pkg in packages" :key="pkg.stripePriceId"
            :disabled="loadingPriceId !== null"
            :class="[
              'relative flex flex-col items-start gap-0.5 overflow-hidden rounded-xl border-2 border-solid px-4 py-3 text-left',
              'transition-colors duration-200 ease-in-out',
              // The badge marks the recommended pack. A tinted fill sets it apart without a border.
              pkg.recommended
                ? 'border-transparent bg-primary-50 hover:bg-primary-100 dark:bg-primary-900/30 dark:hover:bg-primary-900/50'
                : 'border-neutral-100 bg-neutral-50 hover:bg-neutral-100 dark:border-neutral-900 dark:bg-neutral-900 dark:hover:bg-neutral-800',
              'focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-2',
              loadingPriceId !== null && loadingPriceId !== pkg.stripePriceId ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
            ]"
            @click="handleBuy(pkg.stripePriceId)"
          >
            <span
              v-if="pkg.recommended"
              :class="[
                'absolute right-0 top-0 flex items-center gap-1 rounded-bl-lg px-2 py-0.5',
                'bg-primary-500 text-[10px] text-white font-bold tracking-wider uppercase',
              ]"
            >
              <span aria-hidden="true" :class="['i-solar:star-fall-bold-duotone size-3']" />
              HOT
            </span>

            <span
              v-if="loadingPriceId === pkg.stripePriceId"
              :class="['absolute inset-0 z-10 flex items-center justify-center', 'bg-white/60 backdrop-blur-sm dark:bg-neutral-900/60']"
            >
              <span aria-hidden="true" :class="['i-svg-spinners:90-ring-with-bg size-6 text-primary-500']" />
            </span>

            <span :class="['text-[13px] tabular-nums', 'text-neutral-500 dark:text-neutral-400']">
              {{ pkg.label }}
            </span>
            <span :class="['text-lg tabular-nums', 'text-neutral-900 dark:text-neutral-50']">
              {{ pkg.currencies[selectedCurrency] ?? pkg.currencies[pkg.defaultCurrency] }}
            </span>
          </button>
        </div>
      </div>
    </section>

    <RouterLink
      v-if="isAuthenticated"
      to="/settings/usage"
      :class="[
        '-mx-2 flex min-h-10 items-center gap-2 rounded-md px-2 py-1.5',
        'text-sm text-inherit no-underline',
        'transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/40',
        'focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-2',
      ]"
    >
      <span :class="['text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.pages.flux.audit.title') }}
      </span>
      <span :class="['ml-auto flex items-center gap-1 text-primary-600 dark:text-primary-400']">
        {{ t('settings.pages.flux.usage.details') }}
        <span aria-hidden="true" :class="['i-solar:alt-arrow-right-linear size-4']" />
      </span>
    </RouterLink>

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

<route lang="yaml">
meta:
  layout: settings
  onboarding: false
  titleKey: settings.pages.flux.pageTitle
  icon: i-solar:star-bold-duotone
</route>
