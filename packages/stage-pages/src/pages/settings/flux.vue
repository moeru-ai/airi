<script setup lang="ts">
import { client } from '@proj-airi/stage-ui/composables/api'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { Button } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const { credits } = storeToRefs(authStore)

const loadingAmount = ref<number | null>(null)
const message = ref<{ type: 'success' | 'error', text: string } | null>(null)
const packages = ref<{ amount: number, label: string, price: string }[]>([])

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

/** Display amount with sign: debit is negative, credit/initial are positive */
function displayAmount(record: AuditRecord): string {
  const signed = record.type === 'debit' ? -record.amount : record.amount
  return signed >= 0 ? `+${signed}` : String(signed)
}

function isPositive(record: AuditRecord): boolean {
  return record.type !== 'debit'
}

const auditRecords = ref<AuditRecord[]>([])
const auditLoading = ref(false)
const auditHasMore = ref(false)
const auditOffset = ref(0)
const AUDIT_PAGE_SIZE = 20

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

async function fetchPackages() {
  try {
    const res = await client.api.v1.stripe.packages.$get()
    if (res.ok)
      packages.value = await res.json() as { amount: number, label: string, price: string }[]
  }
  catch {
    message.value = { type: 'error', text: t('settings.pages.flux.packagesError') }
  }
}

onMounted(async () => {
  Promise.allSettled([fetchPackages(), authStore.updateCredits(), fetchAuditHistory()])

  if (route.query.success === 'true') {
    message.value = { type: 'success', text: t('settings.pages.flux.checkout.success') }
    router.replace({ query: {} })
  }
  else if (route.query.canceled === 'true') {
    message.value = { type: 'error', text: t('settings.pages.flux.checkout.canceled') }
    router.replace({ query: {} })
  }
})

async function handleBuy(amount: number) {
  loadingAmount.value = amount
  message.value = null
  try {
    const res = await client.api.v1.stripe.checkout.$post({ json: { amount } })
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
    loadingAmount.value = null
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

    <div bg="primary-500/10 dark:primary-400/10" rounded-xl p-6 text-center>
      <div i-solar:battery-charge-bold-duotone mx-auto size-16 text-primary-500 />
      <h2 mt-4 text-3xl font-bold>
        {{ credits }}
      </h2>
      <p text="sm neutral-500">
        {{ t('settings.pages.flux.description') }}
      </p>
    </div>

    <div grid="~ cols-1 sm:cols-3 gap-4">
      <div
        v-for="pkg in packages" :key="pkg.amount"
        border="1 neutral-200 dark:neutral-800" flex="~ col gap-2" items-center rounded-xl p-4
      >
        <div font-bold>
          {{ pkg.label }}
        </div>
        <div text="2xl" font-bold>
          {{ pkg.price }}
        </div>
        <Button
          :label="t('settings.pages.flux.buy')"
          :loading="loadingAmount === pkg.amount"
          :disabled="loadingAmount !== null && loadingAmount !== pkg.amount"
          @click="handleBuy(pkg.amount)"
        />
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
            <tr
              v-for="record in auditRecords"
              :key="record.id"
              border="b neutral-100 dark:neutral-800/50 last:none"
            >
              <td whitespace-nowrap px-4 py-3 text="neutral-500">
                {{ formatDate(record.createdAt) }}
              </td>
              <td px-4 py-3>
                <span
                  inline-block rounded-full px-2 py-0.5 text-xs font-medium
                  :class="record.type === 'debit'
                    ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                    : 'bg-green-500/10 text-green-600 dark:text-green-400'"
                >
                  {{ record.type === 'debit'
                    ? t('settings.pages.flux.audit.typeConsumption')
                    : record.type === 'credit'
                      ? t('settings.pages.flux.audit.typeAddition')
                      : t('settings.pages.flux.audit.typeInitial') }}
                </span>
              </td>
              <td px-4 py-3>
                <span>{{ record.description }}</span>
                <span
                  v-if="record.metadata?.promptTokens != null"
                  ml-1 text="xs neutral-400"
                >
                  ({{ record.metadata.promptTokens }}+{{ record.metadata.completionTokens }} tokens)
                </span>
              </td>
              <td px-4 py-3 text-right font-mono>
                <span :class="isPositive(record) ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'">
                  {{ displayAmount(record) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile: card list -->
      <div v-if="auditRecords.length > 0" flex="~ col gap-2" sm:hidden>
        <div
          v-for="record in auditRecords"
          :key="record.id"
          border="1 neutral-200 dark:neutral-800" flex="~ col gap-1.5" rounded-lg px-3 py-2.5
        >
          <div flex="~ items-center justify-between">
            <span
              inline-block rounded-full px-2 py-0.5 text-xs font-medium
              :class="record.type === 'debit'
                ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                : 'bg-green-500/10 text-green-600 dark:text-green-400'"
            >
              {{ record.type === 'debit'
                ? t('settings.pages.flux.audit.typeConsumption')
                : record.type === 'credit'
                  ? t('settings.pages.flux.audit.typeAddition')
                  : t('settings.pages.flux.audit.typeInitial') }}
            </span>
            <span text-sm font-semibold font-mono :class="isPositive(record) ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'">
              {{ displayAmount(record) }}
            </span>
          </div>
          <div text="sm neutral-600 dark:neutral-300" truncate>
            {{ record.description }}
            <span
              v-if="record.metadata?.promptTokens != null"
              ml-1 text="xs neutral-400"
            >
              ({{ record.metadata.promptTokens }}+{{ record.metadata.completionTokens }} tokens)
            </span>
          </div>
          <div text="xs neutral-400">
            {{ formatDate(record.createdAt) }}
          </div>
        </div>
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

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.flux.title
  icon: i-solar:battery-charge-bold-duotone
</route>
