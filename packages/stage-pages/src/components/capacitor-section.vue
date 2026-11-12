<script setup lang="ts">
import type { CapacitorPackage } from '@proj-airi/stage-ui/composables/use-subscription'

import type { CapacitorUsage } from './capacitor-usage'

import { isFluxPurchaseDisabled } from '@proj-airi/stage-shared'
import { client } from '@proj-airi/stage-ui/composables/api'
import { useAnalytics } from '@proj-airi/stage-ui/composables/use-analytics'
import { useSubscription } from '@proj-airi/stage-ui/composables/use-subscription'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { Alert, Button, FieldCheckbox, Skeleton } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import capacitorIcon from '../assets/capacitor.png'

import { capacitorCurve } from './capacitor-usage'

const { t, locale } = useI18n()
const authStore = useAuthStore()
const { capacitorPercent, capacitorRechargesAt, fallbackToFlux } = storeToRefs(authStore)
const { trackCheckoutStarted, trackPlanSelected, trackPricingViewed } = useAnalytics()

/** The funnel names this surface. The Flux page owns both the Capacitor and the Flux packages. */
const ENTRY_SURFACE = 'settings_flux'

const fluxPurchaseDisabled = isFluxPurchaseDisabled()

const subscription = useSubscription({
  getUserId: () => authStore.user?.id ?? '',
  onChanged: () => authStore.updateCredits(),
})

const message = ref<{ type: 'success' | 'error', text: string } | null>(null)
const preferenceSaving = ref(false)
const statusLoading = ref(false)
const packagesLoading = ref(false)

type CapacitorAction = 'buy' | 'current' | 'upgrade' | 'downgrade'

const currentCapacitor = computed(() => subscription.currentCapacitor.value)

/** The package of the current Capacitor. Null until packages load, or for a product that is no longer sold. */
const currentPackage = computed(() => {
  const productId = currentCapacitor.value?.productId
  return subscription.packages.value.find(item => item.productId === productId) ?? null
})

/** Without a reset interval, a Capacitor refills at its monthly renewal. */
const refillPeriod = computed(() => subscription.resetInterval.value ?? 'month')
const quotaKey = computed(() => `settings.pages.capacitor.quota.${refillPeriod.value}`)
const offerKey = computed(() => `settings.pages.capacitor.offer.${refillPeriod.value}`)

function capacitorAction(pkg: CapacitorPackage): CapacitorAction {
  const current = currentCapacitor.value
  if (!current)
    return 'buy'
  if (pkg.productId === current.productId)
    return 'current'
  return currentPackage.value && pkg.amountMicros < currentPackage.value.amountMicros ? 'downgrade' : 'upgrade'
}

const ACTION_LABEL: Record<Exclude<CapacitorAction, 'current'>, string> = {
  buy: 'settings.pages.capacitor.install',
  upgrade: 'settings.pages.capacitor.upgrade',
  downgrade: 'settings.pages.capacitor.downgrade',
}

const packageCards = computed(() => subscription.packages.value.map(pkg => ({ pkg, action: capacitorAction(pkg) })))

const fallbackChoice = computed({
  get: () => fallbackToFlux.value,
  set: value => void savePreference(value),
})

const hasCapacitor = computed(() => currentCapacitor.value !== null || capacitorPercent.value != null)

/** An empty Capacitor stops chat and speech unless purchased Flux can pay. */
const capacitorEmpty = computed(() => capacitorPercent.value === 0 && !fallbackToFlux.value)

const numberFormat = computed(() => new Intl.NumberFormat(locale.value))

function formatDate(date: string | Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale.value, options).format(new Date(date))
}

const DAY_MS = 24 * 60 * 60 * 1000

/** A time within a day reads as a time of day. A later time keeps its date. */
function formatMoment(date: string | Date): string {
  const soon = Math.abs(new Date(date).getTime() - Date.now()) < DAY_MS
  return formatDate(date, soon ? { timeStyle: 'short' } : { dateStyle: 'medium', timeStyle: 'short' })
}

