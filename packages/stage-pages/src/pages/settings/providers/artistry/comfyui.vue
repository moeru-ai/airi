<script setup lang="ts">
import type { ComfyUIWorkflowTemplate } from '@proj-airi/stage-ui/stores/modules/artistry'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { errorMessageFrom } from '@moeru/std'
import { artistryTestComfyUIConnection, isStageTamagotchi } from '@proj-airi/stage-shared'
import { useArtistryStore } from '@proj-airi/stage-ui/stores/modules/artistry'
import { FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

const artistryStore = useArtistryStore()

const {
  comfyuiServerUrl,
  comfyuiSavedWorkflows,
  comfyuiActiveWorkflow,
} = storeToRefs(artistryStore)

const expandedWorkflow = ref<string | null>(null)

// TODO: perhaps electron-vueuse should be ported for this?
function getElectronIpcRenderer() {
  return (window as Window & {
    electron?: { ipcRenderer?: unknown }
  }).electron?.ipcRenderer
}

// --- Connection test ---
const connectionStatus = ref<'idle' | 'testing' | 'connected' | 'failed'>('idle')
const connectionInfo = ref('')
const isCorsError = ref(false)

async function testConnection() {
  connectionStatus.value = 'testing'
  connectionInfo.value = ''
  isCorsError.value = false

  try {
    if (isStageTamagotchi()) {
      const ipcRenderer = getElectronIpcRenderer()
      if (!ipcRenderer)
        throw new Error('Electron IPC is not available in this renderer context')

      // Proxy through main process to bypass CORS.
      const { context } = createContext(ipcRenderer as Parameters<typeof createContext>[0])
      const invokeTestComfyUIConnection = defineInvoke(context, artistryTestComfyUIConnection)
      const result = await invokeTestComfyUIConnection({
        url: comfyuiServerUrl.value,
      })
      if (result.ok) {
        connectionInfo.value = result.info || 'Connected'
        connectionStatus.value = 'connected'
      }
      else {
        connectionInfo.value = result.info || 'Connection failed'
        connectionStatus.value = 'failed'
      }
    }
    else {
      // Browser fallback (subject to CORS)
      const url = comfyuiServerUrl.value.replace(/\/+$/, '')
      const resp = await fetch(`${url}/system_stats`, { mode: 'cors' })

      if (!resp.ok)
        throw new Error(`HTTP ${resp.status}`)

      const data = await resp.json() as { devices?: Array<{ name?: string }> }
      const gpus = data.devices?.map(d => d.name).join(', ') || 'Unknown GPU'
      connectionInfo.value = `Connected — ${gpus}`
      connectionStatus.value = 'connected'
    }
  }
  catch (e: unknown) {
    const errorMessage = errorMessageFrom(e) ?? 'Unknown connection error'
    connectionInfo.value = `Error: ${errorMessage}`
    connectionStatus.value = 'failed'
    if (errorMessage.includes('fetch') || errorMessage.includes('CORS')) {
      isCorsError.value = true
    }
  }
}

// --- Workflow Manager ---
const showUploadSection = ref(false)
const uploadError = ref('')
const parsedWorkflow = ref<{ nodes: Array<{ id: string, title: string, type: string, inputs: Record<string, any> }> } | null>(null)
const pendingWorkflowName = ref('')
const pendingWorkflowRaw = ref<Record<string, any> | null>(null)
const selectedFields = ref<Record<string, Set<string>>>({})

function handleFileUpload(event: Event) {
  uploadError.value = ''
  parsedWorkflow.value = null
  pendingWorkflowRaw.value = null
  selectedFields.value = {}

  const input = event.target as HTMLInputElement
  const file = input?.files?.[0]
  if (!file)
    return

  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const json = JSON.parse(e.target?.result as string)
      pendingWorkflowRaw.value = json
      pendingWorkflowName.value = file.name.replace(/.json$/, '')

      // Parse nodes from API format (flat object of nodeId -> node)
      const nodes: Array<{ id: string, title: string, type: string, inputs: Record<string, any> }> = []
      for (const [nodeId, node] of Object.entries(json as Record<string, any>)) {
        const title = node._meta?.title || node.class_type || `Node ${nodeId}`
        const type = node.class_type || 'Unknown'
        const inputs: Record<string, any> = {}
        for (const [key, val] of Object.entries(node.inputs || {})) {
          // Skip link arrays (connections to other nodes)
          if (!Array.isArray(val)) {
            inputs[key] = val
          }
        }
        if (Object.keys(inputs).length > 0) {
          nodes.push({ id: nodeId, title, type, inputs })
          selectedFields.value[title] = new Set()
        }
      }

      parsedWorkflow.value = { nodes }
    }
    catch (err: unknown) {
      uploadError.value = `Invalid JSON: ${errorMessageFrom(err)}`
    }
  }
  reader.readAsText(file)
}

