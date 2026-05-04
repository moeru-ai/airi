<script setup lang="ts">
import type {
  ElectronMcpStdioConfigFile,
  ElectronMcpStdioRuntimeStatus,
  ElectronMcpStdioTestResult,
} from '../../../../shared/eventa'
import type { ServerForm } from './mcp-config'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import {
  Button,
  Callout,
  Checkbox,
  TransitionVertical,
} from '@proj-airi/ui'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import McpConnectionTestPanel from './components/McpConnectionTestPanel.vue'
import McpJsonEditor from './components/McpJsonEditor.vue'
import McpServerForm from './components/McpServerForm.vue'

import {
  electronMcpApplyAndRestart,
  electronMcpGetRuntimeStatus,
  electronMcpOpenConfigFile,
  electronMcpReadConfigText,
  electronMcpTestServer,
  electronMcpWriteConfigText,
} from '../../../../shared/eventa'
import { parseElectronMcpConfigText } from '../../../../shared/mcp-config'
import {
  buildConfigFile,
  buildServerConfig,
  createServerForm,
  findServerIdentifierByRowId,
  loadServerForms,
  previewServerCommand,
} from './mcp-config'

const { t } = useI18n()
const tn = (key: string, params?: Record<string, unknown>) => t(`settings.pages.modules.mcp-server.${key}`, params ?? {})

const invokeOpenConfigFile = useElectronEventaInvoke(electronMcpOpenConfigFile)
const invokeApplyAndRestart = useElectronEventaInvoke(electronMcpApplyAndRestart)
const invokeGetRuntimeStatus = useElectronEventaInvoke(electronMcpGetRuntimeStatus)
const invokeReadConfigText = useElectronEventaInvoke(electronMcpReadConfigText)
const invokeWriteConfigText = useElectronEventaInvoke(electronMcpWriteConfigText)
const invokeTestServer = useElectronEventaInvoke(electronMcpTestServer)

const servers = ref<ServerForm[]>([])
const runtime = ref<ElectronMcpStdioRuntimeStatus>()
const infoMessage = ref('')
const errorMessage = ref('')
const isBusy = ref(false)

const jsonOpen = ref(false)
const jsonDraft = ref('')
const jsonError = ref('')
const emptyConfigSignature = JSON.stringify({ mcpServers: {} })

// Last-saved config signature; compared with the form's signature to drive `isDirty`.
const savedSig = ref('')
// Row IDs that exist on disk; non-saved rows are "pending adds" and live in the Add-server section.
const savedIds = ref<Set<string>>(new Set())
// Saved-row IDs whose detail form is currently expanded for editing.
const expandedIds = ref<Set<string>>(new Set())

const testRowId = ref('')
const testRunning = ref(false)
const testResult = ref<ElectronMcpStdioTestResult>()

function buildConfig() {
  return buildConfigFile(servers.value, tn)
}

function applyLoadedConfig(config: ElectronMcpStdioConfigFile) {
  const selectedIdentifier = findServerIdentifierByRowId(servers.value, testRowId.value)
  const loaded = loadServerForms(config, { selectedIdentifier })
  servers.value = loaded.servers
  savedIds.value = loaded.savedIds
  expandedIds.value = new Set()
  testRowId.value = loaded.selectedRowId
}

const savedServers = computed(() => servers.value.filter(s => savedIds.value.has(s.rowId)))
const pendingServers = computed(() => servers.value.filter(s => !savedIds.value.has(s.rowId)))

function isExpanded(id: string) {
  return expandedIds.value.has(id)
}
function toggleExpanded(id: string) {
  if (expandedIds.value.has(id))
    expandedIds.value.delete(id)
  else
    expandedIds.value.add(id)
}

const isDirty = computed(() => {
  try {
    return JSON.stringify(buildConfig()) !== savedSig.value
  }
  catch {
    return true
  }
})
const restartActionLabel = computed(() => isDirty.value ? tn('actions.apply-and-restart') : tn('actions.restart'))

const testOptions = computed(() => servers.value.map((s) => {
  const name = s.identifier.trim() || tn('test.untitled')
  return {
    label: s.enabled ? name : `${name} (${tn('test.disabled-suffix')})`,
    value: s.rowId,
  }
}))

const configPath = computed(() => runtime.value?.path ?? '')

function runtimeStateOf(name: string) {
  return runtime.value?.servers.find(s => s.name === name)?.state
}

