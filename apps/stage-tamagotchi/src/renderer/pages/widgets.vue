<script setup lang="ts">
import type { WidgetSnapshot } from '../../shared/eventa'

import { computed, defineAsyncComponent, defineComponent, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { widgetsClearEvent, widgetsFetch, widgetsRemove, widgetsRemoveEvent, widgetsRenderEvent, widgetsUpdateEvent } from '../../shared/eventa'
import { useElectronEventaContext, useElectronEventaInvoke } from '../composables/electron-vueuse'

type SizePreset = 's' | 'm' | 'l' | { cols?: number, rows?: number }

interface WidgetItem {
  id: string
  componentName: string
  componentProps: Record<string, any>
  size: SizePreset
  ttlMs: number
}

const route = useRoute()

const widgetId = computed(() => {
  const raw = route.query.id
  if (typeof raw === 'string')
    return raw
  if (Array.isArray(raw))
    return raw[0]
  return undefined
})

const widget = ref<WidgetItem | null>(null)
const loading = ref(false)

const context = useElectronEventaContext()
const removeWidgetInvoke = useElectronEventaInvoke(widgetsRemove)
const fetchWidget = useElectronEventaInvoke(widgetsFetch)

let ttlTimer: ReturnType<typeof setTimeout> | undefined

function clearTtl() {
  if (ttlTimer) {
    clearTimeout(ttlTimer)
    ttlTimer = undefined
  }
}

async function requestRemoval(id: string) {
  clearTtl()
  try {
    await removeWidgetInvoke({ id })
  }
  catch (error) {
    console.warn('Failed to remove widget', error)
  }
}

function applySnapshot(snapshot: WidgetSnapshot) {
  clearTtl()
  widget.value = {
    id: snapshot.id,
    componentName: snapshot.componentName,
    componentProps: snapshot.componentProps ?? {},
    size: snapshot.size ?? 'm',
    ttlMs: snapshot.ttlMs ?? 0,
  }

  if (snapshot.ttlMs && snapshot.ttlMs > 0) {
    ttlTimer = setTimeout(() => requestRemoval(snapshot.id), snapshot.ttlMs)
  }
}

async function requestSnapshot(id: string) {
  loading.value = true
  try {
    const snapshot = await fetchWidget({ id })
    if (widgetId.value !== id)
      return
    if (snapshot)
      applySnapshot(snapshot)
    else
      widget.value = null
  }
  catch (error) {
    console.warn('Failed to fetch widget snapshot', error)
  }
  finally {
    if (widgetId.value === id)
      loading.value = false
  }
}

watch(widgetId, (id) => {
  clearTtl()
  widget.value = null
  loading.value = false
  if (!id)
    return
  requestSnapshot(id)
}, { immediate: true })

onMounted(() => {
  try {
    context.value.on(widgetsRenderEvent, (evt) => {
      const body = evt?.body
      if (!body || body.id !== widgetId.value)
        return
      applySnapshot(body)
    })
  }
  catch {}

  try {
    context.value.on(widgetsUpdateEvent, (evt) => {
      const body = evt?.body
      if (!body || body.id !== widgetId.value)
        return

      if (!widget.value) {
        requestSnapshot(body.id)
        return
      }

      widget.value = {
        ...widget.value,
        componentProps: body.componentProps ?? widget.value.componentProps,
      }
    })
  }
  catch {}

  try {
    context.value.on(widgetsRemoveEvent, (evt) => {
      const body = evt?.body
      if (!body || body.id !== widgetId.value)
        return
      clearTtl()
      widget.value = null
      loading.value = false
    })
  }
  catch {}

  try {
    context.value.on(widgetsClearEvent, () => {
      clearTtl()
      widget.value = null
      loading.value = false
    })
  }
  catch {}
})

onBeforeUnmount(() => {
  clearTtl()
})

const Registry: Record<string, ReturnType<typeof defineAsyncComponent>> = {
  map: defineAsyncComponent(async () => (await import('../widgets/map')).Map),
  weather: defineAsyncComponent(async () => (await import('../widgets/weather')).Weather),
}

const GenericWidget = defineComponent({
  name: 'GenericWidget',
  props: { title: { type: String, required: true }, modelValue: { type: Object, default: () => ({}) } },
  setup(props) {
    return () => h('div', { class: 'h-full w-full flex flex-col gap-2 rounded-xl border border-neutral-200/30 bg-[rgba(28,28,28,0.72)] p-3 text-neutral-100 shadow-[0_8px_20px_rgba(0,0,0,0.35)] backdrop-blur-md dark:border-neutral-700/30' }, [
      h('div', { class: 'flex items-center justify-between' }, [
        h('div', { class: 'text-sm font-medium opacity-90' }, props.title),
      ]),
      h('div', { class: 'pointer-events-auto max-h-full min-h-0 flex-1 overflow-auto rounded-md bg-black/10 p-2 text-[11px]' }, [
        h('pre', { class: 'whitespace-pre-wrap break-words opacity-80' }, JSON.stringify(props.modelValue, null, 2)),
      ]),
    ])
  },
})

function resolveWidgetComponent(name: string) {
  const key = name?.trim()
  if (!key)
    return GenericWidget

  if (Registry[key])
    return Registry[key]

  const normalized = key.toLowerCase()
  if (Registry[normalized])
    return Registry[normalized]

  return GenericWidget
}

function handleClose() {
  clearTtl()
  window.close()
}
</script>

<template>
  <div class="h-full w-full">
    <div v-if="!widgetId" class="h-full flex items-center justify-center">
      <div class="border border-neutral-200/20 rounded-xl bg-neutral-900/40 px-4 py-3 text-sm text-neutral-200/80 backdrop-blur">
        Missing widget id. Launch the window via a component call to populate this view.
      </div>
    </div>
    <div v-else-if="widget" class="relative h-full">
      <button
        class="absolute right-2 top-2 z-10 size-7 rounded-full bg-black/40 text-xs text-white transition hover:bg-black/60"
        title="Close widget"
        @click="handleClose"
      >
        ✕
      </button>
      <component
        :is="resolveWidgetComponent(widget.componentName)"
        :key="widget.id"
        :title="widget.componentName"
        :model-value="widget.componentProps"
        :size="widget.size"
        v-bind="widget.componentProps"
      />
    </div>
    <div v-else class="h-full flex items-center justify-center">
      <div class="border border-neutral-200/20 rounded-xl bg-neutral-900/40 px-4 py-3 text-sm text-neutral-200/80 backdrop-blur">
        {{ loading ? 'Loading widget...' : `Waiting for widget data for "${widgetId}"` }}
      </div>
    </div>
  </div>
  <div class="[-webkit-app-region:drag] pointer-events-none absolute left-1/2 top-2 h-[14px] w-[36px] rounded-[10px] bg-[rgba(125,125,125,0.28)] backdrop-blur-[6px] -translate-x-1/2">
    <div class="absolute left-1/2 top-1/2 h-[3px] w-4 rounded-full bg-[rgba(255,255,255,0.85)] -translate-x-1/2 -translate-y-1/2" />
  </div>
</template>

<style scoped>
</style>

<route lang="yaml">
meta:
  layout: stage
</route>
