<script setup lang="ts">
import type { WidgetsIframeRequestPayload, WidgetsIframeRequestResultPayload, WidgetSnapshot, WidgetWindowSize } from '../../shared/eventa'

import { useElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useAnalytics } from '@proj-airi/stage-ui/composables'
import { computed, defineAsyncComponent, defineComponent, h, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

import { widgetsClearEvent, widgetsFetch, widgetsIframeRequestEvent, widgetsIframeRequestResultEvent, widgetsRemove, widgetsRemoveEvent, widgetsRenderEvent, widgetsUpdate, widgetsUpdateEvent } from '../../shared/eventa'

const { t } = useI18n()

type SizePreset = 's' | 'm' | 'l' | { cols?: number, rows?: number }

interface WidgetItem {
  id: string
  componentName: string
  componentProps: Record<string, any>
  alwaysOnTop: boolean
  size: SizePreset
  windowSize?: WidgetWindowSize
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
const updateWidgetInvoke = useElectronEventaInvoke(widgetsUpdate)
const pinUpdating = shallowRef(false)
const pendingIframeRequests = shallowRef<WidgetsIframeRequestPayload[]>([])
const eventDisposers: Array<() => void> = []

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
    alwaysOnTop: snapshot.alwaysOnTop ?? false,
    size: snapshot.size ?? 'm',
    windowSize: snapshot.windowSize,
    ttlMs: snapshot.ttlMs ?? 0,
  }

  if (snapshot.ttlMs && snapshot.ttlMs > 0) {
    ttlTimer = setTimeout(requestRemoval, snapshot.ttlMs, snapshot.id)
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

const { trackWidgetOpened } = useAnalytics()

watch(widgetId, (id) => {
  clearTtl()
  widget.value = null
  pendingIframeRequests.value = []
  loading.value = false
  if (!id)
    return
  trackWidgetOpened({ widget_id: id })
  requestSnapshot(id)
}, { immediate: true })

onMounted(() => {
  try {
    eventDisposers.push(context.value.on(widgetsIframeRequestEvent, (evt) => {
      const body = evt?.body
      if (!body || body.id !== widgetId.value)
        return
      pendingIframeRequests.value = [
        ...pendingIframeRequests.value,
        body,
      ]
    }))
  }
  catch {}

  try {
    eventDisposers.push(context.value.on(widgetsRenderEvent, (evt) => {
      const body = evt?.body
      if (!body || body.id !== widgetId.value)
        return
      applySnapshot(body)
    }))
  }
  catch {}

  try {
    eventDisposers.push(context.value.on(widgetsUpdateEvent, (evt) => {
      const body = evt?.body
      if (!body || body.id !== widgetId.value)
        return

      if (!widget.value) {
        requestSnapshot(body.id)
        return
      }

      applySnapshot({
        ...widget.value,
        componentProps: body.componentProps ?? widget.value.componentProps,
        alwaysOnTop: body.alwaysOnTop ?? widget.value.alwaysOnTop,
        size: body.size ?? widget.value.size,
        windowSize: body.windowSize ?? widget.value.windowSize,
        ttlMs: body.ttlMs ?? widget.value.ttlMs,
      })
    }))
  }
  catch {}

  try {
    eventDisposers.push(context.value.on(widgetsRemoveEvent, (evt) => {
      const body = evt?.body
      if (!body || body.id !== widgetId.value)
        return
      clearTtl()
      widget.value = null
      pendingIframeRequests.value = []
      loading.value = false
    }))
  }
  catch {}

  try {
    eventDisposers.push(context.value.on(widgetsClearEvent, () => {
      clearTtl()
      widget.value = null
      pendingIframeRequests.value = []
      loading.value = false
    }))
  }
  catch {}
})

onBeforeUnmount(() => {
  for (const dispose of eventDisposers.splice(0)) {
    dispose()
  }
  clearTtl()
})

const Registry: Record<string, ReturnType<typeof defineAsyncComponent>> = {
  'extension-ui': defineAsyncComponent(async () => (await import('../widgets/extension-ui')).ExtensionUi),
  'map': defineAsyncComponent(async () => (await import('../widgets/map')).Map),
  'weather': defineAsyncComponent(async () => (await import('../widgets/weather')).Weather),
  'artistry': defineAsyncComponent(async () => (await import('../widgets/artistry')).Artistry),
}

const GenericWidget = defineComponent({
  name: 'GenericWidget',
  props: { title: { type: String, required: true }, modelValue: { type: Object, default: () => ({}) } },
  setup(props) {
    return () => h('div', { class: 'h-full w-full flex flex-col gap-2 rounded-xl bg-[rgba(28,28,28,0.72)] p-3 text-neutral-100 shadow-[0_8px_20px_rgba(0,0,0,0.35)] backdrop-blur-md' }, [
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

async function toggleAlwaysOnTop() {
  if (!widget.value || pinUpdating.value)
    return

  const previous = widget.value.alwaysOnTop
  const next = !previous
  widget.value = {
    ...widget.value,
    alwaysOnTop: next,
  }
  pinUpdating.value = true

  try {
    await updateWidgetInvoke({ id: widget.value.id, alwaysOnTop: next })
  }
  catch (error) {
    widget.value = widget.value
      ? {
          ...widget.value,
          alwaysOnTop: previous,
        }
      : widget.value
    console.warn('Failed to update widget pin state', error)
  }
  finally {
    pinUpdating.value = false
  }
}

function handleIframeRequestResult(result: WidgetsIframeRequestResultPayload) {
  pendingIframeRequests.value = pendingIframeRequests.value.filter(request => request.requestId !== result.requestId)
  context.value.emit(widgetsIframeRequestResultEvent, result)
}
</script>

<template>
  <div :class="['relative h-full w-full']">
    <div :class="['absolute right-2 top-2 z-10 flex items-center gap-1']">
      <button
        v-if="widget"
        :class="[
          'size-7 flex items-center justify-center rounded-full text-white transition',
          widget.alwaysOnTop ? 'bg-primary-500/70 hover:bg-primary-500/85' : 'bg-black/40 hover:bg-black/60',
          pinUpdating ? 'cursor-wait opacity-70' : '',
        ]"
        :title="widget.alwaysOnTop ? t('tamagotchi.stage.controls-island.unpin-from-top') : t('tamagotchi.stage.controls-island.pin-on-top')"
        :aria-label="widget.alwaysOnTop ? t('tamagotchi.stage.controls-island.unpin-from-top') : t('tamagotchi.stage.controls-island.pin-on-top')"
        :disabled="pinUpdating"
        @click="toggleAlwaysOnTop"
      >
        <div
          :class="[
            'size-3',
            widget.alwaysOnTop ? 'i-solar:pin-bold' : 'i-solar:pin-linear opacity-80',
          ]"
        />
      </button>
      <button
        :class="[
          'size-7 rounded-full text-xs text-white transition',
          'bg-black/40 hover:bg-black/60',
        ]"
        :title="t('tamagotchi.stage.widgets.close')"
        :aria-label="t('tamagotchi.stage.widgets.close')"
        @click="handleClose"
      >
        <span class="size-6">×</span>
      </button>
    </div>
    <div v-if="!widgetId" :class="['h-full flex items-center justify-center p-6']">
      <div
        :class="[
          'max-w-xs flex flex-col items-center gap-3 text-center',
          'rounded-xl bg-neutral-900/40 px-5 py-4 backdrop-blur',
          'text-neutral-200/80',
        ]"
      >
        <div :class="['i-solar:widget-4-line-duotone size-8 text-neutral-300/80']" />
        <div :class="['flex flex-col gap-1']">
          <div :class="['text-sm font-medium text-neutral-100']">
            {{ t('tamagotchi.stage.widgets.empty.title') }}
          </div>
          <p :class="['m-0 text-xs leading-5']">
            {{ t('tamagotchi.stage.widgets.empty.description') }}
          </p>
        </div>
      </div>
    </div>
    <div v-else-if="widget" :class="['relative h-full']">
      <component
        :is="resolveWidgetComponent(widget.componentName)"
        :id="widget.id"
        :key="widget.id"
        :title="widget.componentName"
        :model-value="widget.componentProps"
        :size="widget.size"
        :pending-iframe-requests="pendingIframeRequests"
        v-bind="widget.componentProps"
        @iframe-request-result="handleIframeRequestResult"
      />
    </div>
    <div v-else :class="['h-full flex items-center justify-center']">
      <div :class="['rounded-xl bg-neutral-900/40 px-4 py-3 text-sm text-neutral-200/80 backdrop-blur']">
        {{ loading ? t('tamagotchi.stage.widgets.loading') : t('tamagotchi.stage.widgets.waiting', { id: widgetId }) }}
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
