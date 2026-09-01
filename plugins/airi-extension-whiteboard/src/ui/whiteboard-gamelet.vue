<script setup lang="ts">
import type { StageGameletController } from '@proj-airi/plugin-sdk-stage/gamelet/controller'
import type { HostDataRecord } from '@proj-airi/plugin-sdk/plugin-host'

import type { WhiteboardDocument, WhiteboardPoint } from '../model'

import { errorMessageFrom } from '@moeru/std'
import { Button, IconButton, Input, Select } from '@proj-airi/ui'
import { computed, onMounted, onUnmounted, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { executeWhiteboardCommand } from '../commands'
import { WhiteboardStore } from '../model'
import { loadWhiteboardDocument, saveWhiteboardDocument } from '../storage'

const props = defineProps<{
  bindingId: string
  controller?: StageGameletController
  pendingRequests?: Array<{ requestId: string, payload: HostDataRecord }>
}>()
const emit = defineEmits<{
  iframeRequestResult: [result: {
    id: string
    requestId: string
    ok: boolean
    result?: HostDataRecord
    error?: string
  }]
}>()

const { t } = useI18n()
const svgElement = useTemplateRef<SVGSVGElement>('canvas')
const store = new WhiteboardStore()
const document = shallowRef<WhiteboardDocument>(store.document)
const draftPoints = shallowRef<WhiteboardPoint[]>([])
const draftText = shallowRef('')
const strokeColor = shallowRef('#1f2937')
const strokeWidth = shallowRef(4)
const error = shallowRef<string>()
const loaded = shallowRef(false)
const handledRequestIds = new Set<string>()

const activeCanvas = computed(() => document.value.canvases.find(canvas => canvas.id === document.value.activeCanvasId))
const canvasOptions = computed(() => document.value.canvases.map(canvas => ({ label: canvas.name, value: canvas.id })))
const draftPointsValue = computed(() => draftPoints.value.map(point => `${point.x},${point.y}`).join(' '))

function synchronize() {
  document.value = store.document
  saveWhiteboardDocument(window.localStorage, document.value)
}

function runCommand(input: HostDataRecord) {
  try {
    const result = executeWhiteboardCommand(store, input)
    synchronize()
    error.value = undefined
    return result
  }
  catch (cause) {
    const message = errorMessageFrom(cause) ?? String(cause)
    error.value = message
    throw cause
  }
}

function createCanvas() {
  runCommand({ type: 'create_canvas', name: t('stage.whiteboard.new-canvas') })
}

function selectCanvas(canvasId: string | undefined) {
  if (!canvasId || canvasId === document.value.activeCanvasId) {
    return
  }
  store.selectCanvas(canvasId)
  synchronize()
}

function deleteCanvas() {
  if (!activeCanvas.value) {
    return
  }
  runCommand({ type: 'delete_canvas', canvasId: activeCanvas.value.id })
}

function pointFromEvent(event: PointerEvent): WhiteboardPoint | undefined {
  const canvas = activeCanvas.value
  const svg = svgElement.value
  if (!canvas || !svg) {
    return undefined
  }
  const rect = svg.getBoundingClientRect()
  if (!rect.width || !rect.height) {
    return undefined
  }
  return {
    x: (event.clientX - rect.left) * canvas.width / rect.width,
    y: (event.clientY - rect.top) * canvas.height / rect.height,
  }
}

function startPath(event: PointerEvent) {
  const point = pointFromEvent(event)
  if (!point) {
    return
  }
  svgElement.value?.setPointerCapture(event.pointerId)
  draftPoints.value = [point]
}

function extendPath(event: PointerEvent) {
  if (!draftPoints.value.length) {
    return
  }
  const point = pointFromEvent(event)
  if (point) {
    draftPoints.value = [...draftPoints.value, point]
  }
}

function commitPath(event: PointerEvent) {
  if (draftPoints.value.length >= 2) {
    runCommand({
      type: 'add_path',
      points: draftPoints.value,
      color: strokeColor.value,
      width: strokeWidth.value,
    })
  }
  if (svgElement.value?.hasPointerCapture(event.pointerId)) {
    svgElement.value.releasePointerCapture(event.pointerId)
  }
  draftPoints.value = []
}

function addText() {
  const canvas = activeCanvas.value
  if (!canvas || !draftText.value.trim()) {
    return
  }
  runCommand({
    type: 'add_text',
    value: draftText.value,
    x: canvas.width / 2,
    y: canvas.height / 2,
    color: strokeColor.value,
  })
  draftText.value = ''
}

function undo() {
  if (store.undo()) {
    synchronize()
  }
}

function redo() {
  if (store.redo()) {
    synchronize()
  }
}

function onKeydown(event: KeyboardEvent) {
  if ((!event.metaKey && !event.ctrlKey) || event.key.toLowerCase() !== 'z') {
    return
  }
  if (event.target instanceof HTMLInputElement) {
    return
  }
  event.preventDefault()
  if (event.shiftKey) {
    redo()
    return
  }
  undo()
}

function processPendingRequests() {
  if (!loaded.value) {
    return
  }
  for (const request of props.pendingRequests ?? []) {
    if (handledRequestIds.has(request.requestId)) {
      continue
    }
    handledRequestIds.add(request.requestId)
    try {
      emit('iframeRequestResult', {
        id: props.bindingId,
        requestId: request.requestId,
        ok: true,
        result: runCommand(request.payload),
      })
    }
    catch (cause) {
      emit('iframeRequestResult', {
        id: props.bindingId,
        requestId: request.requestId,
        ok: false,
        error: errorMessageFrom(cause) ?? String(cause),
      })
    }
  }
}

watch(() => props.pendingRequests, processPendingRequests, { deep: false })

let disconnect: (() => void) | undefined

onMounted(() => {
  store.replace(loadWhiteboardDocument(window.localStorage))
  document.value = store.document
  loaded.value = true
  disconnect = props.controller?.connect(props.bindingId, async payload => runCommand(payload))
  processPendingRequests()
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  disconnect?.()
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <section :class="['h-full', 'min-h-0', 'flex', 'flex-col', 'gap-3', 'p-3', 'bg-neutral-100', 'dark:bg-neutral-950']">
    <header :class="['flex', 'flex-wrap', 'items-center', 'gap-2']">
      <Select
        :model-value="document.activeCanvasId"
        :options="canvasOptions"
        :placeholder="t('stage.whiteboard.select-canvas')"
        :class="['min-w-[11.25rem]', 'flex-1']"
        @update:model-value="selectCanvas"
      />
      <Button
        :label="t('stage.whiteboard.new-canvas')"
        color="primary"
        size="sm"
        @click="createCanvas"
      />
      <IconButton
        icon="i-lucide-trash-2"
        :aria-label="t('stage.whiteboard.delete-canvas')"
        :disabled="!activeCanvas"
        :class="['h-8', 'w-8', 'text-red-500']"
        @click="deleteCanvas"
      />
      <IconButton
        icon="i-lucide-undo-2"
        :aria-label="t('stage.whiteboard.undo')"
        :class="['h-8', 'w-8']"
        @click="undo"
      />
      <IconButton
        icon="i-lucide-redo-2"
        :aria-label="t('stage.whiteboard.redo')"
        :class="['h-8', 'w-8']"
        @click="redo"
      />
    </header>

    <div :class="['flex', 'flex-wrap', 'items-center', 'gap-2']">
      <input
        v-model="strokeColor"
        type="color"
        :aria-label="t('stage.whiteboard.stroke-color')"
        :class="['h-9', 'w-10', 'cursor-pointer', 'rounded-lg', 'border-0', 'bg-transparent']"
      >
      <Input v-model="strokeWidth" type="number" :class="['w-20']" />
      <Input
        v-model="draftText"
        :placeholder="t('stage.whiteboard.text-placeholder')"
        :class="['min-w-[11rem]', 'flex-1']"
        @keyup.enter="addText"
      />
      <Button :label="t('stage.whiteboard.add-text')" size="sm" @click="addText" />
    </div>

    <p v-if="error" :class="['text-sm', 'text-red-600', 'dark:text-red-300']">
      {{ error }}
    </p>

    <div :class="['min-h-0', 'flex-1', 'overflow-auto', 'rounded-xl', 'border', 'border-neutral-200', 'bg-white', 'shadow-sm', 'dark:border-neutral-800', 'dark:bg-neutral-900']">
      <svg
        v-if="activeCanvas"
        ref="canvas"
        :viewBox="`0 0 ${activeCanvas.width} ${activeCanvas.height}`"
        :class="['block', 'min-h-full', 'min-w-full', 'touch-none', 'select-none']"
        :style="{ backgroundColor: activeCanvas.background }"
        @pointerdown="startPath"
        @pointermove="extendPath"
        @pointerup="commitPath"
        @pointercancel="commitPath"
      >
        <polyline
          v-for="path in activeCanvas.paths"
          :key="path.id"
          :points="path.points.map(point => `${point.x},${point.y}`).join(' ')"
          fill="none"
          :stroke="path.color"
          :stroke-width="path.width"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <text
          v-for="text in activeCanvas.texts"
          :key="text.id"
          :x="text.x"
          :y="text.y"
          :fill="text.color"
          :font-size="text.fontSize"
        >{{ text.value }}</text>
        <polyline
          v-if="draftPoints.length"
          :points="draftPointsValue"
          fill="none"
          :stroke="strokeColor"
          :stroke-width="strokeWidth"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <div v-else :class="['h-full', 'min-h-64', 'flex', 'items-center', 'justify-center', 'text-sm', 'text-neutral-500']">
        {{ t('stage.whiteboard.empty') }}
      </div>
    </div>
  </section>
</template>