/** The percent with its sign apart, so the card can draw the sign smaller. */
const percentParts = computed(() => new Intl.NumberFormat(locale.value, { style: 'percent' }).formatToParts((capacitorPercent.value ?? 0) / 100))
const percentLabel = computed(() => percentParts.value.map(part => part.value).join(''))

/**
 * The debits of the current refill window, and the time of the read.
 * Null until the read finishes, and after a failed read. The card then shows the percent as a plain fill.
 */
const usage = ref<{ window: CapacitorUsage, readAt: Date } | null>(null)

const curve = computed(() => usage.value === null || capacitorPercent.value == null
  ? null
  : capacitorCurve(usage.value.window, capacitorPercent.value, usage.value.readAt))

/** The labels under the curve: the start, the middle, and the end of the window. A day window shows times. */
const axisLabels = computed(() => {
  if (!curve.value)
    return []
  const { startedAt, endsAt } = curve.value
  const options: Intl.DateTimeFormatOptions = endsAt.getTime() - startedAt.getTime() <= 2 * DAY_MS
    ? { timeStyle: 'short' }
    : { month: 'short', day: 'numeric' }
  const middle = new Date((startedAt.getTime() + endsAt.getTime()) / 2)
  return [startedAt, middle, endsAt].map(date => formatDate(date, options))
})

const forecastLabel = computed(() => {
  const forecast = curve.value?.forecast
  if (!curve.value || !forecast)
    return null
  if (forecast.kind === 'empty')
    return t('settings.pages.capacitor.forecast.empty', { time: formatMoment(forecast.at) })
  return t('settings.pages.capacitor.forecast.left', {
    time: formatMoment(curve.value.endsAt),
    percent: new Intl.NumberFormat(locale.value, { style: 'percent' }).format(forecast.percent / 100),
  })
})

async function fetchUsage(isCurrent: () => boolean) {
  usage.value = null
  if (capacitorPercent.value == null)
    return
  // The curve is an addition to the percent. A failed read leaves the plain fill.
  const res = await client.api.v1.flux.capacitor.usage.$get().catch(() => null)
  if (!res?.ok || !isCurrent())
    return
  const data = await res.json()
  if (isCurrent())
    usage.value = { window: data, readAt: new Date() }
}

let identityVersion = 0
onScopeDispose(() => identityVersion += 1)

watch(() => authStore.user?.id, async (userId, _previous, onCleanup) => {
  identityVersion += 1
  message.value = null
  usage.value = null
  preferenceSaving.value = false
  statusLoading.value = Boolean(userId)
  packagesLoading.value = Boolean(userId) && !fluxPurchaseDisabled
  let active = true
  onCleanup(() => active = false)
  if (!userId)
    return
  try {
    await subscription.fetchStatus()
  }
  catch {
    if (active)
      message.value = { type: 'error', text: t('settings.pages.capacitor.statusError') }
  }
  if (!active)
    return
  statusLoading.value = false
  void fetchUsage(() => active)
  if (fluxPurchaseDisabled)
    return
  await subscription.fetchPackages().catch(() => {
    if (active)
      message.value = { type: 'error', text: t('settings.pages.capacitor.packagesError') }
  })
  if (!active)
    return
  packagesLoading.value = false
  // Funnel step 1 for the subscription: the user sees the monthly plans.
  if (subscription.packages.value.length > 0)
    trackPricingViewed(ENTRY_SURFACE, 'monthly')
}, { immediate: true, flush: 'sync' })

async function savePreference(value: boolean) {
  const version = identityVersion
  preferenceSaving.value = true
  try {
    await subscription.setFallbackToFlux(value)
  }
  catch {
    if (version === identityVersion)
      message.value = { type: 'error', text: t('settings.pages.capacitor.preferenceError') }
  }
  finally {
    if (version === identityVersion)
      preferenceSaving.value = false
  }
}