function toggleField(nodeTitle: string, fieldName: string) {
  const set = selectedFields.value[nodeTitle]
  if (!set)
    return
  if (set.has(fieldName)) {
    set.delete(fieldName)
  }
  else {
    set.add(fieldName)
  }
}

function isFieldSelected(nodeTitle: string, fieldName: string): boolean {
  return selectedFields.value[nodeTitle]?.has(fieldName) ?? false
}

const totalExposed = computed(() => {
  let count = 0
  for (const set of Object.values(selectedFields.value)) {
    count += set.size
  }
  return count
})

function saveWorkflow() {
  if (!pendingWorkflowRaw.value || !pendingWorkflowName.value.trim())
    return

  const exposedFields: Record<string, string[]> = {}
  for (const [title, fields] of Object.entries(selectedFields.value)) {
    const arr = Array.from(fields)
    if (arr.length > 0) {
      exposedFields[title] = arr
    }
  }

  const id = pendingWorkflowName.value.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const template: ComfyUIWorkflowTemplate = {
    id,
    name: pendingWorkflowName.value.trim(),
    workflow: pendingWorkflowRaw.value,
    exposedFields,
  }

  const existing = comfyuiSavedWorkflows.value.findIndex(w => w.id === id)
  if (existing >= 0) {
    comfyuiSavedWorkflows.value[existing] = template
  }
  else {
    comfyuiSavedWorkflows.value = [...comfyuiSavedWorkflows.value, template]
  }

  // Auto-set as active if it's the first one
  if (!comfyuiActiveWorkflow.value) {
    comfyuiActiveWorkflow.value = id
  }

  // Reset upload state
  showUploadSection.value = false
  parsedWorkflow.value = null
  pendingWorkflowRaw.value = null
  selectedFields.value = {}
  pendingWorkflowName.value = ''
}

function removeWorkflow(id: string) {
  comfyuiSavedWorkflows.value = comfyuiSavedWorkflows.value.filter(w => w.id !== id)
  if (comfyuiActiveWorkflow.value === id) {
    comfyuiActiveWorkflow.value = comfyuiSavedWorkflows.value[0]?.id || ''
  }
}

function formatValue(val: any): string {
  if (typeof val === 'string')
    return val.length > 40 ? `"${val.slice(0, 37)}..."` : `"${val}"`
  if (typeof val === 'number')
    return String(val)
  if (typeof val === 'boolean')
    return String(val)
  return JSON.stringify(val)
}

