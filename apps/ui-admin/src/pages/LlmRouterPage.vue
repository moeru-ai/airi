<script setup lang="ts">
import type { AdminRouterConfigCurrent, AdminRouterConfigRequest, AdminRouterConfigResult } from '../modules/api'
import type { RouterSliceDraft, RouterSliceKind } from '../modules/router-config-form'

import { errorMessageFromUnknown } from '@proj-airi/stage-shared'
import { Button, Callout, FieldSelect } from '@proj-airi/ui'
import { computed, onMounted, reactive, shallowRef } from 'vue'
import { toast } from 'vue-sonner'

import RouterAdvancedJsonPanel from '../components/llm-router/RouterAdvancedJsonPanel.vue'
import RouterDefaultsEditor from '../components/llm-router/RouterDefaultsEditor.vue'
import RouterModeControl from '../components/llm-router/RouterModeControl.vue'
import RouterPreviewPanel from '../components/llm-router/RouterPreviewPanel.vue'
import RouterSliceEditor from '../components/llm-router/RouterSliceEditor.vue'

import { adminApi } from '../modules/api'
import {
  buildRouterConfigRequest,
  createRouterConfigFormState,
  createRouterSliceDraft,
  formatRouterConfigRequestJson,
  formStateFromRequestJson,
  ROUTER_SLICE_KIND_OPTIONS,
  routerConfigRequestFromFormDraft,
  validateRouterConfigForm,
} from '../modules/router-config-form'

type BusyState = 'preview' | 'apply' | 'advanced-preview' | 'advanced-apply'
type ProviderTab = 'llm' | 'tts' | 'streamingTts' | 'asr'

const form = reactive(createRouterConfigFormState())
const activeProviderTab = shallowRef<ProviderTab>('llm')
const selectedKindByTab = reactive<Record<ProviderTab, RouterSliceKind>>({
  llm: 'openrouter',
  tts: 'azure',
  streamingTts: 'unspeech',
  asr: 'aliyun-nls-asr',
})
const previewResult = shallowRef<AdminRouterConfigResult | null>(null)
const applyResult = shallowRef<AdminRouterConfigResult | null>(null)
const busy = shallowRef<BusyState | null>(null)
const currentConfig = shallowRef<AdminRouterConfigCurrent | null>(null)
const loadingCurrent = shallowRef(false)
const currentError = shallowRef<string | null>(null)
const advancedJson = shallowRef(formatRouterConfigRequestJson(routerConfigRequestFromFormDraft(form)))
const advancedError = shallowRef<string | null>(null)

const validationErrors = computed(() => validateRouterConfigForm(form))
const hasValidationErrors = computed(() => validationErrors.value.length > 0)
const pendingRequest = computed(() => routerConfigRequestFromFormDraft(form))
const selectedKind = computed({
  get: () => selectedKindByTab[activeProviderTab.value],
  set: (kind: RouterSliceKind) => {
    selectedKindByTab[activeProviderTab.value] = kind
  },
})
const pendingSummary = computed(() => {
  const defaults = pendingRequest.value.defaults ?? {}
  return {
    slices: form.slices.length,
    llmSlices: form.slices.filter(slice => slice.kind === 'openrouter').length,
    ttsSlices: form.slices.filter(isTtsSlice).length,
    streamingTtsSlices: form.slices.filter(isStreamingTtsSlice).length,
    asrSlices: form.slices.filter(isAsrSlice).length,
    defaults: Object.keys(defaults).length,
  }
})
const providerTabs = computed(() => [
  { value: 'llm' as const, label: 'LLM', count: pendingSummary.value.llmSlices },
  { value: 'tts' as const, label: 'TTS', count: pendingSummary.value.ttsSlices },
  { value: 'streamingTts' as const, label: 'Streaming TTS', count: pendingSummary.value.streamingTtsSlices },
  { value: 'asr' as const, label: 'ASR', count: pendingSummary.value.asrSlices },
])
const providerKindOptions = computed(() => ROUTER_SLICE_KIND_OPTIONS.filter((option) => {
  if (activeProviderTab.value === 'llm')
    return option.value === 'openrouter'
  if (activeProviderTab.value === 'streamingTts')
    return option.value === 'unspeech'
  if (activeProviderTab.value === 'asr')
    return option.value === 'aliyun-nls-asr'

  return isTtsSliceKind(option.value)
}))
const visibleSlices = computed(() => form.slices
  .map((slice, index) => ({ slice, index }))
  .filter(({ slice }) => {
    if (activeProviderTab.value === 'llm')
      return isLlmSlice(slice)
    if (activeProviderTab.value === 'streamingTts')
      return isStreamingTtsSlice(slice)
    if (activeProviderTab.value === 'asr')
      return isAsrSlice(slice)
    return isTtsSlice(slice)
  }))
