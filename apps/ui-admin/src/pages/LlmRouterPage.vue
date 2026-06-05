<script setup lang="ts">
import type { AdminRouterConfigRequest, AdminRouterConfigResult } from '../modules/api'

import { errorMessageFromUnknown } from '@proj-airi/stage-shared'
import { computed, shallowRef } from 'vue'
import { toast } from 'vue-sonner'

import { adminApi } from '../modules/api'

const DEFAULT_REQUEST_BODY = `{
  "mode": "merge",
  "slices": [
    {
      "kind": "openrouter",
      "modelName": "chat-default",
      "overrideModel": "openai/gpt-4o-mini",
      "plaintextKey": "",
      "baseURL": "https://openrouter.ai/api/v1"
    }
  ],
  "defaults": {
    "chatModel": "chat-default"
  }
}`

const requestBody = shallowRef(DEFAULT_REQUEST_BODY)
const previewResult = shallowRef<AdminRouterConfigResult | null>(null)
const applyResult = shallowRef<AdminRouterConfigResult | null>(null)
const busy = shallowRef<'preview' | 'apply' | null>(null)

const parseError = computed(() => {
  try {
    parseRequestBody()
    return null
  }
  catch (error) {
    return errorMessageFromUnknown(error, 'Invalid JSON')
  }
})

async function previewConfig() {
  await submit(true)
}

async function applyConfig() {
  await submit(false)
}

async function submit(dryRun: boolean) {
  busy.value = dryRun ? 'preview' : 'apply'
  try {
    const result = await adminApi.applyRouterConfig(parseRequestBody(), dryRun)
    if (dryRun) {
      previewResult.value = result
      toast.success('Router config preview generated')
      return
    }

    applyResult.value = result
    previewResult.value = result
    toast.success('Router config applied')
  }
  catch (error) {
    toast.error(errorMessageFromUnknown(error, dryRun ? 'Failed to preview router config' : 'Failed to apply router config'))
  }
  finally {
    busy.value = null
  }
}

function parseRequestBody(): AdminRouterConfigRequest {
  const parsed = JSON.parse(requestBody.value) as unknown
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('Request body must be a JSON object')

  return parsed as AdminRouterConfigRequest
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}
</script>

<template>
  <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
    <section class="panel overflow-hidden">
      <div class="flex flex-col gap-3 border-b border-neutral-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 class="text-sm font-semibold">
            Router Config Request
          </h2>
          <p class="mt-1 text-sm text-neutral-500">
            Writes the active LLM_ROUTER_CONFIG, UNSPEECH_UPSTREAM, and default model aliases.
          </p>
        </div>
        <span class="badge" :class="parseError ? 'badge-amber' : 'badge-green'">
          <span :class="parseError ? 'i-lucide-alert-circle' : 'i-lucide-check-circle-2'" />
          {{ parseError ? 'Invalid JSON' : 'Ready' }}
        </span>
      </div>

      <div class="p-5 space-y-4">
        <textarea
          v-model="requestBody"
          class="textarea min-h-[520px] text-xs leading-5 font-mono"
          spellcheck="false"
        />

        <div v-if="parseError" class="border border-amber-200 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {{ parseError }}
        </div>

        <div class="flex flex-wrap justify-end gap-2">
          <button class="btn btn-secondary" :disabled="busy != null || parseError != null" type="button" @click="previewConfig">
            <span :class="busy === 'preview' ? 'i-lucide-loader-2 animate-spin' : 'i-lucide-eye'" />
            Preview
          </button>
          <button class="btn btn-primary" :disabled="busy != null || parseError != null" type="button" @click="applyConfig">
            <span :class="busy === 'apply' ? 'i-lucide-loader-2 animate-spin' : 'i-lucide-save'" />
            Apply
          </button>
        </div>
      </div>
    </section>

    <aside class="space-y-4">
      <section class="panel overflow-hidden">
        <div class="border-b border-neutral-200 px-4 py-3 text-sm font-semibold">
          Preview
        </div>
        <pre v-if="previewResult" class="max-h-[420px] overflow-auto p-4 text-xs leading-5">{{ formatJson(previewResult) }}</pre>
        <div v-else class="empty-state min-h-40">
          <span class="i-lucide-clipboard-list text-2xl" />
          No preview yet
        </div>
      </section>

      <section class="panel overflow-hidden">
        <div class="border-b border-neutral-200 px-4 py-3 text-sm font-semibold">
          Last Apply
        </div>
        <pre v-if="applyResult" class="max-h-[420px] overflow-auto p-4 text-xs leading-5">{{ formatJson(applyResult) }}</pre>
        <div v-else class="empty-state min-h-40">
          <span class="i-lucide-history text-2xl" />
          No applied changes
        </div>
      </section>
    </aside>
  </div>
</template>