function generateExampleJson(wf: ComfyUIWorkflowTemplate) {
  const example: Record<string, any> = {
    template: wf.id,
  }
  for (const [nodeTitle, fields] of Object.entries(wf.exposedFields)) {
    example[nodeTitle] = {}
    for (const field of fields) {
      const nodeId = Object.keys(wf.workflow).find(id => (wf.workflow[id]._meta?.title || wf.workflow[id].class_type) === nodeTitle)
      const val = nodeId ? wf.workflow[nodeId].inputs[field] : '...'
      example[nodeTitle][field] = val
    }
  }
  return JSON.stringify(example, null, 2)
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- Header -->
    <div class="rounded-xl bg-indigo-500/8 p-5 dark:bg-indigo-500/12">
      <div class="mb-3 flex items-center gap-3">
        <div class="i-solar:gallery-bold-duotone text-3xl text-indigo-500" />
        <div>
          <h2 class="text-xl text-neutral-800 font-semibold dark:text-neutral-100">
            ComfyUI Native API
          </h2>
          <p class="text-sm text-neutral-500 dark:text-neutral-400">
            Connect to your local ComfyUI and bring your own workflows.
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 mt-4 gap-3 sm:grid-cols-3">
        <div class="rounded-lg bg-white/60 p-3 dark:bg-neutral-800/60">
          <div class="mb-1 text-xs text-neutral-400 font-medium dark:text-neutral-500">
            What You Need
          </div>
          <div class="text-sm text-neutral-700 dark:text-neutral-300">
            ComfyUI running locally or on your network.
          </div>
        </div>
        <div class="rounded-lg bg-white/60 p-3 dark:bg-neutral-800/60">
          <div class="mb-1 text-xs text-neutral-400 font-medium dark:text-neutral-500">
            How To Export
          </div>
          <div class="text-sm text-neutral-700 dark:text-neutral-300">
            Enable Dev Mode → "Save (API Format)".
          </div>
        </div>
        <div class="rounded-lg bg-white/60 p-3 dark:bg-neutral-800/60">
          <div class="mb-1 text-xs text-neutral-400 font-medium dark:text-neutral-500">
            Scope Boundary
          </div>
          <div class="text-sm text-neutral-700 dark:text-neutral-300">
            Model downloads & node installs are your job.
          </div>
        </div>
      </div>
    </div>

    <!-- Connection -->
    <div class="flex flex-col gap-4">
      <h3 class="text-lg text-neutral-700 font-medium dark:text-neutral-300">
        Connection
      </h3>
      <div class="flex items-end gap-3">
        <div class="flex-1">
          <FieldInput
            v-model="comfyuiServerUrl"
            label="Server URL"
            description="The address where ComfyUI is running"
            placeholder="http://localhost:8188"
          />
        </div>
        <button
          class="mb-0.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors duration-200"
          :class="{
            'bg-indigo-500 text-white hover:bg-indigo-600': connectionStatus !== 'testing',
            'bg-neutral-300 text-neutral-500 cursor-wait': connectionStatus === 'testing',
          }"
          :disabled="connectionStatus === 'testing'"
          @click="testConnection"
        >
          {{ connectionStatus === 'testing' ? 'Testing...' : '🔌 Test' }}
        </button>
      </div>
      <div
        v-if="connectionInfo"
        class="rounded-lg px-3 py-2 text-sm"
        :class="{
          'bg-green-500/10 text-green-600 dark:text-green-400': connectionStatus === 'connected',
          'bg-red-500/10 text-red-600 dark:text-red-400': connectionStatus === 'failed',
        }"
      >
        {{ connectionInfo }}
      </div>

      <!-- CORS Troubleshooting -->
      <div
        v-if="isCorsError"
        class="flex flex-col gap-2 border border-amber-500/20 rounded-xl bg-amber-500/10 p-4"
      >
        <div class="flex items-center gap-2 text-sm text-amber-600 font-bold dark:text-amber-400">
          <div i-solar:shield-warning-bold-duotone />
          CORS Block Detected
        </div>
        <p class="text-xs text-neutral-600 leading-relaxed dark:text-neutral-400">
          ComfyUI blocks requests from other applications by default. To allow AIRI to connect, you must start ComfyUI with the <code class="rounded bg-neutral-200 px-1 dark:bg-neutral-800">--enable-cors-header "*"</code> flag.
        </p>
        <div class="break-all rounded bg-black/5 p-2 text-[10px] text-neutral-500 font-mono dark:bg-black/20 dark:text-neutral-400">
          python main.py --enable-cors-header "*"
        </div>
      </div>
    </div>

    <!-- Saved Workflows -->
    <div class="flex flex-col gap-4">
      <div class="flex items-center justify-between">
        <h3 class="text-lg text-neutral-700 font-medium dark:text-neutral-300">
          Workflow Templates
        </h3>
        <button
          class="rounded-lg bg-indigo-500/10 px-3 py-1.5 text-sm text-indigo-600 font-medium transition-colors hover:bg-indigo-500/20 dark:text-indigo-400"
          @click="showUploadSection = !showUploadSection"
        >
          {{ showUploadSection ? '✕ Cancel' : '+ Upload Workflow' }}
        </button>
      </div>

      <!-- Workflow List -->
      <div v-if="comfyuiSavedWorkflows.length === 0 && !showUploadSection" class="text-sm text-neutral-400 italic dark:text-neutral-500">
        No workflows uploaded yet. Click "Upload Workflow" to import a workflow_api.json from ComfyUI.
      </div>

      <div v-for="wf in comfyuiSavedWorkflows" :key="wf.id" class="flex flex-col gap-2 border border-neutral-200 rounded-lg p-3 dark:border-neutral-700">
        <div class="flex items-center gap-3">
          <input
            type="radio"
            :checked="comfyuiActiveWorkflow === wf.id"
            name="active-workflow"
            class="accent-indigo-500"
            @change="comfyuiActiveWorkflow = wf.id"
          >
          <div class="flex-1 cursor-pointer" @click="expandedWorkflow = (expandedWorkflow === wf.id ? null : wf.id)">
            <div class="flex items-center gap-2 text-sm text-neutral-800 font-medium dark:text-neutral-200">
              {{ wf.name }}
              <div v-if="expandedWorkflow === wf.id" class="i-solar:alt-arrow-down-linear text-xs opacity-50" />
              <div v-else class="i-solar:alt-arrow-right-linear text-xs opacity-50" />
            </div>
            <div class="text-xs text-neutral-400 dark:text-neutral-500">
              {{ Object.keys(wf.workflow).length }} nodes · {{ Object.values(wf.exposedFields).reduce((n, arr) => n + arr.length, 0) }} exposed fields
            </div>
          </div>
          <button
            class="text-xs text-red-400 transition-colors hover:text-red-500"
            @click="removeWorkflow(wf.id)"
          >
            Remove
          </button>
        </div>

        <!-- Expanded Details -->
        <div v-if="expandedWorkflow === wf.id" class="mt-2 flex flex-col gap-5 border-t border-neutral-100 pb-2 pl-7 pt-4 dark:border-neutral-800">
          <!-- Exposed Fields Visualization -->
          <div class="flex flex-col gap-2">
            <div class="text-[10px] text-neutral-400 font-bold tracking-wider uppercase dark:text-neutral-500">
              Exposed Parameters
            </div>
            <div class="flex flex-wrap gap-3">
              <div v-for="(fields, nodeTitle) in wf.exposedFields" :key="nodeTitle" class="flex flex-col gap-1.5">
                <div class="self-start rounded bg-neutral-100 px-1.5 py-0.5 text-[9px] text-neutral-500 font-mono dark:bg-neutral-800 dark:text-neutral-400">
                  {{ nodeTitle }}
                </div>
                <div class="flex flex-wrap gap-1 pl-1">
                  <div v-for="f in fields" :key="f" class="group relative flex items-center gap-1.5 text-[10px] text-indigo-600 font-medium dark:text-indigo-400">
                    <div class="size-1 rounded-full bg-indigo-400" />
                    {{ f }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Integration Snippet -->
          <div class="flex flex-col gap-3 border border-indigo-500/10 rounded-xl bg-neutral-900/5 p-4 dark:bg-indigo-500/5">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 text-xs text-indigo-600 font-bold dark:text-indigo-400">
                <div i-solar:code-bold-duotone />
                Artistry Config Snippet
              </div>
              <button
                class="rounded bg-indigo-500/10 px-2 py-1 text-[10px] text-indigo-600 transition-colors hover:bg-indigo-500/20 dark:text-indigo-400"
                @click="copyToClipboard(generateExampleJson(wf))"
              >
                Copy JSON
              </button>
            </div>

            <div class="text-[11px] text-neutral-700 leading-relaxed font-mono dark:text-neutral-300">
              <div class="flex gap-2">
                <span class="text-indigo-500 dark:text-indigo-400">{</span>
              </div>
              <div class="pl-4">
                <span class="text-emerald-600 dark:text-emerald-400">"template"</span>: <span class="text-amber-600">"{{ wf.id }}"</span>,
              </div>
              <div v-for="(fields, nodeTitle, index) in wf.exposedFields" :key="nodeTitle" class="pl-4">
                <span class="text-emerald-600 dark:text-emerald-400">"{{ nodeTitle }}"</span>: {
                <div v-for="(f, fIndex) in fields" :key="f" class="pl-4">
                  <span class="text-emerald-600 dark:text-emerald-400">"{{ f }}"</span>: <span class="text-blue-500">"..."</span>{{ fIndex < fields.length - 1 ? ',' : '' }}
                </div>
                }<span>{{ index < Object.keys(wf.exposedFields).length - 1 ? ',' : '' }}</span>
              </div>
              <div class="flex gap-2">
                <span class="text-indigo-500 dark:text-indigo-400">}</span>
              </div>
            </div>

            <div class="mt-1 flex items-center gap-2 pb-1 text-[10px] text-neutral-400 italic">
              <div i-solar:info-circle-linear />
              Paste this into your AIRI Card artistry config to override these nodes.
            </div>
          </div>
        </div>
      </div>

      <!-- Upload Section -->
      <div v-if="showUploadSection" class="flex flex-col gap-4 border-2 border-indigo-300 rounded-xl border-dashed p-5 dark:border-indigo-700">
        <div class="flex flex-col items-center gap-2">
          <div class="text-3xl text-indigo-400">
            📋
          </div>
          <div class="text-sm text-neutral-600 dark:text-neutral-400">
            Drop or select a <code class="rounded bg-neutral-100 px-1 dark:bg-neutral-800">workflow_api.json</code> file
          </div>
          <input
            type="file"
            accept=".json"
            class="text-sm"
            @change="handleFileUpload"
          >
        </div>

        <div v-if="uploadError" class="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {{ uploadError }}
        </div>

        <!-- Field Picker -->
        <div v-if="parsedWorkflow" class="flex flex-col gap-3">
          <FieldInput
            v-model="pendingWorkflowName"
            label="Workflow Name"
            description="Give this workflow a recognizable name"
            placeholder="e.g. Anime Text2Img"
          />

          <div class="text-sm text-neutral-600 font-medium dark:text-neutral-400">
            Select fields to expose to the AI agent:
          </div>

          <div class="max-h-80 flex flex-col gap-2 overflow-y-auto">
            <div
              v-for="node in parsedWorkflow.nodes"
              :key="node.id"
              class="border border-neutral-200 rounded-lg p-3 dark:border-neutral-700"
            >
              <div class="mb-1 text-sm text-neutral-700 font-medium dark:text-neutral-300">
                {{ node.title }}
                <span class="ml-1 text-xs text-neutral-400">({{ node.type }})</span>
              </div>
              <div class="flex flex-col gap-1 pl-3">
                <label
                  v-for="(val, field) in node.inputs"
                  :key="String(field)"
                  class="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800"
                >
                  <input
                    type="checkbox"
                    class="accent-indigo-500"
                    :checked="isFieldSelected(node.title, String(field))"
                    @change="toggleField(node.title, String(field))"
                  >
                  <span class="text-neutral-600 font-mono dark:text-neutral-400">{{ field }}</span>
                  <span class="truncate text-neutral-400 dark:text-neutral-500">= {{ formatValue(val) }}</span>
                </label>
              </div>
            </div>
          </div>

          <div class="mt-2 flex items-center justify-between">
            <span class="text-xs text-neutral-400">{{ totalExposed }} field(s) exposed</span>
            <button
              class="rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white font-medium transition-colors disabled:cursor-not-allowed hover:bg-indigo-600 disabled:opacity-40"
              :disabled="!pendingWorkflowName.trim() || totalExposed === 0"
              @click="saveWorkflow"
            >
              Save Workflow
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.providers.provider.comfyui.settings.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
