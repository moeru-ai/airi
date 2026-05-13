<script setup lang="ts">
import type {
  ShortcutAccelerator,
  ShortcutBinding,
  ShortcutRegistrationResult,
} from '@proj-airi/stage-shared/global-shortcut'

import type { ElectronShortcutTriggerPhase } from '../../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { getElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { formatAccelerator, parseAccelerator } from '@proj-airi/stage-shared/global-shortcut'
import { Button, FieldCheckbox, FieldInput } from '@proj-airi/ui'
import { onMounted, onUnmounted, reactive, ref } from 'vue'

import {
  electronShortcutList,
  electronShortcutRegister,
  electronShortcutTriggered,
  electronShortcutUnregister,
  electronShortcutUnregisterAll,
} from '../../../shared/eventa'

interface FormState {
  id: string
  acceleratorText: string
  receiveKeyUps: boolean
  description: string
}

interface TriggerLogEntry {
  time: number
  id: string
  phase: ElectronShortcutTriggerPhase
}

const TRIGGER_LOG_LIMIT = 50

const form = reactive<FormState>({
  id: '',
  acceleratorText: 'Mod+Shift+K',
  receiveKeyUps: false,
  description: '',
})

const lastResult = ref<ShortcutRegistrationResult | null>(null)
const lastError = ref('')
const active = ref<ShortcutBinding[]>([])
const triggers = ref<TriggerLogEntry[]>([])
const busy = ref(false)

const registerShortcut = useElectronEventaInvoke(electronShortcutRegister)
const unregisterShortcut = useElectronEventaInvoke(electronShortcutUnregister)
const unregisterAllShortcuts = useElectronEventaInvoke(electronShortcutUnregisterAll)
const listShortcuts = useElectronEventaInvoke(electronShortcutList)

async function refreshList() {
  try {
    active.value = await listShortcuts()
  }
  catch (error) {
    lastError.value = errorMessageFrom(error) ?? 'Failed to list bindings'
  }
}

function tryParseAccelerator(): ShortcutAccelerator | null {
  try {
    return parseAccelerator(form.acceleratorText)
  }
  catch (error) {
    lastError.value = errorMessageFrom(error) ?? 'Invalid accelerator'
    return null
  }
}

async function handleRegister() {
  lastError.value = ''
  if (!form.id.trim()) {
    lastError.value = 'Id is required.'
    return
  }
  const accelerator = tryParseAccelerator()
  if (!accelerator)
    return

  busy.value = true
  try {
    lastResult.value = await registerShortcut({
      id: form.id.trim(),
      accelerator,
      scope: 'global',
      receiveKeyUps: form.receiveKeyUps,
      description: form.description.trim() || undefined,
    })
    await refreshList()
  }
  catch (error) {
    lastError.value = errorMessageFrom(error) ?? 'Register failed'
  }
  finally {
    busy.value = false
  }
}

async function handleUnregister(id: string) {
  busy.value = true
  try {
    await unregisterShortcut({ id })
    await refreshList()
  }
  catch (error) {
    lastError.value = errorMessageFrom(error) ?? `Unregister failed for "${id}"`
  }
  finally {
    busy.value = false
  }
}

async function handleUnregisterAll() {
  busy.value = true
  try {
    await unregisterAllShortcuts()
    await refreshList()
  }
  catch (error) {
    lastError.value = errorMessageFrom(error) ?? 'Unregister all failed'
  }
  finally {
    busy.value = false
  }
}

function clearLog() {
  triggers.value = []
}

function pushTrigger(entry: TriggerLogEntry) {
  triggers.value.unshift(entry)
  if (triggers.value.length > TRIGGER_LOG_LIMIT)
    triggers.value.length = TRIGGER_LOG_LIMIT
}

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString()
}

let disposeTriggerListener: (() => void) | undefined

onMounted(async () => {
  const context = getElectronEventaContext()
  disposeTriggerListener = context.on(electronShortcutTriggered, (event) => {
    const payload = event?.body
    if (!payload)
      return
    pushTrigger({ time: Date.now(), id: payload.id, phase: payload.phase })
  })
  await refreshList()
})

onUnmounted(() => {
  disposeTriggerListener?.()
  disposeTriggerListener = undefined
})
</script>

