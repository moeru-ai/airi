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
const selectedPriceId = ref<string | null>(null)
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

const selectedPackage = computed(() => {
  return packages.value.find(pkg => pkg.stripePriceId === selectedPriceId.value) ?? null
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
    if (data.length > 0) {
      selectedCurrency.value = data[0].defaultCurrency
      selectedPriceId.value = data.find(pkg => pkg.recommended)?.stripePriceId ?? data[0].stripePriceId
    }
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

    <div v-else-if="packages.length > 0" :class="['flex flex-col gap-6']">
      <div
        role="radiogroup"
        :aria-label="t('settings.pages.flux.packages.title')"
        :class="['grid grid-cols-1 gap-3 sm:grid-cols-3']"
      >
        <button
          v-for="pkg in packages"
          :key="pkg.stripePriceId"
          type="button"
          role="radio"
          :aria-checked="selectedPriceId === pkg.stripePriceId"
          :class="[
            'relative min-h-28 overflow-hidden rounded-xl border p-4 text-left',
            'bg-white transition-[border-color,background-color,box-shadow,transform] duration-200 ease-out',
            'focus-visible:outline-2 focus-visible:outline-primary-400 focus-visible:outline-offset-2',
            'active:scale-[0.99] dark:bg-neutral-900',
            selectedPriceId === pkg.stripePriceId
              ? 'border-primary-400 bg-primary-50/60 shadow-sm dark:border-primary-500 dark:bg-primary-950/20'
              : 'border-neutral-200 hover:border-primary-300 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:border-primary-700 dark:hover:bg-neutral-800/70',
          ]"
          @click="selectedPriceId = pkg.stripePriceId"
        >
          <div
            v-if="pkg.recommended"
            :class="[
              'absolute right-3 top-3 flex items-center gap-1 text-[10px] text-primary-600 font-semibold uppercase dark:text-primary-300',
            ]"
          >
            <span :class="['i-solar:star-fall-bold-duotone size-3']" aria-hidden="true" />
            {{ t('settings.pages.flux.packages.recommended') }}
          </div>

          <div :class="['flex flex-col']">
            <h2 :class="['text-sm text-neutral-600 font-medium dark:text-neutral-300']">
              {{ pkg.label }}
            </h2>
            <p :class="['mt-2 text-2xl text-neutral-900 font-bold tracking-tight tabular-nums dark:text-neutral-50']">
              {{ packagePrice(pkg) }}
            </p>
            <p :class="['mt-1 text-xs text-neutral-500 dark:text-neutral-400']">
              {{ t('settings.pages.flux.packages.oneTime') }}
            </p>
          </div>
          <span
            :class="[
              'absolute bottom-3 right-3 size-5 flex items-center justify-center rounded-full border',
              selectedPriceId === pkg.stripePriceId
                ? 'border-primary-500 bg-primary-500 text-white'
                : 'border-neutral-300 text-transparent dark:border-neutral-700',
            ]"
            aria-hidden="true"
          >
            <span :class="['i-solar:check-linear size-3.5']" />
          </span>
        </button>
      </div>

      <div
        v-if="selectedPackage"
        :class="[
          'flex flex-col gap-3 border-t border-neutral-200 pt-5',
          'sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800',
        ]"
      >
        <p :class="['text-sm text-neutral-600 dark:text-neutral-300']">
          {{ t('settings.pages.flux.packages.selected', { package: selectedPackage.label, price: packagePrice(selectedPackage) }) }}
        </p>
        <Button
          :aria-label="t('settings.pages.flux.packages.packageAction', { action: isAuthenticated ? t('settings.pages.flux.packages.buy') : t('settings.pages.flux.packages.signInToBuy'), package: selectedPackage.label, price: packagePrice(selectedPackage) })"
          :class="['w-full sm:w-auto sm:min-w-48']"
          color="primary"
          variant="primary"
          :disabled="loadingPriceId !== null"
          :loading="loadingPriceId === selectedPackage.stripePriceId"
          @click="handlePackage(selectedPackage)"
        >
          {{ t(isAuthenticated ? 'settings.pages.flux.packages.buySelected' : 'settings.pages.flux.packages.signInToContinue') }}
        </Button>
      </div>
    </div>

    <p v-else-if="!errorMessage" :class="['py-8 text-center text-sm text-neutral-500 dark:text-neutral-400']">
      {{ t('settings.pages.flux.packages.empty') }}
    </p>
  </section>
</template>
