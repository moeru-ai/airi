<script setup lang="ts">
import type { FluxBalanceBucket } from '@proj-airi/stage-ui/composables/use-analytics'

import { isCapacitorAvailable, isFluxPurchaseDisabled, isStageTamagotchi } from '@proj-airi/stage-shared'
import { client } from '@proj-airi/stage-ui/composables/api'
import { useAnalytics } from '@proj-airi/stage-ui/composables/use-analytics'
import { AIRI_PRIVACY_URL, AIRI_TERMS_URL } from '@proj-airi/stage-ui/constants/public-links'
import { isSigningIn } from '@proj-airi/stage-ui/libs/auth'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { Alert, Button, SelectTab, Skeleton } from '@proj-airi/ui'
import { until, useEventListener } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import CapacitorSection from '../../components/capacitor-section.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const { credits, isAuthenticated } = storeToRefs(authStore)
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

// NOTICE: Manual interface instead of hono InferResponseType because hono client
// type instantiation hits TS recursion limits ("excessively deep and possibly infinite").
// Keep this manual shape aligned with the API response.
interface AuditRecord {
  id: string
  type: string
  amount: number
  description: string
  metadata: Record<string, unknown> | null
  createdAt: string
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat().format(num)
}

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

/** Display amount with sign: debit is negative, credit/initial are positive */
function displayAmount(record: AuditRecord): string {
  const signed = record.type === 'debit' ? -record.amount : record.amount
  const formatted = formatNumber(Math.abs(signed))
  return signed >= 0 ? `+${formatted}` : `-${formatted}`
}

function isPositive(record: AuditRecord): boolean {
  return record.type !== 'debit'
}

// Lookup table avoids a chained ternary in the template (banned by CLAUDE.md
// naming/style rules). Unknown types fall back to typeInitial so older
// records without an explicit mapping still render something.
const TYPE_LABEL_KEY: Record<string, string> = {
  debit: 'settings.pages.flux.audit.typeConsumption',
  credit: 'settings.pages.flux.audit.typeAddition',
  initial: 'settings.pages.flux.audit.typeInitial',
  promo: 'settings.pages.flux.audit.typePromo',
}

function typeLabel(type: string): string {
  return t(TYPE_LABEL_KEY[type] ?? TYPE_LABEL_KEY.initial)
}

const auditRecords = ref<AuditRecord[]>([])
const auditLoading = ref(false)
const auditHasMore = ref(false)
const auditOffset = ref(0)
const AUDIT_PAGE_SIZE = 20

const capacity = ref(0)

async function fetchStats() {
  try {
    const res = await client.api.v1.flux.stats.$get()
    if (res.ok) {
      const data = await res.json()
      capacity.value = data.capacity
    }
  }
  catch {
    // silently fail
  }
}

