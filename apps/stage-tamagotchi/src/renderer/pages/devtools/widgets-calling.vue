<script setup lang="ts">
import { Button, FieldInput, FieldSelect, FieldTextArea } from '@proj-airi/ui'
import { computed, reactive, ref } from 'vue'

import { widgetsAdd, widgetsClear, widgetsOpenWindow, widgetsPrepareWindow, widgetsRemove, widgetsUpdate } from '../../../shared/eventa'
import { useElectronEventaInvoke } from '../../composables/electron-vueuse/use-electron-eventa-context'

type SizePreset = 's' | 'm' | 'l' | 'custom'

interface FormState {
  id: string
  componentName: string
  sizePreset: SizePreset
  customCols: string
  customRows: string
  ttlSeconds: string
  componentProps: string
}

const openWidgets = useElectronEventaInvoke(widgetsOpenWindow)
const prepareWindow = useElectronEventaInvoke(widgetsPrepareWindow)
const addWidget = useElectronEventaInvoke(widgetsAdd)
const updateWidget = useElectronEventaInvoke(widgetsUpdate)
const removeWidget = useElectronEventaInvoke(widgetsRemove)
const clearWidgets = useElectronEventaInvoke(widgetsClear)

const defaultWeatherProps = {
  city: 'Tokyo',
  temperature: '15°C',
  condition: 'Light rain',
  high: '18°C',
  low: '12°C',
  humidity: '72%',
  wind: '3 m/s',
  precipitation: '40%',
}

const defaultMapProps = {
  title: 'To Haneda Airport',
  eta: '38 min',
  distance: '27 km',
  mode: 'Transit',
  status: 'Light traffic',
  originLabel: 'You',
  destinationLabel: 'HND',
  accent: '#22c55e',
  origin: { x: 18, y: 70 },
  destination: { x: 82, y: 26 },
  route: [
    { x: 18, y: 70 },
    { x: 28, y: 62 },
    { x: 42, y: 58 },
    { x: 54, y: 50 },
    { x: 64, y: 42 },
    { x: 74, y: 34 },
    { x: 82, y: 26 },
  ],
  stops: [
    { x: 28, y: 62, label: 'Mita' },
    { x: 54, y: 50, label: 'Shinagawa' },
    { x: 74, y: 34, label: 'Tenkubashi' },
  ],
}

const form = reactive<FormState>({
  id: '',
  componentName: 'weather',
  sizePreset: 'm',
  customCols: '2',
  customRows: '1',
  ttlSeconds: '',
  componentProps: JSON.stringify(defaultWeatherProps, null, 2),
})

const busy = ref(false)
const lastAction = ref('')
const lastError = ref('')

const sizePresetOptions: Array<{ label: string, value: SizePreset }> = [
  { label: 'Small (s)', value: 's' },
  { label: 'Medium (m)', value: 'm' },
  { label: 'Large (l)', value: 'l' },
  { label: 'Custom grid', value: 'custom' },
]

const resolvedSize = computed(() => {
  if (form.sizePreset !== 'custom')
    return form.sizePreset

  const parsedCols = Number.parseInt(form.customCols, 10)
  const parsedRows = Number.parseInt(form.customRows, 10)
  const cols = Number.isFinite(parsedCols) && parsedCols > 0 ? parsedCols : 1
  const rows = Number.isFinite(parsedRows) && parsedRows > 0 ? parsedRows : 1

  return { cols, rows }
})

function resetFeedback() {
  lastAction.value = ''
  lastError.value = ''
}

function parseProps() {
  try {
    return JSON.parse(form.componentProps || '{}')
  }
  catch (error) {
    throw new Error(`Invalid JSON in component props: ${(error as Error).message}`)
  }
}

function parseTtl() {
  if (!form.ttlSeconds)
    return 0

  const ttl = Number(form.ttlSeconds)
  if (Number.isNaN(ttl) || ttl < 0)
    throw new Error('TTL must be a positive number of seconds.')

  return Math.floor(ttl * 1000)
}

async function prepareAndOpenWindow(targetId?: string) {
  try {
    const id = await prepareWindow(targetId ? { id: targetId } : {})
    await openWidgets({ id })
    return id
  }
  catch (error) {
    console.warn('Failed to prepare widget window', error)
    throw error
  }
}

async function handleAdd() {
  if (!form.componentName.trim()) {
    lastError.value = 'Component name is required.'
    return
  }

  resetFeedback()
  busy.value = true

  try {
    const componentProps = parseProps()
    const ttlMs = parseTtl()
    const desiredId = form.id || undefined
    const preparedId = await prepareAndOpenWindow(desiredId)
    const createdId = await addWidget({ id: preparedId, componentName: form.componentName.trim(), componentProps, size: resolvedSize.value, ttlMs })

    const resolvedId = createdId || preparedId
    if (!form.id && resolvedId)
      form.id = resolvedId

    lastAction.value = `Spawned widget${resolvedId ? ` (${resolvedId})` : ''}.`
  }
  catch (error) {
    lastError.value = (error as Error).message || 'Failed to spawn widget.'
  }
  finally {
    busy.value = false
  }
}

