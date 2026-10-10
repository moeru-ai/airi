<script setup lang="ts">
import type { CapacitorPackage } from '@proj-airi/stage-ui/composables/use-subscription'

import { isFluxPurchaseDisabled } from '@proj-airi/stage-shared'
import { useSubscription } from '@proj-airi/stage-ui/composables/use-subscription'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { Button, FieldCheckbox, Skeleton } from '@proj-airi/ui'
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

function capacitorAction(pkg: CapacitorPackage): CapacitorAction {
  const current = currentCapacitor.value
  if (!current)
    return 'buy'
  if (pkg.productId === current.productId)
    return 'current'
  const currentPackage = subscription.packages.value.find(item => item.productId === current.productId)
  return currentPackage && pkg.amountMicros < currentPackage.amountMicros ? 'downgrade' : 'upgrade'
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

const statusTitle = computed(() => {
  if (!hasCapacitor.value)
    return t('settings.pages.capacitor.noCapacitor')
  const productId = currentCapacitor.value?.productId
  return subscription.packages.value.find(item => item.productId === productId)?.name
    ?? t('settings.pages.capacitor.title')
})

function formatPercent(percent: number): string {
  return new Intl.NumberFormat(locale.value, { style: 'percent' }).format(percent / 100)
}

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
    message.value = {
      type: 'success',
      text: t(outcome === 'activated'
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

    <!-- Status: how much is left, when it recharges, what happens when it is empty -->
    <Skeleton v-if="statusLoading" :class="['h-44 rounded-2xl']" />
    <section v-else :class="['flex flex-col', 'rounded-2xl', 'bg-neutral-100 dark:bg-neutral-800']">
      <div :class="['flex flex-col gap-4', 'p-5 sm:p-6']">
        <div :class="['flex items-center justify-between gap-3']">
          <div :class="['min-w-0 flex items-center gap-2']">
            <div
              :class="[
                'i-solar:star-bold-duotone size-6 shrink-0',
                hasCapacitor ? 'text-primary-500' : 'text-neutral-400 dark:text-neutral-500',
              ]"
            />
            <h2 :class="['truncate text-lg font-semibold']">
              {{ statusTitle }}
            </h2>
          </div>
          <a
            v-if="subscription.managementUrl.value"
            :href="subscription.managementUrl.value"
            target="_blank"
            rel="noopener"
            :class="[
              'shrink-0 inline-flex items-center gap-1 py-1',
              'text-sm text-primary-600 font-medium dark:text-primary-400',
              'rounded-md hover:underline hover:underline-offset-2',
              'focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-2',
            ]"
          >
            {{ t('settings.pages.capacitor.manageSubscription') }}
            <div :class="['i-solar:arrow-right-up-linear size-4']" />
          </a>
        </div>

        <div v-if="capacitorPercent != null" :class="['flex flex-col gap-2']">
          <i18n-t
            keypath="settings.pages.capacitor.remaining"
            tag="p"
            scope="global"
            :class="['text-sm text-neutral-500 dark:text-neutral-400']"
          >
            <template #percent>
              <span :class="['text-4xl text-neutral-900 font-bold tracking-tight tabular-nums', 'dark:text-neutral-50']">
                {{ formatPercent(capacitorPercent) }}
              </span>
            </template>
          </i18n-t>
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
        <p v-else :class="['text-sm text-neutral-500 dark:text-neutral-400']">
          {{ t('settings.pages.capacitor.description') }}
        </p>

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
      </div>

      <div
        v-if="hasCapacitor"
        :class="['px-5 py-4 sm:px-6', 'border-t border-neutral-200 dark:border-neutral-700']"
      >
        <FieldCheckbox
          v-model="fallbackChoice"
          :disabled="preferenceSaving"
          :label="t('settings.pages.capacitor.fallbackToFlux')"
          :description="t('settings.pages.capacitor.fallbackToFluxHint')"
        />
      </div>
    </section>

    <!-- Packages: one explicit action for each Capacitor -->
    <section
      v-if="packagesLoading || subscription.packages.value.length > 0"
      :class="['flex flex-col gap-3']"
      :aria-busy="packagesLoading"
    >
      <h3 :class="['text-lg font-semibold']">
        {{ t('settings.pages.capacitor.available') }}
      </h3>
      <div :class="['grid grid-cols-1 gap-4', 'sm:grid-cols-2']">
        <template v-if="packagesLoading">
          <Skeleton v-for="i in 2" :key="i" :class="['h-32 rounded-2xl']" />
        </template>
        <template v-else>
          <div
            v-for="{ pkg, action } in packageCards" :key="pkg.packageId"
            :class="[
              'flex flex-col justify-between gap-4',
              'rounded-2xl border-2 p-5',
              'bg-white dark:bg-neutral-900',
              action === 'current'
                ? 'border-primary-400 dark:border-primary-500'
                : 'border-neutral-200 dark:border-neutral-800',
            ]"
          >
            <div :class="['flex flex-col gap-1']">
              <div v-if="pkg.name" :class="['text-base font-semibold']">
                {{ pkg.name }}
              </div>
              <div v-if="pkg.benefit" :class="['text-sm text-neutral-500 dark:text-neutral-400']">
                {{ pkg.benefit }}
              </div>
            </div>

            <div :class="['flex flex-wrap items-center justify-between gap-3']">
              <div :class="['flex items-baseline gap-1']">
                <span :class="['text-2xl text-neutral-800 font-bold tabular-nums', 'dark:text-neutral-100']">
                  {{ pkg.formattedPrice }}
                </span>
                <span :class="['text-sm text-neutral-400']">
                  {{ t('settings.pages.capacitor.perMonth') }}
                </span>
              </div>

              <span
                v-if="action === 'current'"
                :class="[
                  'inline-flex items-center gap-1 rounded-full px-3 py-1.5',
                  'text-xs font-medium',
                  'bg-primary-500/10 text-primary-600 dark:text-primary-300',
                ]"
              >
                <div :class="['i-solar:check-circle-bold size-4']" />
                {{ t('settings.pages.capacitor.currentPackage') }}
              </span>
              <Button
                v-else-if="action === 'buy'"
                variant="primary"
                color="primary"
                :label="t(ACTION_LABEL.buy)"
                :loading="subscription.purchasingPackageId.value === pkg.packageId"
                :disabled="actionDisabled(pkg)"
                @click="handleCapacitor(pkg)"
              />
              <Button
                v-else
                icon="i-solar:arrow-right-up-linear"
                :label="t(ACTION_LABEL[action])"
                :disabled="actionDisabled(pkg)"
                @click="handleCapacitor(pkg)"
              />
            </div>
          </div>
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
