<script setup lang="ts">
import type { PlanBillingPeriod, PlanPackage } from '@proj-airi/stage-ui/composables/use-subscription'

import { isFluxPurchaseDisabled } from '@proj-airi/stage-shared'
import { useSubscription } from '@proj-airi/stage-ui/composables/use-subscription'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { FieldCheckbox, SelectTab } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const authStore = useAuthStore()
const { planRemaining, fallbackToFlux } = storeToRefs(authStore)

const fluxPurchaseDisabled = isFluxPurchaseDisabled()

const plan = useSubscription({
  getUserId: () => authStore.user?.id ?? '',
  onChanged: () => authStore.updateCredits(),
})

const message = ref<{ type: 'success' | 'error', text: string } | null>(null)
const preferenceSaving = ref(false)
const billingPeriod = ref<PlanBillingPeriod>('month')

type PlanAction = 'buy' | 'current' | 'upgrade' | 'downgrade' | 'switchYear' | 'switchMonth'

const periodOptions = computed(() => {
  const periods = new Set(plan.packages.value.map(pkg => pkg.period))
  return (['month', 'year'] as const)
    .filter(period => periods.has(period))
    .map(period => ({ label: t(`settings.pages.plan.period.${period}`), value: period }))
})

watch(periodOptions, (options) => {
  if (options.length > 0 && !options.some(option => option.value === billingPeriod.value))
    billingPeriod.value = options[0].value
})

const visiblePackages = computed(() =>
  plan.packages.value.filter(pkg => pkg.period === billingPeriod.value),
)

const currentPlan = computed(() => plan.currentPlan.value)

function tierRank(period: PlanBillingPeriod, amountMicros: number): number {
  return plan.packages.value
    .filter(pkg => pkg.period === period && pkg.amountMicros < amountMicros)
    .length
}

function planAction(pkg: PlanPackage): PlanAction {
  const current = currentPlan.value
  if (!current)
    return 'buy'
  if (pkg.productId === current.productId)
    return 'current'
  const currentPackage = plan.packages.value.find(item => item.productId === current.productId)
  if (!currentPackage)
    return pkg.period === 'year' ? 'switchYear' : 'switchMonth'
  const currentRank = tierRank(currentPackage.period, currentPackage.amountMicros)
  const nextRank = tierRank(pkg.period, pkg.amountMicros)
  if (nextRank > currentRank)
    return 'upgrade'
  if (nextRank < currentRank)
    return 'downgrade'
  return pkg.period === 'year' ? 'switchYear' : 'switchMonth'
}

const ACTION_LABEL: Record<Exclude<PlanAction, 'buy'>, string> = {
  current: 'settings.pages.plan.currentPackage',
  upgrade: 'settings.pages.plan.upgrade',
  downgrade: 'settings.pages.plan.downgrade',
  switchYear: 'settings.pages.plan.switchToYear',
  switchMonth: 'settings.pages.plan.switchToMonth',
}

function actionLabel(pkg: PlanPackage): string {
  const action = planAction(pkg)
  if (action === 'buy')
    return ''
  return t(ACTION_LABEL[action])
}

const fallbackChoice = computed({
  get: () => fallbackToFlux.value,
  set: value => void savePreference(value),
})

const currentPlanName = computed(() => {
  const current = currentPlan.value
  if (!current)
    return t('settings.pages.plan.noPlan')
  return plan.packages.value.find(item => item.productId === current.productId)?.name ?? ''
})

const quotaPercentage = computed(() => planRemaining.value ?? 0)

function formatDate(iso: string | null): string {
  if (!iso)
    return ''
  return new Date(iso).toLocaleString()
}

onMounted(async () => {
  await plan.fetchStatus()
  if (!fluxPurchaseDisabled) {
    await plan.fetchPackages().catch(() => {
      message.value = { type: 'error', text: t('settings.pages.plan.packagesError') }
    })
  }
})

async function savePreference(value: boolean) {
  preferenceSaving.value = true
  try {
    await plan.setFallbackToFlux(value)
  }
  catch {
    message.value = { type: 'error', text: t('settings.pages.plan.preferenceError') }
  }
  finally {
    preferenceSaving.value = false
  }
}

function planCardDisabled(pkg: PlanPackage): boolean {
  if (plan.purchasingPackageId.value !== null)
    return true
  const action = planAction(pkg)
  return action === 'current' || (action !== 'buy' && !plan.managementUrl.value)
}

function handlePlan(pkg: PlanPackage) {
  const action = planAction(pkg)
  if (action === 'current')
    return
  if (action === 'buy') {
    void handleSubscribe(pkg.packageId)
    return
  }
  const url = plan.managementUrl.value
  if (url)
    window.open(url, '_blank', 'noopener')
}