const currentStatusLabel = computed(() => {
  if (loadingCurrent.value)
    return 'Loading current config'
  if (currentError.value)
    return 'Current config unavailable'
  if (!currentConfig.value)
    return 'Current config not loaded'
  if (currentConfig.value.request.slices?.length || Object.keys(currentConfig.value.request.defaults ?? {}).length > 0)
    return 'Loaded current config'
  return 'No current config'
})

onMounted(() => {
  void loadCurrentConfig()
})

async function previewConfig() {
  await submitForm(true)
}

async function applyConfig() {
  await submitForm(false)
}

async function previewAdvancedJson() {
  await submitAdvancedJson(true)
}

async function applyAdvancedJson() {
  await submitAdvancedJson(false)
}

async function loadCurrentConfig() {
  loadingCurrent.value = true
  currentError.value = null
  try {
    const current = await adminApi.routerConfig()
    if (!isCurrentConfigResponse(current))
      throw new Error('Current router config response is not a valid JSON object.')

    currentConfig.value = current
    previewResult.value = {
      applied: [],
      invalidatedKeys: [],
      preview: current.preview,
    }

    if (current.request.slices?.length || Object.keys(current.request.defaults ?? {}).length > 0) {
      Object.assign(form, formStateFromRequestJson(formatRouterConfigRequestJson(current.request)))
      advancedJson.value = formatRouterConfigRequestJson(routerConfigRequestFromFormDraft(form))
    }
  }
  catch (error) {
    currentError.value = errorMessageFromUnknown(error, 'Failed to load current router config')
  }
  finally {
    loadingCurrent.value = false
  }
}

function addSlice() {
  form.slices.push(createRouterSliceDraft(selectedKind.value))
}

function selectProviderTab(tab: ProviderTab) {
  activeProviderTab.value = tab
}

function duplicateSlice(index: number) {
  const source = form.slices[index]
  if (!source)
    return

  const clone = createRouterSliceDraft(source.kind)
  const cloneId = clone.id
  Object.assign(clone, JSON.parse(JSON.stringify(source)) as RouterSliceDraft, { id: cloneId })
  form.slices.splice(index + 1, 0, clone)
}

function removeSlice(index: number) {
  form.slices.splice(index, 1)
}

function exportFormJson() {
  advancedJson.value = formatRouterConfigRequestJson(routerConfigRequestFromFormDraft(form))
  advancedError.value = null
  toast.success('Form exported to advanced JSON')
}

function importAdvancedJson() {
  try {
    const imported = formStateFromRequestJson(advancedJson.value)
    Object.assign(form, imported)
    advancedError.value = null
    toast.success('Advanced JSON imported into form')
  }
  catch (error) {
    advancedError.value = errorMessageFromUnknown(error, 'Failed to import advanced JSON')
  }
}

async function submitForm(dryRun: boolean) {
  const built = buildRouterConfigRequest(form)
  if (!built.request) {
    toast.error(built.errors[0] ?? 'Router config form is incomplete')
    return
  }

  await submitRequest(built.request, dryRun, dryRun ? 'preview' : 'apply')
}

