<script setup lang="ts">
import type { PlanBillingPeriod, PlanPackage } from '@proj-airi/stage-ui/composables/use-subscription'

import { isFluxPurchaseDisabled } from '@proj-airi/stage-shared'
import { useSubscription } from '@proj-airi/stage-ui/composables/use-subscription'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { FieldCheckbox, SelectTab } from '@proj-airi/ui'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const authStore = useAuthStore()

const fluxPurchaseDisabled = isFluxPurchaseDisabled()

const plan = useSubscription({
  getUserId: () => authStore.user?.id ?? '',
  onChanged: () => authStore.updateCredits(),
})

const message = ref<{ type: 'success' | 'error', text: string } | null>(null)
const purchasingPackageId = ref<string | null>(null)
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

const currentSubscription = computed(() => plan.status.value?.subscriptions[0])

function tierRank(period: PlanBillingPeriod, amountMicros: number): number {
  return plan.packages.value
    .filter(pkg => pkg.period === period && pkg.amountMicros < amountMicros)
    .length
}

function planAction(pkg: PlanPackage): PlanAction {
  const current = currentSubscription.value
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

function planSummary(pkg: PlanPackage): string {
  const visible = visiblePackages.value
  const top = Math.max(...visible.map(item => item.amountMicros))
  const higher = visible.length > 1 && visible.filter(item => item.amountMicros === top).length === 1 && pkg.amountMicros === top
  return t(higher ? 'settings.pages.plan.plusSummary' : 'settings.pages.plan.goSummary')
}

const currentAllowance = computed(() => plan.status.value?.allowances[0])
const fallbackToFlux = computed({
  get: () => plan.status.value?.fallbackToFlux ?? false,
  set: value => void savePreference(value),
})

function planName(entitlementId: string | undefined): string {
  if (!entitlementId)
    return t('settings.pages.plan.noPlan')
  const key = `settings.pages.plan.plans.${entitlementId}`
  const resolved = t(key)
  return resolved === key ? entitlementId : resolved
}

const quotaPercentage = computed(() => {
  const allowance = currentAllowance.value
  if (!allowance || allowance.grantedAmount <= 0)
    return 0
  return Math.min(100, Math.round((allowance.remainingAmount / allowance.grantedAmount) * 100))
})

function formatDate(iso: string | null): string {
  if (!iso)
    return ''
  return new Date(iso).toLocaleString()
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat().format(num)
}

onMounted(async () => {
  try {
    await plan.fetchStatus()
  }
  catch {
    message.value = { type: 'error', text: t('settings.pages.plan.statusError') }
  }
  if (!fluxPurchaseDisabled) {
    await plan.fetchPackages().catch(() => {
      message.value = { type: 'error', text: t('settings.pages.plan.packagesError') }
    })
  }
  await plan.fetchManagementUrl()
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
  if (purchasingPackageId.value !== null)
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
  purchasingPackageId.value = packageId
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
  finally {
    purchasingPackageId.value = null
  }
}
</script>

<template>
  <div flex="~ col gap-6" p-4>
    <div
      v-if="message"
      rounded-lg p-3 text-sm
      :class="message.type === 'success'
        ? 'bg-green-500/10 text-green-600 dark:text-green-400'
        : 'bg-red-500/10 text-red-600 dark:text-red-400'"
    >
      {{ message.text }}
    </div>

    <!-- Current plan card -->
    <div relative overflow-hidden rounded-2xl bg="neutral-100 dark:neutral-800" p-6 sm:p-8>
      <div
        class="plan-progress-bar absolute inset-y-0 left-0 bg-primary-500/20 dark:bg-primary-400/20"
      />
      <div relative z-1 flex="~ items-center justify-start sm:col sm:justify-center gap-4 sm:gap-2" text-left sm:text-center>
        <div i-solar:crown-bold-duotone size-12 shrink-0 text-primary-500 sm:mx-auto sm:size-14 />
        <div flex="~ col gap-1">
          <h2 text-3xl font-bold tracking-tight sm:text-4xl>
            {{ planName(currentSubscription?.entitlementId) }}
          </h2>
          <p v-if="currentAllowance" text="sm neutral-500">
            {{ t('settings.pages.plan.creditsRemaining', { remaining: formatNumber(currentAllowance.remainingAmount), total: formatNumber(currentAllowance.grantedAmount) }) }}
          </p>
          <p v-else text="sm neutral-500">
            {{ t('settings.pages.plan.description') }}
          </p>
          <p v-if="currentSubscription?.expiresAt" text="xs neutral-400">
            {{ currentSubscription.status === 'cancelled'
              ? t('settings.pages.plan.expiresAt', { date: formatDate(currentSubscription.expiresAt) })
              : t('settings.pages.plan.renewsAt', { date: formatDate(currentSubscription.expiresAt) }) }}
          </p>
          <a
            v-if="plan.managementUrl.value"
            :href="plan.managementUrl.value"
            target="_blank"
            rel="noopener"
            text="xs primary-600 dark:primary-400" underline underline-offset-2
          >
            {{ t('settings.pages.plan.manageSubscription') }}
          </a>
        </div>
      </div>
    </div>

    <!-- Flux fallback preference -->
    <FieldCheckbox
      v-model="fallbackToFlux"
      :disabled="preferenceSaving || !currentSubscription"
      :label="t('settings.pages.plan.fallbackToFlux')"
      :description="t('settings.pages.plan.fallbackToFluxHint')"
    />

    <!-- Packages -->
    <div v-if="!fluxPurchaseDisabled && visiblePackages.length > 0" flex="~ col gap-4">
      <div v-if="periodOptions.length > 1" flex="~ justify-center">
        <SelectTab
          v-model="billingPeriod"
          :options="periodOptions"
          size="sm"
        />
      </div>
      <div grid="~ cols-1 sm:cols-2 gap-4">
        <button
          v-for="(pkg, index) in visiblePackages" :key="pkg.packageId"
          :disabled="planCardDisabled(pkg)"
          :class="[
            'group relative flex flex-row sm:flex-col items-center justify-between sm:justify-center overflow-hidden text-left sm:text-center gap-4 sm:gap-2',
            'rounded-2xl border-2 bg-white p-6 transition-all duration-300 ease-out',
            'border-neutral-200 dark:border-neutral-800',
            'dark:bg-neutral-900',
            'hover:-translate-y-1 hover:border-primary-400 hover:shadow-md dark:hover:border-primary-500',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
            purchasingPackageId !== null && purchasingPackageId !== pkg.packageId ? 'opacity-50 grayscale-50 cursor-not-allowed' : '',
            planCardDisabled(pkg) ? 'cursor-not-allowed' : 'cursor-pointer',
          ]"
          @click="handlePlan(pkg)"
        >
          <div
            v-if="purchasingPackageId === pkg.packageId"
            class="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-sm dark:bg-neutral-900/60"
          >
            <div class="i-svg-spinners:90-ring-with-bg size-8 text-primary-500" />
          </div>

          <div flex="~ col sm:items-center gap-1" relative z-1 w-full>
            <div text="sm neutral-500 dark:neutral-400" font-medium transition-colors class="group-hover:text-primary-600 dark:group-hover:text-primary-400">
              {{ pkg.title }}
            </div>
            <div text="xs neutral-400">
              {{ planSummary(pkg) }}
            </div>
            <div flex="~ items-baseline justify-start sm:justify-center gap-1">
              <span text="2xl neutral-800 dark:neutral-100" font-bold>
                {{ pkg.formattedPrice }}
              </span>
              <span text="sm neutral-400">
                {{ t(pkg.period === 'year' ? 'settings.pages.plan.perYear' : 'settings.pages.plan.perMonth') }}
              </span>
            </div>
            <div v-if="actionLabel(pkg)" text="xs primary-600 dark:primary-400" font-medium>
              {{ actionLabel(pkg) }}
            </div>
          </div>

          <div flex="~ items-center gap-1" relative z-1 class="text-primary-200 transition-colors dark:text-primary-800/60 group-hover:text-primary-300 sm:hidden dark:group-hover:text-primary-700">
            <div
              v-for="i in Math.min(index + 1, 2)" :key="i"
              class="i-solar:crown-bold-duotone size-8 sm:size-10"
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
  icon: i-solar:crown-bold-duotone
</route>