async function handleSubscribe(packageId: string) {
  message.value = null
  try {
    const outcome = await plan.purchasePlan(packageId)
    if (outcome === 'cancelled') {
      message.value = { type: 'error', text: t('settings.pages.plan.checkout.canceled') }
      return
    }
    message.value = {
      type: 'success',
      text: t(outcome === 'activated'
        ? 'settings.pages.plan.checkout.success'
        : 'settings.pages.plan.checkout.pending'),
    }
  }
  catch {
    message.value = { type: 'error', text: t('settings.pages.plan.checkout.error') }
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

    <!-- Current plan card -->
    <div :class="['relative overflow-hidden rounded-2xl', 'bg-neutral-100 p-6 sm:p-8 dark:bg-neutral-800']">
      <div
        :class="['plan-progress-bar absolute inset-y-0 left-0', 'bg-primary-500/20 dark:bg-primary-400/20']"
      />
      <div :class="['relative z-1 flex items-center justify-start gap-4 text-left', 'sm:flex-col sm:justify-center sm:gap-2 sm:text-center']">
        <div :class="['i-solar:star-bold-duotone size-12 shrink-0 text-primary-500', 'sm:mx-auto sm:size-14']" />
        <div :class="['flex flex-col gap-1']">
          <h2 v-if="currentPlanName" :class="['text-3xl font-bold tracking-tight', 'sm:text-4xl']">
            {{ currentPlanName }}
          </h2>
          <p v-if="planRemaining != null" :class="['text-sm text-neutral-500']">
            {{ t('settings.pages.plan.creditsRemaining', { percent: planRemaining }) }}
          </p>
          <p v-else :class="['text-sm text-neutral-500']">
            {{ t('settings.pages.plan.description') }}
          </p>
          <p v-if="currentPlan?.expiresAt" :class="['text-xs text-neutral-400']">
            {{ currentPlan.willRenew
              ? t('settings.pages.plan.renewsAt', { date: formatDate(currentPlan.expiresAt) })
              : t('settings.pages.plan.expiresAt', { date: formatDate(currentPlan.expiresAt) }) }}
          </p>
          <a
            v-if="plan.managementUrl.value"
            :href="plan.managementUrl.value"
            target="_blank"
            rel="noopener"
            :class="['text-xs text-primary-600 underline underline-offset-2', 'dark:text-primary-400']"
          >
            {{ t('settings.pages.plan.manageSubscription') }}
          </a>
        </div>
      </div>
    </div>

    <!-- Flux fallback preference -->
    <FieldCheckbox
      v-model="fallbackChoice"
      :disabled="preferenceSaving || !currentPlan"
      :label="t('settings.pages.plan.fallbackToFlux')"
      :description="t('settings.pages.plan.fallbackToFluxHint')"
    />

    <!-- Packages -->
    <div v-if="!fluxPurchaseDisabled && visiblePackages.length > 0" :class="['flex flex-col gap-4']">
      <div v-if="periodOptions.length > 1" :class="['flex justify-center']">
        <SelectTab
          v-model="billingPeriod"
          :options="periodOptions"
          size="sm"
        />
      </div>
      <div :class="['grid grid-cols-1 gap-4', 'sm:grid-cols-2']">
        <button
          v-for="(pkg, index) in visiblePackages" :key="pkg.packageId"
          :disabled="planCardDisabled(pkg)"
          :class="[
            'group relative flex flex-row items-center justify-between gap-4 overflow-hidden text-left',
            'sm:flex-col sm:items-center sm:justify-center sm:gap-2 sm:text-center',
            'rounded-2xl border-2 bg-white p-6',
            'border-neutral-200 dark:border-neutral-800 dark:bg-neutral-900',
            'transition-all duration-300 ease-out',
            'hover:-translate-y-1 hover:border-primary-400 hover:shadow-md dark:hover:border-primary-500',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
            plan.purchasingPackageId.value !== null && plan.purchasingPackageId.value !== pkg.packageId ? 'opacity-50 grayscale-50 cursor-not-allowed' : '',
            planCardDisabled(pkg) ? 'cursor-not-allowed' : 'cursor-pointer',
          ]"
          @click="handlePlan(pkg)"
        >
          <div
            v-if="plan.purchasingPackageId.value === pkg.packageId"
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
                {{ t(pkg.period === 'year' ? 'settings.pages.plan.perYear' : 'settings.pages.plan.perMonth') }}
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
.plan-progress-bar {
  width: 100%;
  animation: plan-progress-bar-grow 1s cubic-bezier(0.4, 0, 0.2, 1) 0.5s forwards;
}

@keyframes plan-progress-bar-grow {
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
  titleKey: settings.pages.plan.title
  icon: i-solar:star-bold-duotone
</route>