<template>
  <div class="pb-6 space-y-6">
    <p class="text-sm text-neutral-500 dark:text-neutral-300">
      Register a global shortcut, watch trigger events fire, exercise the
      driver's refusal paths (duplicate id, conflict, unsupported).
    </p>

    <div class="space-y-3">
      <div class="grid gap-4 md:grid-cols-2">
        <FieldInput
          v-model="form.id"
          label="Id"
          description="Stable handle, e.g. toggle-main-window"
          placeholder="my-shortcut"
        />
        <FieldInput
          v-model="form.acceleratorText"
          label="Accelerator"
          description="e.g. Mod+Shift+K, Cmd+Shift+1, Ctrl+Alt+F12"
          placeholder="Mod+Shift+K"
        />
      </div>
      <div class="grid gap-4 md:grid-cols-2">
        <FieldInput
          v-model="form.description"
          label="Description"
          description="Surfaced in settings UI."
          :required="false"
        />
        <FieldCheckbox
          v-model="form.receiveKeyUps"
          label="Receive key-ups"
          description="Asks the driver to also emit on release. Electron driver refuses with 'unsupported'."
        />
      </div>
      <div class="flex flex-wrap gap-3">
        <Button variant="primary" :disabled="busy" @click="handleRegister">
          Register
        </Button>
        <Button variant="secondary" :disabled="busy" @click="refreshList">
          Refresh List
        </Button>
        <Button
          class="ml-auto"
          variant="danger"
          :disabled="busy"
          @click="handleUnregisterAll"
        >
          Unregister All
        </Button>
      </div>
      <div v-if="lastError" class="text-danger-200/90 text-sm">
        {{ lastError }}
      </div>
      <div
        v-if="lastResult"
        :class="[
          'rounded p-3 space-y-1',
          'text-xs font-mono',
          'bg-neutral-100 dark:bg-neutral-800',
        ]"
      >
        <div>id: {{ lastResult.id }}</div>
        <div>ok: {{ lastResult.ok }}</div>
        <div v-if="!lastResult.ok">
          reason: {{ lastResult.reason }}
        </div>
      </div>
    </div>

    <section class="space-y-2">
      <h3 class="text-sm text-neutral-700 font-semibold dark:text-neutral-200">
        Active bindings ({{ active.length }})
      </h3>
      <div
        v-if="active.length === 0"
        :class="[
          'rounded-2xl border-2 border-dashed border-neutral-200/70 dark:border-neutral-800/40',
          'px-4 py-6',
          'text-sm text-neutral-500',
        ]"
      >
        No bindings registered yet.
      </div>
      <div
        v-else
        :class="[
          'overflow-hidden rounded-lg',
          'border border-neutral-200 dark:border-neutral-800',
        ]"
      >
        <table class="w-full text-sm">
          <thead class="bg-neutral-100 dark:bg-neutral-900">
            <tr>
              <th class="px-3 py-2 text-left">
                Id
              </th>
              <th class="px-3 py-2 text-left">
                Accelerator
              </th>
              <th class="px-3 py-2 text-left">
                Receive Key-Ups
              </th>
              <th class="px-3 py-2 text-left">
                Description
              </th>
              <th class="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="b in active"
              :key="b.id"
              class="border-t border-neutral-200 dark:border-neutral-800"
            >
              <td class="px-3 py-2 font-mono">
                {{ b.id }}
              </td>
              <td class="px-3 py-2 font-mono">
                {{ formatAccelerator(b.accelerator) }}
              </td>
              <td class="px-3 py-2">
                {{ b.receiveKeyUps ? 'yes' : 'no' }}
              </td>
              <td class="px-3 py-2 text-neutral-500 dark:text-neutral-400">
                {{ b.description || '—' }}
              </td>
              <td class="px-3 py-2 text-right">
                <Button
                  size="sm"
                  variant="secondary"
                  :disabled="busy"
                  @click="handleUnregister(b.id)"
                >
                  Unregister
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="space-y-2">
      <div class="flex items-center justify-between">
        <h3 class="text-sm text-neutral-700 font-semibold dark:text-neutral-200">
          Trigger log ({{ triggers.length }})
        </h3>
        <Button
          size="sm"
          variant="secondary"
          :disabled="triggers.length === 0"
          @click="clearLog"
        >
          Clear log
        </Button>
      </div>
      <div
        v-if="triggers.length === 0"
        :class="[
          'rounded-2xl border-2 border-dashed border-neutral-200/70 dark:border-neutral-800/40',
          'px-4 py-6',
          'text-sm text-neutral-500',
        ]"
      >
        No triggers yet. Register a shortcut and press the combo.
      </div>
      <div
        v-else
        :class="[
          'overflow-hidden rounded-lg',
          'border border-neutral-200 dark:border-neutral-800',
        ]"
      >
        <table class="w-full text-sm">
          <thead class="bg-neutral-100 dark:bg-neutral-900">
            <tr>
              <th class="px-3 py-2 text-left">
                Time
              </th>
              <th class="px-3 py-2 text-left">
                Id
              </th>
              <th class="px-3 py-2 text-left">
                Phase
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(t, i) in triggers"
              :key="`${t.time}-${i}`"
              class="border-t border-neutral-200 dark:border-neutral-800"
            >
              <td class="px-3 py-2 font-mono">
                {{ formatTime(t.time) }}
              </td>
              <td class="px-3 py-2 font-mono">
                {{ t.id }}
              </td>
              <td class="px-3 py-2 font-mono">
                {{ t.phase }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  title: Global Shortcut
  subtitleKey: tamagotchi.settings.devtools.title
</route>