const RUNTIME_BADGE: Record<'running' | 'stopped' | 'error', string> = {
  running: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  error: 'bg-red-500/15 text-red-700 dark:text-red-300',
  stopped: 'bg-neutral-400/20 text-neutral-600 dark:text-neutral-300',
}

function badgeClass(state: 'running' | 'stopped' | 'error' | undefined) {
  return RUNTIME_BADGE[state ?? 'stopped']
}

function commandPreview(s: ServerForm) {
  return previewServerCommand(s)
}

// Shared shells – avoid repeating long Tailwind chains in the template.
const PANEL = 'flex flex-col gap-3 rounded-xl border-2 border-solid border-neutral-100 bg-white p-4 md:p-5 dark:border-neutral-900 dark:bg-neutral-900/30'
const CARD_PRIMARY = 'flex flex-col gap-3 rounded-xl border-2 border-solid border-primary-100 bg-primary-50/50 p-3 transition-all duration-200 ease-in-out hover:border-primary-500/30 md:p-4 dark:border-primary-900/60 dark:bg-primary-900/10 dark:hover:border-primary-400/30'
const CARD_MUTED = 'flex flex-col gap-3 rounded-xl border-2 border-solid border-neutral-100 bg-neutral-50/60 p-3 transition-all duration-200 ease-in-out hover:border-primary-500/30 md:p-4 dark:border-neutral-900 dark:bg-neutral-900/30 dark:hover:border-primary-400/30'

async function refreshRuntime() {
  runtime.value = await invokeGetRuntimeStatus()
}

async function loadFromDisk() {
  const { text } = await invokeReadConfigText()
  try {
    const parsed = parseElectronMcpConfigText(text)
    applyLoadedConfig(parsed)
    savedSig.value = JSON.stringify(parsed)
    jsonOpen.value = false
    jsonDraft.value = ''
    jsonError.value = ''
  }
  catch (e) {
    const message = errorMessageFrom(e) ?? 'Unknown error'
    errorMessage.value = message
    jsonDraft.value = text
    jsonError.value = message
    jsonOpen.value = true
    servers.value = []
    savedIds.value = new Set()
    expandedIds.value = new Set()
    savedSig.value = emptyConfigSignature
    testRowId.value = ''
  }
}

function syncJsonDraft() {
  try {
    jsonDraft.value = `${JSON.stringify(buildConfig(), null, 2)}\n`
  }
  catch {
    jsonDraft.value = `${JSON.stringify({ mcpServers: {} }, null, 2)}\n`
  }
  jsonError.value = ''
}

function toggleJsonPanel() {
  if (jsonOpen.value) {
    jsonOpen.value = false
    jsonError.value = ''
  }
  else {
    syncJsonDraft()
    jsonOpen.value = true
  }
}

function applyJsonDraft() {
  try {
    const parsed = parseElectronMcpConfigText(jsonDraft.value)
    applyLoadedConfig(parsed)
    jsonError.value = ''
    jsonOpen.value = false
    infoMessage.value = tn('messages.json-applied')
  }
  catch (e) {
    jsonError.value = errorMessageFrom(e) ?? 'Unknown error'
  }
}

function formatJsonDraft() {
  try {
    jsonDraft.value = `${JSON.stringify(JSON.parse(jsonDraft.value), null, 2)}\n`
    jsonError.value = ''
  }
  catch (e) {
    jsonError.value = errorMessageFrom(e) ?? 'Unknown error'
  }
}

function addServer() {
  const server = createServerForm()
  servers.value.push(server)
  if (!testRowId.value)
    testRowId.value = server.rowId
}

function removeServer(rowId: string) {
  const i = servers.value.findIndex(s => s.rowId === rowId)
  if (i >= 0)
    servers.value.splice(i, 1)
  savedIds.value.delete(rowId)
  expandedIds.value.delete(rowId)
  if (testRowId.value === rowId)
    testRowId.value = servers.value[0]?.rowId ?? ''
}

async function saveAndRestart() {
  isBusy.value = true
  errorMessage.value = ''
  infoMessage.value = ''
  try {
    const text = `${JSON.stringify(buildConfig(), null, 2)}\n`
    const written = await invokeWriteConfigText({ text })
    const parsed = parseElectronMcpConfigText(written.text)
    applyLoadedConfig(parsed)
    savedSig.value = JSON.stringify(parsed)
    const result = await invokeApplyAndRestart()
    await refreshRuntime()
    infoMessage.value = tn('messages.restarted', {
      started: result.started.length,
      failed: result.failed.length,
      skipped: result.skipped.length,
    })
  }
  catch (e) {
    errorMessage.value = errorMessageFrom(e) ?? 'Unknown error'
  }
  finally {
    isBusy.value = false
  }
}