async function submitAdvancedJson(dryRun: boolean) {
  const request = parseAdvancedJsonRequest()
  if (!request)
    return

  await submitRequest(request, dryRun, dryRun ? 'advanced-preview' : 'advanced-apply')
}

async function submitRequest(request: AdminRouterConfigRequest, dryRun: boolean, state: BusyState) {
  busy.value = state
  try {
    const result = await adminApi.applyRouterConfig(request, dryRun)
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

function parseAdvancedJsonRequest(): AdminRouterConfigRequest | null {
  try {
    const parsed = JSON.parse(advancedJson.value) as unknown
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('Advanced JSON must be a request object.')

    advancedError.value = null
    return parsed as AdminRouterConfigRequest
  }
  catch (error) {
    advancedError.value = errorMessageFromUnknown(error, 'Invalid advanced JSON')
    return null
  }
}

function isLlmSlice(slice: RouterSliceDraft) {
  return slice.kind === 'openrouter'
}

function isTtsSlice(slice: RouterSliceDraft) {
  return isTtsSliceKind(slice.kind)
}

function isStreamingTtsSlice(slice: RouterSliceDraft) {
  return slice.kind === 'unspeech'
}

function isAsrSlice(slice: RouterSliceDraft) {
  return slice.kind === 'aliyun-nls-asr'
}

function isTtsSliceKind(kind: RouterSliceKind) {
  return kind === 'azure'
    || kind === 'dashscope-cosyvoice'
    || kind === 'stepfun'
}

function activeProviderLabel() {
  switch (activeProviderTab.value) {
    case 'llm':
      return 'LLM'
    case 'tts':
      return 'TTS'
    case 'streamingTts':
      return 'Streaming TTS'
    case 'asr':
      return 'ASR'
  }
}

function isCurrentConfigResponse(value: AdminRouterConfigCurrent | null): value is AdminRouterConfigCurrent {
  return value != null
    && typeof value === 'object'
    && value.request != null
    && typeof value.request === 'object'
    && value.preview != null
    && typeof value.preview === 'object'
}
</script>

<template>
  <div :class="['grid', 'gap-5', 'xl:grid-cols-[minmax(0,1fr)_420px]']">
    <section :class="['panel', 'overflow-hidden']">
      <div :class="['flex', 'flex-col', 'gap-3', 'border-b', 'border-neutral-200', 'px-5', 'py-4', 'md:flex-row', 'md:items-center', 'md:justify-between', 'dark:border-neutral-800']">
        <div>
          <h2 :class="['text-sm', 'font-semibold']">
            Router Config Form
          </h2>
          <p :class="['mt-1', 'text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
            Builds LLM_ROUTER_CONFIG, UNSPEECH_UPSTREAM, and default model aliases without hand-written JSON.
          </p>
        </div>
        <span :class="['badge', hasValidationErrors ? 'badge-amber' : 'badge-green']">
          <span :class="[hasValidationErrors ? 'i-lucide-alert-circle' : 'i-lucide-check-circle-2']" />
          {{ hasValidationErrors ? `${validationErrors.length} issues` : 'Ready' }}
        </span>
      </div>

      <form :class="['space-y-5', 'p-5']" @submit.prevent="previewConfig">
        <section :class="['rounded-lg', 'border', 'border-neutral-200', 'bg-white', 'p-4', 'dark:border-neutral-800', 'dark:bg-neutral-900']">
          <div :class="['flex', 'flex-col', 'gap-3', 'md:flex-row', 'md:items-center', 'md:justify-between']">
            <div>
              <h3 :class="['text-sm', 'font-semibold']">
                Current Config
              </h3>
              <p :class="['mt-1', 'text-xs', currentError ? 'text-red-600 dark:text-red-400' : 'text-neutral-500 dark:text-neutral-400']">
                {{ currentError ?? currentStatusLabel }}
              </p>
            </div>
            <Button
              class="whitespace-nowrap"
              icon="i-lucide-refresh-cw"
              label="Reload"
              size="sm"
              type="button"
              variant="secondary"
              :disabled="busy != null || loadingCurrent"
              :loading="loadingCurrent"
              @click="loadCurrentConfig"
            />
          </div>
        </section>

        <RouterModeControl v-model="form.mode" />
        <RouterDefaultsEditor v-model="form.defaults" />

        <section :class="['rounded-lg', 'border', 'border-neutral-200', 'bg-white', 'dark:border-neutral-800', 'dark:bg-neutral-900']">
          <div :class="['border-b', 'border-neutral-200', 'p-4', 'dark:border-neutral-800']">
            <div>
              <h3 :class="['text-sm', 'font-semibold']">
                Provider configuration
              </h3>
              <p :class="['mt-1', 'text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
                LLM, TTS, Streaming TTS, and ASR providers are edited separately, then applied as one router config request.
              </p>
            </div>
          </div>

          <div :class="['flex', 'flex-col', 'gap-4', 'p-4']">
            <div :class="['flex', 'flex-col', 'gap-3', 'lg:flex-row', 'lg:items-end', 'lg:justify-between']">
              <div
                :class="['inline-grid', 'w-full', 'grid-cols-4', 'rounded-lg', 'border', 'border-neutral-200', 'bg-neutral-50', 'p-1', 'sm:w-auto', 'dark:border-neutral-800', 'dark:bg-neutral-950']"
                role="tablist"
              >
                <button
                  v-for="tab in providerTabs"
                  :key="tab.value"
                  :aria-selected="activeProviderTab === tab.value"
                  :class="[
                    'h-9 rounded-md px-4 text-sm font-medium transition-colors whitespace-nowrap',
                    activeProviderTab === tab.value
                      ? 'bg-white text-primary-700 shadow-sm ring-1 ring-primary-200 dark:bg-neutral-900 dark:text-primary-300 dark:ring-primary-800'
                      : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200',
                  ]"
                  role="tab"
                  type="button"
                  @click="selectProviderTab(tab.value)"
                >
                  {{ tab.label }}
                  <span :class="['ml-1', 'text-xs', activeProviderTab === tab.value ? 'text-neutral-500 dark:text-neutral-400' : 'text-neutral-400 dark:text-neutral-500']">
                    {{ tab.count }}
                  </span>
                </button>
              </div>

              <div :class="['grid', 'gap-2', 'sm:grid-cols-[minmax(220px,1fr)_auto]', 'sm:items-end']">
                <FieldSelect
                  v-model="selectedKind"
                  label="Provider"
                  layout="vertical"
                  :options="providerKindOptions"
                  select-class="w-full"
                />
                <Button class="self-end whitespace-nowrap" icon="i-lucide-plus" label="Add" size="sm" type="button" @click="addSlice" />
              </div>
            </div>

            <div :class="['rounded-lg', 'border', 'border-neutral-200', 'bg-neutral-50/60', 'px-3', 'py-2', 'text-xs', 'text-neutral-600', 'dark:border-neutral-800', 'dark:bg-neutral-950/60', 'dark:text-neutral-300']">
              <span :class="['font-medium', 'text-neutral-900', 'dark:text-neutral-100']">{{ activeProviderLabel() }}</span>
              <span v-if="activeProviderTab === 'llm'">
                config writes chat model aliases under LLM_ROUTER_CONFIG.
              </span>
              <span v-else-if="activeProviderTab === 'tts'">
                config writes speech model aliases under LLM_ROUTER_CONFIG.
              </span>
              <span v-else-if="activeProviderTab === 'streamingTts'">
                config writes UNSPEECH_UPSTREAM settings for realtime speech synthesis.
              </span>
              <span v-else>
                config writes realtime transcription model aliases under LLM_ROUTER_CONFIG.asr.
              </span>
            </div>

            <div v-if="visibleSlices.length" :class="['space-y-3']">
              <RouterSliceEditor
                v-for="(item, visibleIndex) in visibleSlices"
                :key="item.slice.id"
                v-model:slice="form.slices[item.index]"
                :index="visibleIndex + 1"
                @duplicate="duplicateSlice(item.index)"
                @remove="removeSlice(item.index)"
              />
            </div>
            <div v-else :class="['empty-state', 'min-h-40', 'rounded-lg', 'border', 'border-dashed', 'border-neutral-200', 'bg-white', 'dark:border-neutral-800', 'dark:bg-neutral-900']">
              No {{ activeProviderLabel() }} provider slices
            </div>
          </div>
          <div :class="['border-t', 'border-neutral-200', 'px-4', 'py-3', 'text-xs', 'text-neutral-500', 'dark:border-neutral-800', 'dark:text-neutral-400']">
            UnSpeech is limited to one Streaming TTS slice per request. ASR writes to LLM_ROUTER_CONFIG.asr.
          </div>
        </section>

        <Callout v-if="hasValidationErrors" label="Fix before apply" theme="orange">
          <ul :class="['list-disc', 'space-y-1', 'pl-4']">
            <li v-for="error in validationErrors" :key="error">
              {{ error }}
            </li>
          </ul>
        </Callout>

        <div :class="['flex', 'flex-col', 'gap-3', 'border-t', 'border-neutral-200', 'pt-4', 'md:flex-row', 'md:items-center', 'md:justify-between', 'dark:border-neutral-800']">
          <div :class="['grid', 'gap-2', 'text-xs', 'text-neutral-600', 'sm:grid-cols-6', 'dark:text-neutral-400']">
            <div>
              <span :class="['block', 'font-semibold', 'text-neutral-900', 'dark:text-neutral-100']">{{ pendingSummary.slices }}</span>
              slices
            </div>
            <div>
              <span :class="['block', 'font-semibold', 'text-neutral-900', 'dark:text-neutral-100']">{{ pendingSummary.llmSlices }}</span>
              LLM
            </div>
            <div>
              <span :class="['block', 'font-semibold', 'text-neutral-900', 'dark:text-neutral-100']">{{ pendingSummary.ttsSlices }}</span>
              TTS
            </div>
            <div>
              <span :class="['block', 'font-semibold', 'text-neutral-900', 'dark:text-neutral-100']">{{ pendingSummary.streamingTtsSlices }}</span>
              Streaming TTS
            </div>
            <div>
              <span :class="['block', 'font-semibold', 'text-neutral-900', 'dark:text-neutral-100']">{{ pendingSummary.asrSlices }}</span>
              ASR
            </div>
            <div>
              <span :class="['block', 'font-semibold', 'text-neutral-900', 'dark:text-neutral-100']">{{ pendingSummary.defaults }}</span>
              defaults
            </div>
          </div>

          <div :class="['flex', 'flex-wrap', 'justify-end', 'gap-2']">
            <Button
              icon="i-lucide-eye"
              label="Preview"
              size="sm"
              type="button"
              variant="secondary"
              :disabled="busy != null || hasValidationErrors"
              :loading="busy === 'preview'"
              @click="previewConfig"
            />
            <Button
              icon="i-lucide-save"
              label="Apply"
              size="sm"
              type="button"
              :disabled="busy != null || hasValidationErrors"
              :loading="busy === 'apply'"
              @click="applyConfig"
            />
          </div>
        </div>
      </form>
    </section>

    <aside :class="['space-y-4']">
      <RouterPreviewPanel title="Preview" :result="previewResult" />
      <RouterPreviewPanel title="Last Apply" :result="applyResult" />
      <RouterAdvancedJsonPanel
        v-model="advancedJson"
        :busy="busy"
        :disabled="busy != null"
        :error="advancedError"
        @apply="applyAdvancedJson"
        @export-form="exportFormJson"
        @import-form="importAdvancedJson"
        @preview="previewAdvancedJson"
      />
    </aside>
  </div>
</template>
