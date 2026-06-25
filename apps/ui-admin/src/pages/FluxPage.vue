<script setup lang="ts">
import { errorMessageFromUnknown } from '@proj-airi/stage-shared'
import { computed, reactive, shallowRef } from 'vue'
import { toast } from 'vue-sonner'

import { adminApi } from '../modules/api'

const form = reactive({
  amount: 100,
  description: 'Admin promo Flux grant',
  idempotencyKey: '',
  emails: '',
})

const loading = shallowRef(false)
const preview = shallowRef<unknown>(null)
const result = shallowRef<unknown>(null)

const emails = computed(() =>
  form.emails
    .split(/[\n,;]/)
    .map(item => item.trim())
    .filter(Boolean),
)

const totalFlux = computed(() => emails.value.length * Number(form.amount || 0))

async function dryRun() {
  await submit(true)
}

async function grant() {
  await submit(false)
}

async function submit(isDryRun: boolean) {
  loading.value = true
  result.value = null
  try {
    const body = {
      amount: Number(form.amount),
      description: form.description,
      emails: emails.value,
      ...(form.idempotencyKey.trim() ? { idempotencyKey: form.idempotencyKey.trim() } : {}),
    }
    if (isDryRun) {
      preview.value = await adminApi.fluxGrantPreview(body)
      toast.success('Preview generated')
      return
    }

    result.value = await adminApi.fluxGrant(body)
    toast.success('Flux grant issued')
  }
  catch (error) {
    toast.error(errorMessageFromUnknown(error, 'Flux grant failed'))
  }
  finally {
    loading.value = false
  }
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value)
}
</script>

<template>
  <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
    <section class="panel p-5">
      <div class="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 class="text-sm font-semibold">
            Bulk Flux Grant
          </h2>
          <p class="mt-1 text-sm text-neutral-500">
            Issues promo Flux to existing users by email. Preview first for recipient validation.
          </p>
        </div>
        <span class="badge badge-green">
          <span class="i-lucide-shield-check" />
          Admin guarded
        </span>
      </div>

      <form class="space-y-4" @submit.prevent="dryRun">
        <div class="grid gap-4 md:grid-cols-2">
          <label class="block">
            <span class="mb-1 block text-xs text-neutral-500 font-semibold uppercase">Amount per user</span>
            <input v-model.number="form.amount" class="field" min="1" type="number">
          </label>
          <label class="block">
            <span class="mb-1 block text-xs text-neutral-500 font-semibold uppercase">Idempotency key</span>
            <input v-model="form.idempotencyKey" class="field" placeholder="Optional safe retry key" type="text">
          </label>
        </div>

        <label class="block">
          <span class="mb-1 block text-xs text-neutral-500 font-semibold uppercase">Description</span>
          <input v-model="form.description" class="field" type="text">
        </label>

        <label class="block">
          <span class="mb-1 block text-xs text-neutral-500 font-semibold uppercase">Emails</span>
          <textarea v-model="form.emails" class="textarea min-h-[260px]" placeholder="alice@example.com&#10;bob@example.com" />
        </label>

        <div class="flex flex-col gap-3 border-t border-neutral-200 pt-4 md:flex-row md:items-center md:justify-between">
          <div class="text-sm text-neutral-500">
            {{ emails.length }} recipients · {{ formatNumber(totalFlux) }} total Flux
          </div>
          <div class="flex gap-2">
            <button class="btn btn-secondary" :disabled="loading || emails.length === 0" type="submit">
              <span class="i-lucide-eye" />
              Preview
            </button>
            <button class="btn btn-primary" :disabled="loading || emails.length === 0" type="button" @click="grant">
              <span class="i-lucide-send" />
              Grant Flux
            </button>
          </div>
        </div>
      </form>
    </section>

    <aside class="space-y-4">
      <section class="metric-card">
        <div class="text-sm text-neutral-500">
          Recipients
        </div>
        <div class="mt-3 text-3xl font-semibold">
          {{ formatNumber(emails.length) }}
        </div>
        <div class="mt-5 text-sm text-neutral-600">
          Synchronous grants are capped by the server.
        </div>
      </section>

      <section class="panel overflow-hidden">
        <div class="border-b border-neutral-200 px-4 py-3 text-sm font-semibold">
          Preview
        </div>
        <pre v-if="preview" class="max-h-[280px] overflow-auto p-4 text-xs leading-5">{{ formatJson(preview) }}</pre>
        <div v-else class="empty-state min-h-40">
          <span class="i-lucide-clipboard-list text-2xl" />
          No preview yet
        </div>
      </section>

      <section class="panel overflow-hidden">
        <div class="border-b border-neutral-200 px-4 py-3 text-sm font-semibold">
          Last Result
        </div>
        <pre v-if="result" class="max-h-[280px] overflow-auto p-4 text-xs leading-5">{{ formatJson(result) }}</pre>
        <div v-else class="empty-state min-h-40">
          <span class="i-lucide-history text-2xl" />
          No grant result
        </div>
      </section>
    </aside>
  </div>
</template>