async function restartServers() {
  isBusy.value = true
  errorMessage.value = ''
  infoMessage.value = ''
  try {
    const result = await invokeApplyAndRestart()
    await refreshRuntime()
    infoMessage.value = tn('messages.restarted', {
      started: result.started.length,
      failed: result.failed.length,
      skipped: result.skipped.length,
    })
  }
  catch (e) {
    errorMessage.value = errorMessageFrom(e) ?? 'Unknown error'
  }
  finally {
    isBusy.value = false
  }
}

async function applyRestartAction() {
  if (isDirty.value) {
    await saveAndRestart()
    return
  }

  await restartServers()
}

async function openConfigInSystem() {
  errorMessage.value = ''
  try {
    const { path } = await invokeOpenConfigFile()
    infoMessage.value = tn('messages.opened', { path })
  }
  catch (e) {
    errorMessage.value = errorMessageFrom(e) ?? 'Unknown error'
  }
}

async function runConnectionTest() {
  const target = servers.value.find(s => s.rowId === testRowId.value)
  if (!target) {
    testResult.value = { ok: false, error: tn('test.no-server-selected'), durationMs: 0 }
    return
  }
  if (!target.enabled) {
    testResult.value = { ok: false, error: tn('test.server-disabled', { name: target.identifier || '?' }), durationMs: 0 }
    return
  }
  if (!target.command.trim()) {
    testResult.value = { ok: false, error: tn('errors.empty-command', { name: target.identifier || '?' }), durationMs: 0 }
    return
  }
  testRunning.value = true
  testResult.value = undefined
  try {
    testResult.value = await invokeTestServer({
      name: target.identifier.trim() || 'untitled',
      config: buildServerConfig(target),
    })
  }
  catch (e) {
    testResult.value = { ok: false, error: errorMessageFrom(e) ?? 'Unknown error', durationMs: 0 }
  }
  finally {
    testRunning.value = false
  }
}

onMounted(async () => {
  const results = await Promise.allSettled([refreshRuntime(), loadFromDisk()])
  const reasons = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map(r => errorMessageFrom(r.reason) ?? 'Unknown error')
  if (reasons.length)
    errorMessage.value = reasons.join('; ')
  if (!testRowId.value && servers.value[0])
    testRowId.value = servers.value[0].rowId
})
</script>

