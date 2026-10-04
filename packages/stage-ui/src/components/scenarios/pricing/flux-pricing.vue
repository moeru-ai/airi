<script setup lang="ts">
import { isStageTamagotchi } from '@proj-airi/stage-shared'
import { Button, SelectTab } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { client } from '../../../composables/api'
import { useAnalytics } from '../../../composables/use-analytics'
import { useAuthStore } from '../../../stores/auth'

const props = defineProps<{
  entrySurface: string
}>()

const { t } = useI18n()
const authStore = useAuthStore()
const { isAuthenticated } = storeToRefs(authStore)
const {
  trackCheckoutStarted,
  trackPlanSelected,
  trackPricingViewed,
  trackUpgradeClicked,
} = useAnalytics()

// NOTICE:
// The Hono client response type exceeds the TypeScript instantiation limit in this component.
// This shape matches GET /api/v1/stripe/packages in server/apps/api/src/routes/stripe.
// Remove it when the client can infer this response without a recursive type error.
interface FluxPackage {
  stripePriceId: string
  label: string
  defaultCurrency: string
  currencies: Record<string, string>
  recommended?: boolean
}

const packages = ref<FluxPackage[]>([])
const selectedCurrency = ref('usd')
const loading = ref(true)
const loadingPriceId = ref<string | null>(null)
const errorMessage = ref<string | null>(null)

const currencyOptions = computed(() => {
  const firstPackage = packages.value[0]
  if (!firstPackage)
    return []

  return Object.keys(firstPackage.currencies)
    .filter(currency => packages.value.every(pkg => currency in pkg.currencies))
    .map(currency => ({ label: currency.toUpperCase(), value: currency }))
})

function packagePrice(pkg: FluxPackage): string {
  return pkg.currencies[selectedCurrency.value] ?? pkg.currencies[pkg.defaultCurrency]
}

async function fetchPackages() {
  loading.value = true
  errorMessage.value = null

  try {
    const response = await client.api.v1.stripe.packages.$get()
    if (!response.ok) {
      errorMessage.value = t('settings.pages.flux.packagesError')
      return
    }

    const data = await response.json() as FluxPackage[]
    packages.value = data
    if (data.length > 0)
      selectedCurrency.value = data[0].defaultCurrency
  }
  catch {
    errorMessage.value = t('settings.pages.flux.packagesError')
  }
  finally {
    loading.value = false
  }
}

async function handlePackage(pkg: FluxPackage) {
  const currency = selectedCurrency.value
  errorMessage.value = null

  trackUpgradeClicked({
    source_page: props.entrySurface,
    current_plan: 'flux',
    trigger: 'manual_topup',
  })
  trackPlanSelected(pkg.stripePriceId, {
    currency,
    entry_surface: props.entrySurface,
  })

  if (!isAuthenticated.value) {
    await authStore.requestLogin()
    return
  }

  loadingPriceId.value = pkg.stripePriceId

  try {
    const response = await client.api.v1.stripe.checkout.$post({
      json: { stripePriceId: pkg.stripePriceId, currency },
    })
    if (!response.ok) {
      const data = await response.json() as { message?: string }
      errorMessage.value = data.message ?? t('settings.pages.flux.checkout.error')
      return
    }

    const data = await response.json()
    if (!data.url) {
      errorMessage.value = t('settings.pages.flux.checkout.error')
      return
    }

    trackCheckoutStarted(pkg.stripePriceId, {
      currency,
      entry_surface: props.entrySurface,
    })
    if (isStageTamagotchi())
      window.open(data.url, '_blank')
    else
      window.location.href = data.url
  }
  catch {
    errorMessage.value = t('settings.pages.flux.checkout.error')
  }
  finally {
    loadingPriceId.value = null
  }
}

onMounted(() => {
  trackPricingViewed(props.entrySurface, 'one_time')
  void fetchPackages()
})
</script>

<template>
  <section :aria-label="t('settings.pages.flux.packages.title')" :class="['flex flex-col gap-5']">
    <div v-if="currencyOptions.length > 1" :class="['flex justify-start sm:justify-end']">
      <SelectTab
        v-model="selectedCurrency"
        :options="currencyOptions"
        size="sm"
      />
    </div>

    <div
      v-if="errorMessage"
      role="alert"
      :class="[
        'rounded-xl px-4 py-3 text-sm',
        'bg-red-500/10 text-red-700 dark:text-red-300',
      ]"
    >
      {{ errorMessage }}
    </div>

    <div v-if="loading" :class="['grid grid-cols-1 gap-4 sm:grid-cols-3']" aria-busy="true">
      <div
        v-for="index in 3"
        :key="index"
        :class="[
          'h-56 animate-pulse rounded-2xl border-2',
          'border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900',
        ]"
      />
    </div>

    <div v-else-if="packages.length > 0" :class="['grid grid-cols-1 gap-4 sm:grid-cols-3']">
      <article
        v-for="pkg in packages"
        :key="pkg.stripePriceId"
        :class="[
          'relative flex min-h-56 flex-col overflow-hidden rounded-2xl border-2 p-6',
          'bg-white shadow-sm transition-all duration-300 ease-out dark:bg-neutral-900',
          pkg.recommended
            ? 'border-primary-400 dark:border-primary-500'
            : 'border-neutral-200 dark:border-neutral-800',
        ]"
      >
        <div
          v-if="pkg.recommended"
          :class="[
            'absolute right-0 top-0 flex items-center gap-1 rounded-bl-xl px-2.5 py-1',
            'bg-primary-500 text-[10px] text-white font-bold tracking-wider uppercase shadow-sm',
          ]"
        >
          <span :class="['i-solar:star-fall-bold-duotone size-3']" aria-hidden="true" />
          {{ t('settings.pages.flux.packages.recommended') }}
        </div>

        <div :class="['flex flex-1 flex-col']">
          <h2 :class="['text-sm text-neutral-600 font-medium dark:text-neutral-300']">
            {{ pkg.label }}
          </h2>
          <p :class="['mt-3 text-3xl text-neutral-900 font-bold tracking-tight dark:text-neutral-50']">
            {{ packagePrice(pkg) }}
          </p>
          <p :class="['mt-2 text-sm text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.pages.flux.packages.oneTime') }}
          </p>

          <Button
            :aria-label="t('settings.pages.flux.packages.packageAction', { action: isAuthenticated ? t('settings.pages.flux.packages.buy') : t('settings.pages.flux.packages.signInToBuy'), package: pkg.label, price: packagePrice(pkg) })"
            :class="['mt-6 w-full']"
            color="primary"
            variant="primary"
            :disabled="loadingPriceId !== null"
            :loading="loadingPriceId === pkg.stripePriceId"
            @click="handlePackage(pkg)"
          >
            {{ t(isAuthenticated ? 'settings.pages.flux.packages.buy' : 'settings.pages.flux.packages.signInToBuy') }}
          </Button>
        </div>
      </article>
    </div>

    <p v-else-if="!errorMessage" :class="['py-8 text-center text-sm text-neutral-500 dark:text-neutral-400']">
      {{ t('settings.pages.flux.packages.empty') }}
    </p>
  </section>
</template>