async function fetchAuditHistory(loadMore = false) {
  auditLoading.value = true
  try {
    const offset = loadMore ? auditOffset.value : 0
    const res = await client.api.v1.flux.history.$get({
      query: { limit: String(AUDIT_PAGE_SIZE), offset: String(offset) },
    })
    if (res.ok) {
      const data = await res.json() as { records: AuditRecord[], hasMore: boolean }
      if (loadMore) {
        auditRecords.value.push(...data.records)
      }
      else {
        auditRecords.value = data.records
      }
      auditHasMore.value = data.hasMore
      auditOffset.value = offset + data.records.length
    }
  }
  catch {
    // silently fail
  }
  finally {
    auditLoading.value = false
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

// Group consecutive TTS debit records into collapsible rows
type GroupedRow = {
  type: 'single'
  record: AuditRecord
} | {
  type: 'group'
  key: string
  description: string
  model: string
  count: number
  totalAmount: number
  firstTime: string
  lastTime: string
  records: AuditRecord[]
}

const expandedGroups = ref<Set<string>>(new Set())

function toggleGroup(key: string) {
  if (expandedGroups.value.has(key))
    expandedGroups.value.delete(key)
  else
    expandedGroups.value.add(key)
}

const groupedRows = computed<GroupedRow[]>(() => {
  const rows: GroupedRow[] = []
  let i = 0
  const records = auditRecords.value

  while (i < records.length) {
    const record = records[i]
    if (record.type === 'debit' && record.description?.startsWith('tts:')) {
      // Collect consecutive TTS records with the same description
      const group: AuditRecord[] = [record]
      while (i + 1 < records.length
        && records[i + 1].type === 'debit'
        && records[i + 1].description === record.description) {
        i++
        group.push(records[i])
      }

      if (group.length > 1) {
        rows.push({
          type: 'group',
          key: `tts-group-${record.id}`,
          description: record.description,
          model: (record.metadata?.model as string) || '',
          count: group.length,
          totalAmount: group.reduce((sum, r) => sum + r.amount, 0),
          firstTime: group.at(-1)!.createdAt,
          lastTime: group[0].createdAt,
          records: group,
        })
      }
      else {
        rows.push({ type: 'single', record })
      }
    }
    else {
      rows.push({ type: 'single', record })
    }
    i++
  }

  return rows
})

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
    auditRecords.value = []
    auditHasMore.value = false
    auditOffset.value = 0
    return
  }

  await Promise.allSettled([
    authStore.updateCredits(),
    fetchStats(),
    fetchAuditHistory(),
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
  <div flex="~ col gap-6" min-h-full p-4>
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
            <span :class="['text-lg tabular-nums', 'text-neutral-900 dark:text-neutral-50']">{{ formatNumber(credits) }}</span>
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

    <!-- Audit History -->
    <div v-if="isAuthenticated" data-testid="flux-history" flex="~ col gap-3">
      <div flex="~ col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
        <h3 text-lg font-semibold>
          {{ t('settings.pages.flux.audit.title') }}
        </h3>
        <span text="xs neutral-400">
          {{ t('settings.pages.flux.audit.delayHint') }}
        </span>
      </div>

      <div v-if="auditLoading && auditRecords.length === 0" text="sm neutral-500" py-4 text-center>
        {{ t('settings.pages.flux.audit.loading') }}
      </div>

      <div v-else-if="auditRecords.length === 0" text="sm neutral-500" py-4 text-center>
        {{ t('settings.pages.flux.audit.empty') }}
      </div>

      <!-- Desktop: table -->
      <div v-else border="1 neutral-200 dark:neutral-800" overflow-x-auto rounded-xl hidden sm:block>
        <table w-full text-sm>
          <thead border="b neutral-200 dark:neutral-800">
            <tr>
              <th px-4 py-3 text-left font-medium>
                {{ t('settings.pages.flux.audit.time') }}
              </th>
              <th px-4 py-3 text-left font-medium>
                {{ t('settings.pages.flux.audit.type') }}
              </th>
              <th px-4 py-3 text-left font-medium>
                {{ t('settings.pages.flux.audit.detail') }}
              </th>
              <th px-4 py-3 text-right font-medium>
                {{ t('settings.pages.flux.audit.amount') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <template v-for="row in groupedRows" :key="row.type === 'single' ? row.record.id : row.key">
              <!-- Single record -->
              <tr
                v-if="row.type === 'single'"
                border="b neutral-100 dark:neutral-800/50 last:none"
              >
                <td whitespace-nowrap px-4 py-3 text="neutral-500">
                  {{ formatDate(row.record.createdAt) }}
                </td>
                <td px-4 py-3>
                  <span
                    inline-block rounded-full px-2 py-0.5 text-xs font-medium
                    :class="row.record.type === 'debit'
                      ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                      : 'bg-green-500/10 text-green-600 dark:text-green-400'"
                  >
                    {{ typeLabel(row.record.type) }}
                  </span>
                </td>
                <td px-4 py-3>
                  <span>{{ row.record.description }}</span>
                  <span
                    v-if="row.record.metadata?.promptTokens != null"
                    ml-1 text="xs neutral-400"
                  >
                    ({{ row.record.metadata.promptTokens }}+{{ row.record.metadata.completionTokens }} tokens)
                  </span>
                  <span
                    v-else-if="row.record.description?.startsWith('tts:') && row.record.metadata?.model"
                    ml-1 text="xs neutral-400"
                  >
                    ({{ row.record.metadata.model }})
                  </span>
                </td>
                <td px-4 py-3 text-right font-mono>
                  <span :class="isPositive(row.record) ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'">
                    {{ displayAmount(row.record) }}
                  </span>
                </td>
              </tr>

              <!-- Grouped TTS records -->
              <tr
                v-else
                :class="['cursor-pointer', 'hover:bg-neutral-50', 'dark:hover:bg-neutral-800/30']"
                border="b neutral-100 dark:neutral-800/50"
                @click="toggleGroup(row.key)"
              >
                <td whitespace-nowrap px-4 py-3 text="neutral-500">
                  {{ formatDate(row.lastTime) }}
                </td>
                <td px-4 py-3>
                  <span
                    :class="['inline-block', 'rounded-full', 'px-2', 'py-0.5', 'text-xs', 'font-medium',
                             'bg-orange-500/10', 'text-orange-600', 'dark:text-orange-400']"
                  >
                    {{ t('settings.pages.flux.audit.typeConsumption') }}
                  </span>
                </td>
                <td px-4 py-3>
                  <span flex="~ items-center gap-1">
                    <span
                      :class="expandedGroups.has(row.key) ? 'i-solar:alt-arrow-down-line-duotone' : 'i-solar:alt-arrow-right-line-duotone'"
                      inline-block size-4 text="neutral-400"
                    />
                    {{ row.description }}
                    <span ml-1 text="xs neutral-400">
                      ({{ row.count }} {{ t('settings.pages.flux.audit.ttsRequests') }})
                    </span>
                  </span>
                </td>
                <td px-4 py-3 text-right font-mono>
                  <span text="orange-600 dark:orange-400">
                    -{{ row.totalAmount }}
                  </span>
                </td>
              </tr>

              <!-- Expanded group children -->
              <tr
                v-for="child in (row.type === 'group' && expandedGroups.has(row.key) ? row.records : [])"
                :key="child.id"
                border="b neutral-100 dark:neutral-800/50 last:none" bg="neutral-50/50 dark:neutral-800/20"
              >
                <td whitespace-nowrap px-4 py-2 pl-8 text="xs neutral-400">
                  {{ formatDate(child.createdAt) }}
                </td>
                <td px-4 py-2 />
                <td px-4 py-2 text="xs neutral-400">
                  {{ child.description }}
                </td>
                <td px-4 py-2 text-right font-mono text="xs orange-500 dark:orange-400">
                  -{{ child.amount }}
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <!-- Mobile: card list -->
      <div v-if="auditRecords.length > 0" flex="~ col gap-2" sm:hidden>
        <template v-for="row in groupedRows" :key="row.type === 'single' ? row.record.id : row.key">
          <!-- Single record card -->
          <div
            v-if="row.type === 'single'"
            border="1 neutral-200 dark:neutral-800" flex="~ col gap-1.5" rounded-lg px-3 py-2.5
          >
            <div flex="~ items-center justify-between">
              <span
                inline-block rounded-full px-2 py-0.5 text-xs font-medium
                :class="row.record.type === 'debit'
                  ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                  : 'bg-green-500/10 text-green-600 dark:text-green-400'"
              >
                {{ typeLabel(row.record.type) }}
              </span>
              <span text-sm font-semibold font-mono :class="isPositive(row.record) ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'">
                {{ displayAmount(row.record) }}
              </span>
            </div>
            <div text="sm neutral-600 dark:neutral-300" truncate>
              {{ row.record.description }}
              <span
                v-if="row.record.metadata?.promptTokens != null"
                ml-1 text="xs neutral-400"
              >
                ({{ row.record.metadata.promptTokens }}+{{ row.record.metadata.completionTokens }} tokens)
              </span>
              <span
                v-else-if="row.record.description?.startsWith('tts:') && row.record.metadata?.model"
                ml-1 text="xs neutral-400"
              >
                ({{ row.record.metadata.model }})
              </span>
            </div>
            <div text="xs neutral-400">
              {{ formatDate(row.record.createdAt) }}
            </div>
          </div>

          <!-- Grouped TTS card -->
          <div
            v-else
            border="1 neutral-200 dark:neutral-800" flex="~ col gap-1.5" cursor-pointer rounded-lg px-3 py-2.5
            @click="toggleGroup(row.key)"
          >
            <div flex="~ items-center justify-between">
              <span
                :class="['inline-block', 'rounded-full', 'px-2', 'py-0.5', 'text-xs', 'font-medium',
                         'bg-orange-500/10', 'text-orange-600', 'dark:text-orange-400']"
              >
                {{ t('settings.pages.flux.audit.typeConsumption') }}
              </span>
              <span text-sm font-semibold font-mono text="orange-600 dark:orange-400">
                -{{ row.totalAmount }}
              </span>
            </div>
            <div flex="~ items-center gap-1" text="sm neutral-600 dark:neutral-300">
              <span
                :class="expandedGroups.has(row.key) ? 'i-solar:alt-arrow-down-line-duotone' : 'i-solar:alt-arrow-right-line-duotone'"
                inline-block size-4 text="neutral-400"
              />
              {{ row.description }}
              <span text="xs neutral-400">({{ row.count }} {{ t('settings.pages.flux.audit.ttsRequests') }})</span>
            </div>
            <div text="xs neutral-400">
              {{ formatDate(row.lastTime) }}
            </div>

            <!-- Expanded children -->
            <div v-if="row.type === 'group' && expandedGroups.has(row.key)" flex="~ col gap-1" mt-1 border="t neutral-200 dark:neutral-700" pt-2>
              <div
                v-for="child in row.records" :key="child.id"
                flex="~ items-center justify-between" text="xs neutral-400"
              >
                <span>{{ formatDate(child.createdAt) }}</span>
                <span font-mono>-{{ child.amount }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>

      <div v-if="auditHasMore" text-center>
        <Button
          :label="t('settings.pages.flux.audit.loadMore')"
          :loading="auditLoading"
          @click="fetchAuditHistory(true)"
        />
      </div>
    </div>

    <div v-if="!isAuthenticated" flex="~ wrap items-center justify-center gap-x-5 gap-y-2" mt-auto pb-2 pt-6 text="xs neutral-500">
      <a :href="AIRI_TERMS_URL" target="_blank" rel="noreferrer" hover:text-primary-500>
        {{ t('settings.pages.flux.terms') }}
      </a>
      <a :href="AIRI_PRIVACY_URL" target="_blank" rel="noreferrer" hover:text-primary-500>
        {{ t('settings.pages.flux.privacy') }}
      </a>
      <a href="mailto:airi@moeru.ai" hover:text-primary-500>
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