<template>
  <div flex="~ col gap-4">
    <Callout v-if="errorMessage" theme="orange" :label="tn('error-title')">
      {{ errorMessage }}
    </Callout>
    <Callout v-if="infoMessage" theme="lime" :label="tn('success-title')">
      {{ infoMessage }}
    </Callout>

    <!-- Header -->
    <section :class="PANEL">
      <p class="text-sm text-neutral-500 dark:text-neutral-400">
        {{ tn('description') }}
      </p>
      <div class="break-all text-xs text-neutral-500 dark:text-neutral-400">
        <span class="font-medium">{{ tn('config-path') }}:</span> {{ configPath || '-' }}
      </div>
      <div class="flex justify-end">
        <Button
          variant="secondary" size="sm" :toggled="jsonOpen"
          :icon="jsonOpen ? 'i-solar:close-square-bold-duotone' : 'i-solar:document-text-bold-duotone'"
          :label="jsonOpen ? tn('actions.close-json') : tn('actions.edit-json')"
          @click="toggleJsonPanel"
        />
      </div>
    </section>

    <!-- Inline JSON editor -->
    <TransitionVertical>
      <McpJsonEditor
        v-if="jsonOpen"
        v-model="jsonDraft"
        :error="jsonError"
        @apply="applyJsonDraft"
        @close="jsonOpen = false"
        @format="formatJsonDraft"
        @open-config="openConfigInSystem"
        @reset-draft="syncJsonDraft"
      />
    </TransitionVertical>

    <!-- Manage existing MCP servers (compact, expandable) -->
    <section :class="PANEL">
      <div flex="~ col gap-1">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-sm font-semibold">
            {{ tn('existing.title') }}
          </h3>
          <span class="rounded-full bg-neutral-200/60 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            {{ savedServers.length }}
          </span>
        </div>
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ tn('existing.description') }}
        </p>
      </div>

      <div v-if="!savedServers.length" class="border-2 border-neutral-200 rounded-lg border-dashed p-6 text-center text-xs text-neutral-500 dark:border-neutral-800">
        {{ tn('existing.empty') }}
      </div>

      <article
        v-for="server in savedServers"
        :key="server.rowId"
        :class="server.enabled ? CARD_PRIMARY : CARD_MUTED"
      >
        <!-- Compact summary row -->
        <div class="flex items-center gap-3">
          <button
            type="button"
            class="flex items-center justify-center rounded-md p-1 text-neutral-500 transition-colors hover:bg-neutral-200/60 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            :aria-label="isExpanded(server.rowId) ? tn('actions.collapse') : tn('actions.expand')"
            @click="toggleExpanded(server.rowId)"
          >
            <span :class="isExpanded(server.rowId) ? 'i-solar:alt-arrow-down-line-duotone' : 'i-solar:alt-arrow-right-line-duotone'" class="block size-4" />
          </button>

          <div class="min-w-0 flex flex-1 flex-col gap-0.5">
            <div class="flex items-center gap-2">
              <span class="truncate text-sm font-medium">
                {{ server.identifier || tn('test.untitled') }}
              </span>
              <span
                class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase"
                :class="badgeClass(runtimeStateOf(server.identifier))"
              >
                <span class="size-1 rounded-full bg-current opacity-80" />
                {{ runtimeStateOf(server.identifier) ?? tn('status.unknown') }}
              </span>
            </div>
            <div class="truncate text-xs text-neutral-500 font-mono dark:text-neutral-400">
              {{ commandPreview(server) || '-' }}
            </div>
          </div>

          <label class="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
            <span>{{ tn('fields.enabled.label') }}</span>
            <Checkbox v-model="server.enabled" />
          </label>
        </div>

        <!-- Expanded form -->
        <TransitionVertical>
          <div v-if="isExpanded(server.rowId)" class="border-t border-neutral-200/70 pt-3 dark:border-neutral-800">
            <McpServerForm :model-value="server" @remove="removeServer(server.rowId)" />
          </div>
        </TransitionVertical>
      </article>
    </section>

    <!-- Add new MCP server -->
    <section :class="PANEL">
      <div flex="~ col gap-1">
        <h3 class="text-sm font-semibold">
          {{ tn('add.title') }}
        </h3>
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ tn('add.description') }}
        </p>
      </div>

      <article
        v-for="server in pendingServers"
        :key="server.rowId"
        :class="CARD_PRIMARY"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="rounded-full bg-primary-500/15 px-2 py-0.5 text-[10px] text-primary-700 font-medium tracking-wide uppercase dark:text-primary-300">
            {{ tn('add.pending-badge') }}
          </span>
          <label class="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
            <span>{{ tn('fields.enabled.label') }}</span>
            <Checkbox v-model="server.enabled" />
          </label>
        </div>

        <McpServerForm :model-value="server" @remove="removeServer(server.rowId)" />
      </article>

      <Button
        variant="secondary-muted" size="md" block :disabled="isBusy"
        icon="i-solar:add-circle-bold-duotone" :label="tn('actions.add-server')"
        @click="addServer"
      />
    </section>

    <!-- Restart bar -->
    <Button
      variant="primary" size="md" block :disabled="isBusy" :loading="isBusy"
      icon="i-solar:rocket-2-bold-duotone" :label="restartActionLabel"
      @click="applyRestartAction"
    />

    <!-- Connection test -->
    <McpConnectionTestPanel
      v-model="testRowId"
      :options="testOptions"
      :result="testResult"
      :running="testRunning"
      @test="runConnectionTest"
    />

    <!-- Runtime status -->
    <section v-if="runtime?.servers?.length" :class="PANEL">
      <div class="text-sm font-semibold">
        {{ tn('runtime-title') }}
      </div>
      <ul flex="~ col gap-2">
        <li
          v-for="s in runtime.servers" :key="s.name"
          class="flex flex-col gap-1 rounded-md px-3 py-2"
          :class="badgeClass(s.state)"
        >
          <div class="flex items-center justify-between gap-2 text-sm font-medium">
            <span>{{ s.name }}</span>
            <span class="text-xs tracking-wide uppercase opacity-80">{{ s.state }}</span>
          </div>
          <div class="break-all text-xs font-mono opacity-80">
            {{ s.command }} {{ s.args.join(' ') }}
          </div>
          <div v-if="s.lastError" class="break-all text-xs">
            {{ s.lastError }}
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.mcp-server.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
