<script setup lang="ts">
import { client } from '@proj-airi/stage-ui/composables/api'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { Button, SelectTab } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const { credits } = storeToRefs(authStore)

interface FluxPackage {
  stripePriceId: string
  label: string
  defaultCurrency: string
  currencies: Record<string, string>
  recommended?: boolean
}

const loadingPriceId = ref<string | null>(null)
const message = ref<{ type: 'success' | 'error', text: string } | null>(null)
const packages = ref<FluxPackage[]>([])
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
// Keep in sync with the route response shape in apps/server/src/routes/flux.ts
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

/** Display amount with sign: debit is negative, credit/initial are positive */
function displayAmount(record: AuditRecord): string {
  const signed = record.type === 'debit' ? -record.amount : record.amount
  const formatted = formatNumber(Math.abs(signed))
  return signed >= 0 ? `+${formatted}` : `-${formatted}`
}

function isPositive(record: AuditRecord): boolean {
  return record.type !== 'debit'
}

const auditRecords = ref<AuditRecord[]>([])
const auditLoading = ref(false)
const auditHasMore = ref(false)
const auditOffset = ref(0)
const AUDIT_PAGE_SIZE = 20

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
    message.value = { type: 'error', text: t('settings.pages.flux.packagesError') }
  }
}

onMounted(async () => {
  Promise.allSettled([fetchPackages(), authStore.updateCredits(), fetchStats(), fetchAuditHistory()])

  if (route.query.success === 'true') {
    message.value = { type: 'success', text: t('settings.pages.flux.checkout.success') }
    router.replace({ query: {} })
  }
  else if (route.query.canceled === 'true') {
    message.value = { type: 'error', text: t('settings.pages.flux.checkout.canceled') }
    router.replace({ query: {} })
  }
})

async function handleBuy(stripePriceId: string) {
  loadingPriceId.value = stripePriceId
  message.value = null
  try {
    const res = await client.api.v1.stripe.checkout.$post({ json: { stripePriceId, currency: selectedCurrency.value } })
    if (!res.ok) {
      const data = await res.json() as { error?: string, message?: string }
      message.value = { type: 'error', text: data.message || t('settings.pages.flux.checkout.error') }
      return
    }
    const data = await res.json()
    if (data.url) {
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
  <div flex="~ col gap-6" p-4>
    <!-- Message banner -->
    <div
      v-if="message"
      rounded-lg p-3 text-sm
      :class="message.type === 'success'
        ? 'bg-green-500/10 text-green-600 dark:text-green-400'
        : 'bg-red-500/10 text-red-600 dark:text-red-400'"
    >
      {{ message.text }}
    </div>

    <!-- Battery Card -->
    <div relative overflow-hidden rounded-2xl bg="neutral-100 dark:neutral-800" p-6 sm:p-8>
      <!-- Background Progress -->
      <div
        class="flux-progress-bar absolute inset-y-0 left-0 bg-primary-500/20 dark:bg-primary-400/20"
      />

      <!-- Content -->
      <div relative z-1 flex="~ items-center justify-start sm:col sm:justify-center gap-4 sm:gap-2" text-left sm:text-center>
        <div i-solar:battery-charge-bold-duotone size-12 shrink-0 text-primary-500 sm:mx-auto sm:size-14 />
        <div flex="~ col gap-1">
          <h2 text-3xl font-bold tracking-tight sm:text-4xl>
            {{ formatNumber(credits) }}
          </h2>
          <p text="sm neutral-500">
            {{ t('settings.pages.flux.description') }}
          </p>
        </div>
      </div>
    </div>

    <div flex="~ col gap-4">
      <!-- Currency selector -->
      <div v-if="currencyOptions.length > 1" flex="~ justify-start sm:justify-end">
        <SelectTab
          v-model="selectedCurrency"
          :options="currencyOptions"
          size="sm"
        />
      </div>

      <div grid="~ cols-1 sm:cols-3 gap-4">
        <button
          v-for="(pkg, index) in packages" :key="pkg.stripePriceId"
          :disabled="loadingPriceId !== null"
          :class="[
            'group relative flex flex-row sm:flex-col items-center justify-between sm:justify-center overflow-hidden text-left sm:text-center gap-4 sm:gap-2',
            'rounded-2xl border-2 bg-white p-6 transition-all duration-300 ease-out',
            pkg.recommended ? 'border-primary-400 dark:border-primary-500 shadow-sm' : 'border-neutral-200 dark:border-neutral-800',
            'dark:bg-neutral-900',
            'hover:-translate-y-1 hover:border-primary-400 hover:shadow-md dark:hover:border-primary-500',
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

          <div flex="~ col sm:items-center gap-1" relative z-1 w-full>
            <div text="sm neutral-500 dark:neutral-400" font-medium transition-colors class="group-hover:text-primary-600 dark:group-hover:text-primary-400">
              {{ pkg.label }}
            </div>
            <div flex="~ items-baseline justify-start sm:justify-center gap-1">
              <span text="2xl neutral-800 dark:neutral-100" font-bold>
                {{ pkg.currencies[selectedCurrency] ?? pkg.currencies[pkg.defaultCurrency] }}
              </span>
            </div>
          </div>

          <!-- Battery Icons (Mobile Only) -->
          <div flex="~ items-center gap-1" relative z-1 class="text-primary-200 transition-colors dark:text-primary-800/60 group-hover:text-primary-300 sm:hidden dark:group-hover:text-primary-700">
            <div
              v-for="i in Math.min(index + 1, 3)" :key="i"
              class="i-solar:battery-charge-bold-duotone size-8 sm:size-10"
            />
          </div>
        </button>
      </div>
    </div>

    <!-- Audit History -->
    <div flex="~ col gap-3">
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
                    {{ row.record.type === 'debit'
                      ? t('settings.pages.flux.audit.typeConsumption')
                      : row.record.type === 'credit'
                        ? t('settings.pages.flux.audit.typeAddition')
                        : t('settings.pages.flux.audit.typeInitial') }}
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
                {{ row.record.type === 'debit'
                  ? t('settings.pages.flux.audit.typeConsumption')
                  : row.record.type === 'credit'
                    ? t('settings.pages.flux.audit.typeAddition')
                    : t('settings.pages.flux.audit.typeInitial') }}
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
  titleKey: settings.pages.flux.title
  icon: i-solar:battery-charge-bold-duotone
</route>
