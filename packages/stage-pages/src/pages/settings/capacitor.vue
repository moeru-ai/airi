<script setup lang="ts">
import type { CapacitorPackage } from '@proj-airi/stage-ui/composables/use-subscription'

import { isFluxPurchaseDisabled } from '@proj-airi/stage-shared'
import { useSubscription } from '@proj-airi/stage-ui/composables/use-subscription'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { Alert, Button, FieldCheckbox, SettingsCard, Skeleton } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()
const authStore = useAuthStore()
const { capacitorPercent, capacitorRechargesAt, fallbackToFlux } = storeToRefs(authStore)

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
const quotaKey = computed(() => `settings.pages.capacitor.quota.${subscription.resetInterval.value ?? 'month'}`)

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

function formatPercent(percent: number): string {
  return new Intl.NumberFormat(locale.value, { style: 'percent' }).format(percent / 100)
}

const numberFormat = computed(() => new Intl.NumberFormat(locale.value))

function formatDate(iso: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale.value, options).format(new Date(iso))
}

let identityVersion = 0
onScopeDispose(() => identityVersion += 1)

watch(() => authStore.user?.id, async (userId, _previous, onCleanup) => {
  identityVersion += 1
  message.value = null
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
  if (fluxPurchaseDisabled)
    return
  await subscription.fetchPackages().catch(() => {
    if (active)
      message.value = { type: 'error', text: t('settings.pages.capacitor.packagesError') }
  })
  if (active)
    packagesLoading.value = false
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
    void handleSubscribe(pkg.packageId)
    return
  }
  const url = subscription.managementUrl.value
  if (url)
    window.open(url, '_blank', 'noopener')
}