function actionDisabled(pkg: CapacitorPackage): boolean {
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
    trackPlanSelected(pkg.productId, { entry_surface: ENTRY_SURFACE })
    void handleSubscribe(pkg)
    return
  }
  const url = subscription.managementUrl.value
  if (url)
    window.open(url, '_blank', 'noopener')
}

async function handleSubscribe(pkg: CapacitorPackage) {
  const version = identityVersion
  message.value = null
  // The RevenueCat web checkout opens in the page. The webhook confirms the payment on the server.
  trackCheckoutStarted(pkg.productId, { entry_surface: ENTRY_SURFACE })
  try {
    const outcome = await subscription.purchaseCapacitor(pkg.packageId)
    if (version !== identityVersion)
      return
    if (outcome === 'cancelled') {
      message.value = { type: 'error', text: t('settings.pages.capacitor.checkout.canceled') }
      return
    }
    void fetchUsage(() => version === identityVersion)
    // RevenueCat reports the entitlement before the webhook charges the wallet.
    // The API reports a percent only after that charge.
    message.value = {
      type: 'success',
      text: t(outcome === 'activated' && capacitorPercent.value != null
        ? 'settings.pages.capacitor.checkout.success'
        : 'settings.pages.capacitor.checkout.pending'),
    }
  }
  catch {
    if (version === identityVersion)
      message.value = { type: 'error', text: t('settings.pages.capacitor.checkout.error') }
  }
}
</script>