async function handleUpdate() {
  if (!form.id) {
    lastError.value = 'Widget id is required to update.'
    return
  }

  resetFeedback()
  busy.value = true

  try {
    const componentProps = parseProps()
    await updateWidget({
      id: form.id,
      componentProps,
    })
    lastAction.value = `Updated widget (${form.id}).`
  }
  catch (error) {
    lastError.value = (error as Error).message || 'Failed to update widget.'
  }
  finally {
    busy.value = false
  }
}

async function handleRemove() {
  if (!form.id) {
    lastError.value = 'Widget id is required to remove.'
    return
  }

  resetFeedback()
  busy.value = true

  try {
    await removeWidget({ id: form.id })
    lastAction.value = `Removed widget (${form.id}).`
  }
  catch (error) {
    lastError.value = (error as Error).message || 'Failed to remove widget.'
  }
  finally {
    busy.value = false
  }
}

async function handleClear() {
  resetFeedback()
  busy.value = true

  try {
    await clearWidgets()
    lastAction.value = 'Cleared all widgets.'
  }
  catch (error) {
    lastError.value = (error as Error).message || 'Failed to clear widgets.'
  }
  finally {
    busy.value = false
  }
}

function applyWeatherPreset() {
  form.componentName = 'weather'
  form.sizePreset = 'm'
  form.customCols = '2'
  form.customRows = '1'
  form.componentProps = JSON.stringify(defaultWeatherProps, null, 2)
  form.ttlSeconds = ''
  resetFeedback()
}

function applyMapPreset() {
  form.componentName = 'map'
  form.sizePreset = 'custom'
  form.customCols = '3'
  form.customRows = '2'
  form.componentProps = JSON.stringify(defaultMapProps, null, 2)
  form.ttlSeconds = ''
  resetFeedback()
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <p class="text-sm text-neutral-500 dark:text-neutral-300">
          Spawn widgets in the overlay window to validate component-calling integrations.
        </p>
        <p class="text-xs text-neutral-400 dark:text-neutral-500">
          Provide an existing id to mutate a widget or leave blank to spawn a new one.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          :disabled="busy"
          @click="applyWeatherPreset"
        >
          Weather Preset
        </Button>
        <Button
          variant="secondary"
          :disabled="busy"
          @click="applyMapPreset"
        >
          Map Preset
        </Button>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <FieldInput
        v-model="form.id"
        label="Widget Id"
        description="Optional. Fills automatically after spawning."
        placeholder="Auto-generated if empty"
        :required="false"
      />
      <FieldInput
        v-model="form.componentName"
        label="Component Name"
        description="Matches a component registered in the widgets overlay."
        placeholder="e.g. weather"
      />
    </div>

    <div class="grid gap-4 md:grid-cols-3">
      <FieldSelect
        v-model="form.sizePreset"
        label="Size Preset"
        description="Choose a preset or opt into custom spans."
        :options="sizePresetOptions"
        placeholder="Select size"
      />
      <FieldInput
        v-model="form.customCols"
        label="Custom Columns"
        description="Used when preset is Custom."
        type="number"
        min="1"
        :disabled="form.sizePreset !== 'custom'"
      />
      <FieldInput
        v-model="form.customRows"
        label="Custom Rows"
        description="Used when preset is Custom."
        type="number"
        min="1"
        :disabled="form.sizePreset !== 'custom'"
      />
    </div>

    <FieldInput
      v-model="form.ttlSeconds"
      label="TTL (seconds)"
      description="0 keeps the widget alive until closed manually."
      type="number"
      min="0"
      placeholder="0"
      :required="false"
    />

    <FieldTextArea
      v-model="form.componentProps"
      label="Component Props (JSON)"
      description="Provide valid JSON for the widget props."
      :rows="8"
    />

    <div class="flex flex-wrap gap-3">
      <Button
        variant="primary"
        :disabled="busy"
        @click="handleAdd"
      >
        Spawn / Replace
      </Button>
      <Button
        variant="secondary"
        :disabled="busy"
        @click="handleUpdate"
      >
        Update Props
      </Button>
      <Button
        variant="secondary"
        :disabled="busy"
        @click="handleRemove"
      >
        Remove Widget
      </Button>
      <Button
        class="ml-auto"
        variant="danger"
        :disabled="busy"
        @click="handleClear"
      >
        Clear All
      </Button>
    </div>

    <div class="text-sm space-y-1">
      <p v-if="lastAction" class="text-primary-200/90">
        {{ lastAction }}
      </p>
      <p v-if="lastError" class="text-danger-200/90">
        {{ lastError }}
      </p>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.devtools.pages.widgets-calling.title
  subtitleKey: tamagotchi.settings.devtools.title
</route>