async function handleSubscribe(packageId: string) {
  const version = identityVersion
  message.value = null
  try {
    const outcome = await subscription.purchaseCapacitor(packageId)
    if (version !== identityVersion)
      return
    if (outcome === 'cancelled') {
      message.value = { type: 'error', text: t('settings.pages.capacitor.checkout.canceled') }
      return
    }
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
  <div :class="['flex flex-col gap-6', 'p-4']">
    <Alert
      v-if="message"
      :tone="message.type === 'success' ? 'success' : 'danger'"
      live="polite"
    >
      {{ message.text }}
    </Alert>

    <!-- Status: how much is left today, when it refills, and when the subscription renews -->
    <Skeleton v-if="statusLoading" :class="['h-40 rounded-xl']" />
    <SettingsCard v-else-if="hasCapacitor">
      <div :class="['flex items-center justify-between gap-3']">
        <h2 :class="['min-w-0 flex items-center gap-2', 'text-base font-semibold']">
          <div :class="['i-solar:star-bold-duotone size-5 shrink-0', 'text-primary-500']" />
          <span :class="['truncate']">{{ currentPackage?.name ?? t('settings.pages.capacitor.title') }}</span>
        </h2>
        <a
          v-if="subscription.managementUrl.value"
          :href="subscription.managementUrl.value"
          target="_blank"
          rel="noopener"
          :class="[
            'shrink-0 inline-flex items-center gap-1 rounded-md',
            'text-sm text-primary-600 font-medium dark:text-primary-400',
            'hover:underline hover:underline-offset-2',
            'focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-2',
          ]"
        >
          {{ t('settings.pages.capacitor.manageSubscription') }}
          <div :class="['i-solar:arrow-right-up-linear size-4']" />
        </a>
      </div>

      <div v-if="capacitorPercent != null" :class="['flex flex-col gap-2']">
        <div :class="['flex flex-wrap items-baseline gap-x-2']">
          <i18n-t
            keypath="settings.pages.capacitor.remaining"
            tag="span"
            scope="global"
            :class="['text-sm text-neutral-500 dark:text-neutral-400']"
          >
            <template #percent>
              <span :class="['text-3xl text-neutral-900 font-bold tracking-tight tabular-nums', 'dark:text-neutral-50']">
                {{ formatPercent(capacitorPercent) }}
              </span>
            </template>
          </i18n-t>
          <span v-if="currentPackage" :class="['text-sm text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.pages.capacitor.ofQuota', { quota: numberFormat.format(currentPackage.quota) }) }}
          </span>
        </div>
        <div
          role="meter"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="capacitorPercent"
          :aria-label="t('settings.pages.capacitor.title')"
          :class="['h-2 overflow-hidden rounded-full', 'bg-neutral-200 dark:bg-neutral-700']"
        >
          <div
            :class="[
              'h-full rounded-full',
              'bg-primary-500 dark:bg-primary-400',
              'transition-width duration-500 ease-in-out motion-reduce:transition-none',
            ]"
            :style="{ width: `${capacitorPercent}%` }"
          />
        </div>
      </div>

      <div
        v-if="capacitorRechargesAt || currentCapacitor?.expiresAt"
        :class="['flex flex-wrap gap-x-5 gap-y-1', 'text-xs text-neutral-500 dark:text-neutral-400']"
      >
        <span v-if="capacitorRechargesAt" :class="['inline-flex items-center gap-1']">
          <div :class="['i-solar:restart-linear size-3.5']" />
          {{ t('settings.pages.capacitor.rechargesAt', { date: formatDate(capacitorRechargesAt, { dateStyle: 'medium', timeStyle: 'short' }) }) }}
        </span>
        <span v-if="currentCapacitor?.expiresAt" :class="['inline-flex items-center gap-1']">
          <div :class="['i-solar:calendar-linear size-3.5']" />
          {{ t(currentCapacitor.willRenew ? 'settings.pages.capacitor.renewsAt' : 'settings.pages.capacitor.expiresAt', { date: formatDate(currentCapacitor.expiresAt, { dateStyle: 'medium' }) }) }}
        </span>
      </div>

      <div :class="['pt-4', 'border-t border-neutral-200 dark:border-neutral-700']">
        <FieldCheckbox
          v-model="fallbackChoice"
          :disabled="preferenceSaving"
          :label="t('settings.pages.capacitor.fallbackToFlux')"
          :description="t('settings.pages.capacitor.fallbackToFluxHint')"
        />
      </div>
    </SettingsCard>

    <!-- Packages: what each Capacitor holds, how often it refills, and what it costs -->
    <section
      v-if="packagesLoading || subscription.packages.value.length > 0"
      :class="['flex flex-col gap-3']"
      :aria-busy="packagesLoading"
    >
      <h3 v-if="hasCapacitor" :class="['text-base font-semibold']">
        {{ t('settings.pages.capacitor.change') }}
      </h3>
      <div :class="['grid grid-cols-1 gap-4', 'sm:grid-cols-2']">
        <template v-if="packagesLoading">
          <Skeleton v-for="i in 2" :key="i" :class="['h-44 rounded-xl']" />
        </template>
        <template v-else>
          <SettingsCard
            v-for="{ pkg, action } in packageCards" :key="pkg.packageId"
            :class="[
              'justify-between',
              'outline-2 -outline-offset-2',
              action === 'current' ? 'outline outline-primary-400 dark:outline-primary-500' : 'outline-none',
            ]"
          >
            <div :class="['flex flex-col gap-1']">
              <div :class="['flex items-center justify-between gap-2']">
                <span :class="['text-sm text-neutral-600 font-semibold dark:text-neutral-300']">
                  {{ pkg.name ?? pkg.productId }}
                </span>
                <span
                  v-if="action === 'current'"
                  :class="[
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
                    'text-xs font-medium',
                    'bg-primary-500/10 text-primary-600 dark:text-primary-300',
                  ]"
                >
                  <div :class="['i-solar:check-circle-bold size-3.5']" />
                  {{ t('settings.pages.capacitor.currentPackage') }}
                </span>
              </div>
              <i18n-t :keypath="quotaKey" tag="p" scope="global" :class="['text-sm text-neutral-500 dark:text-neutral-400']">
                <template #quota>
                  <span :class="['text-2xl text-neutral-900 font-bold tabular-nums', 'dark:text-neutral-50']">
                    {{ numberFormat.format(pkg.quota) }}
                  </span>
                </template>
              </i18n-t>
              <p v-if="pkg.benefit" :class="['text-xs text-neutral-500 dark:text-neutral-400']">
                {{ pkg.benefit }}
              </p>
            </div>

            <div :class="['flex flex-wrap items-center justify-between gap-3']">
              <div :class="['flex items-baseline gap-1']">
                <span :class="['text-lg text-neutral-800 font-semibold tabular-nums', 'dark:text-neutral-100']">
                  {{ pkg.formattedPrice }}
                </span>
                <span :class="['text-sm text-neutral-400']">
                  {{ t('settings.pages.capacitor.perMonth') }}
                </span>
              </div>
              <Button
                v-if="action !== 'current'"
                :variant="action === 'downgrade' ? 'secondary' : 'primary'"
                :color="action === 'downgrade' ? 'neutral' : 'primary'"
                :icon="action === 'buy' ? undefined : 'i-solar:arrow-right-up-linear'"
                :label="t(ACTION_LABEL[action])"
                :loading="subscription.purchasingPackageId.value === pkg.packageId"
                :disabled="actionDisabled(pkg)"
                @click="handleCapacitor(pkg)"
              />
            </div>
          </SettingsCard>
        </template>
      </div>
    </section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.capacitor.title
  icon: i-solar:star-bold-duotone
</route>