<template>
  <section data-testid="capacitor-section" :class="['flex flex-col gap-6']">
    <Alert
      v-if="message"
      :tone="message.type === 'success' ? 'success' : 'danger'"
      live="polite"
    >
      {{ message.text }}
    </Alert>

    <Skeleton v-if="statusLoading" :class="['h-40 rounded-2xl']" />

    <!-- With a Capacitor: how much is left, when it refills, and when the subscription renews. -->
    <template v-else-if="hasCapacitor">
      <!-- The fill of the card is the Capacitor. With the usage of the window, its top edge is the curve of that window. -->
      <div
        data-testid="capacitor-hero"
        :class="[
          'relative overflow-hidden rounded-2xl',
          'bg-neutral-100 dark:bg-neutral-800',
          curve ? 'h-72' : '',
        ]"
      >
        <template v-if="curve">
          <svg
            data-testid="capacitor-curve"
            viewBox="0 0 1000 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            :class="['absolute inset-0 size-full']"
          >
            <path :d="curve.area" :class="['fill-primary-500/20 dark:fill-primary-400/20']" />
            <path
              v-if="curve.projection"
              :d="curve.projection"
              fill="none"
              stroke-width="1.5"
              stroke-dasharray="4 5"
              stroke-linecap="round"
              vector-effect="non-scaling-stroke"
              :class="['stroke-primary-400 dark:stroke-primary-500']"
            />
            <path
              :d="curve.line"
              fill="none"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              vector-effect="non-scaling-stroke"
              :class="['stroke-primary-500 dark:stroke-primary-400']"
            />
          </svg>
          <span
            aria-hidden="true"
            :style="{ left: `${curve.now.x / 10}%`, top: `${curve.now.y}%` }"
            :class="[
              'absolute size-2.5 rounded-full -translate-x-1/2 -translate-y-1/2',
              'bg-white ring-2 ring-primary-500 dark:bg-neutral-900 dark:ring-primary-400',
            ]"
          />
          <p
            v-if="forecastLabel"
            data-testid="capacitor-forecast"
            :class="[
              // A narrow card has no room for the forecast beside the curve.
              'absolute right-6 top-4 hidden max-w-[60%] text-right text-sm sm:block',
              'text-neutral-600 dark:text-neutral-300',
            ]"
          >
            {{ forecastLabel }}
          </p>
          <div
            aria-hidden="true"
            :class="[
              'absolute inset-x-6 bottom-3 flex justify-between text-xs tabular-nums',
              'text-neutral-500 dark:text-neutral-400',
            ]"
          >
            <span v-for="(label, index) in axisLabels" :key="index">{{ label }}</span>
          </div>
        </template>
        <!-- Without the usage of the window, the fill is a plain bar of the percent. -->
        <span
          v-else
          aria-hidden="true"
          :style="{ width: `${capacitorPercent ?? 0}%` }"
          :class="[
            'absolute inset-y-0 left-0 transition-[width] duration-500 ease-out motion-reduce:transition-none',
            'bg-primary-500/20 dark:bg-primary-400/20',
          ]"
        />

        <div :class="[curve ? 'absolute bottom-10 left-7 right-7' : 'relative p-7', 'flex flex-col items-start']">
          <img :src="capacitorIcon" alt="" :class="['mb-3.5 size-14']">
          <div :class="['max-w-full truncate text-xs tracking-widest font-mono uppercase', 'text-neutral-500 dark:text-neutral-400']">
            {{ currentPackage?.name ?? t('settings.pages.capacitor.name') }}
          </div>
          <div
            data-testid="capacitor-percent"
            :aria-label="t('settings.pages.capacitor.left', { percent: percentLabel })"
            :class="['mt-1.5 text-6xl font-light leading-none tracking-tight tabular-nums']"
          >
            <span
              v-for="(part, index) in percentParts" :key="index"
              aria-hidden="true"
              :class="[part.type === 'integer' ? '' : 'text-2xl text-neutral-500 dark:text-neutral-400']"
            >{{ part.value }}</span>
          </div>
          <div
            :class="[
              'mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px]',
              'text-neutral-600 dark:text-neutral-300',
            ]"
          >
            <span v-if="capacitorRechargesAt" :class="['inline-flex items-center gap-1']">
              <span aria-hidden="true" :class="['i-solar:refresh-linear size-3.5']" />
              {{ t('settings.pages.capacitor.rechargesAt', { date: formatMoment(capacitorRechargesAt) }) }}
            </span>
            <span v-if="currentCapacitor?.expiresAt" :class="['inline-flex items-center gap-1']">
              <span aria-hidden="true" :class="['i-solar:calendar-linear size-3.5']" />
              {{ t(currentCapacitor.willRenew ? 'settings.pages.capacitor.renewsAt' : 'settings.pages.capacitor.expiresAt', { date: formatDate(currentCapacitor.expiresAt, { dateStyle: 'medium' }) }) }}
            </span>
            <a
              v-if="subscription.managementUrl.value"
              :href="subscription.managementUrl.value"
              target="_blank"
              rel="noopener"
              :class="[
                'inline-flex items-center gap-0.5 rounded-md',
                'text-primary-600 dark:text-primary-400',
                'hover:underline hover:underline-offset-2',
                'focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-2',
              ]"
            >
              {{ t('settings.pages.capacitor.manageSubscription') }}
              <span aria-hidden="true" :class="['i-solar:arrow-right-up-linear size-3.5']" />
            </a>
          </div>
        </div>
      </div>

      <Alert v-if="capacitorEmpty" tone="warning">
        {{ t('settings.pages.capacitor.empty') }}
      </Alert>

      <div
        :class="[
          'rounded-xl border-2 border-solid px-4.5 py-3.5',
          'border-neutral-100 bg-neutral-50 dark:border-neutral-900 dark:bg-neutral-900',
        ]"
      >
        <FieldCheckbox
          v-model="fallbackChoice"
          :disabled="preferenceSaving"
          :label="t('settings.pages.capacitor.fallbackToFlux')"
          :description="t('settings.pages.capacitor.fallbackToFluxHint')"
        />
      </div>
    </template>

    <!-- Without a Capacitor: say what a subscription gives, before the packages. -->
    <div
      v-else
      data-testid="capacitor-offer"
      :class="['flex flex-col items-start rounded-2xl px-8 py-7', 'bg-neutral-100 dark:bg-neutral-800']"
    >
      <img :src="capacitorIcon" alt="" :class="['mb-3.5 size-14']">
      <div :class="['text-xs tracking-widest', 'text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.pages.capacitor.offer.none') }}
      </div>
      <h2 :class="['mb-1.5 mt-2 text-[22px] leading-snug']">
        {{ t(offerKey) }}
      </h2>
      <p :class="['text-[13px]', 'text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.pages.capacitor.offer.hint') }}
      </p>
    </div>

    <!-- Packages: what each Capacitor holds, how often it refills, and what it costs -->
    <section
      v-if="packagesLoading || subscription.packages.value.length > 0"
      data-testid="capacitor-packages"
      :class="['flex flex-col gap-3.5']"
      :aria-busy="packagesLoading"
    >
      <div>
        <h2 :class="['mb-1 text-xl']">
          {{ t(hasCapacitor ? 'settings.pages.capacitor.change' : 'settings.pages.capacitor.choose') }}
        </h2>
        <p :class="['text-[13px]', 'text-neutral-500 dark:text-neutral-400']">
          {{ t('settings.pages.capacitor.packagesHint') }}
        </p>
      </div>
      <div :class="['grid grid-cols-1 gap-3.5', 'sm:grid-cols-3']">
        <template v-if="packagesLoading">
          <Skeleton v-for="i in 3" :key="i" :class="['h-36 rounded-xl']" />
        </template>
        <template v-else>
          <div
            v-for="{ pkg, action } in packageCards" :key="pkg.packageId"
            :class="[
              'flex flex-col gap-1 rounded-xl border-2 border-solid px-5 py-4.5',
              // The tinted fill and the badge show the current Capacitor, so its card hides the border.
              action === 'current'
                ? 'border-transparent bg-primary-50 dark:bg-primary-900/20'
                : 'border-neutral-100 bg-white dark:border-neutral-900 dark:bg-neutral-900/20',
            ]"
          >
            <div :class="['min-h-6 flex items-center justify-between gap-2']">
              <span :class="['truncate text-xs tracking-widest font-mono uppercase', 'text-neutral-500 dark:text-neutral-400']">
                {{ pkg.name ?? pkg.productId }}
              </span>
              <span
                v-if="action === 'current'"
                :class="[
                  'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs',
                  'bg-primary-100 text-primary-700 dark:bg-primary-900/60 dark:text-primary-200',
                ]"
              >
                <span aria-hidden="true" :class="['i-solar:check-circle-bold size-3.5']" />
                {{ t('settings.pages.capacitor.currentPackage') }}
              </span>
            </div>
            <i18n-t :keypath="quotaKey" tag="p" scope="global" :class="['text-[13px]', 'text-neutral-500 dark:text-neutral-400']">
              <template #quota>
                <span :class="['text-[32px] leading-tight tabular-nums', 'text-neutral-900 dark:text-neutral-50']">{{ numberFormat.format(pkg.quota) }}</span>
              </template>
            </i18n-t>
            <p v-if="pkg.benefit" :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">
              {{ pkg.benefit }}
            </p>

            <div :class="['mt-auto min-h-13 flex flex-wrap items-end justify-between gap-3 pt-3.5']">
              <div :class="['flex items-baseline gap-1']">
                <span :class="['text-lg tabular-nums', 'text-neutral-800 dark:text-neutral-100']">
                  {{ pkg.formattedPrice }}
                </span>
                <span :class="['text-[13px] text-neutral-400']">
                  {{ t('settings.pages.capacitor.perMonth') }}
                </span>
              </div>
              <Button
                v-if="action !== 'current'"
                :variant="action === 'downgrade' ? 'secondary' : 'primary'"
                :color="action === 'downgrade' ? 'neutral' : 'primary'"
                :icon="action === 'buy' ? undefined : 'i-solar:arrow-right-up-linear'"
                :label="t(ACTION_LABEL[action], { name: pkg.name ?? pkg.productId })"
                :loading="subscription.purchasingPackageId.value === pkg.packageId"
                :disabled="actionDisabled(pkg)"
                @click="handleCapacitor(pkg)"
              />
            </div>
          </div>
        </template>
      </div>
    </section>
  </section>
</template>
