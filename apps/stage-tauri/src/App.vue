<script setup lang="ts">
import { WidgetStage } from '@proj-airi/stage-ui/components/scenes'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useSettingsStageModel } from '@proj-airi/stage-ui/stores/settings'
import {
  noticeWindowEventa,
  widgetsClearEvent,
  widgetsFetch,
  widgetsRemoveEvent,
  widgetsRenderEvent,
  widgetsUpdateEvent,
  type RequestWindowActionDefault,
  type RequestWindowPending,
  type WidgetSnapshot,
} from '@proj-airi/tauri-eventa'
import { useElectronEventaContext, useElectronEventaInvoke, useElectronWindowBounds } from '@proj-airi/tauri-vueuse'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useStageWindowLifecycleStore } from './stores/stage-window-lifecycle'
import { resolveStageTauriWindowRoute } from './window-routes'

const runtime = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window ? 'Tauri' : 'Browser'
const currentWindow = runtime === 'Tauri' ? getCurrentWindow() : undefined
const currentWindowLabel = currentWindow?.label ?? 'main'
const currentHash = ref(typeof window !== 'undefined' ? window.location.hash : '')
const windowRoute = computed(() => resolveStageTauriWindowRoute(currentHash.value, currentWindowLabel))
const stageReady = ref(false)
const eventaContext = runtime === 'Tauri' ? useElectronEventaContext() : undefined
const windowBounds = runtime === 'Tauri' ? useElectronWindowBounds() : undefined
const boundsStatus = computed(() => {
  if (!windowBounds) return 'browser'
  return `${windowBounds.x.value}, ${windowBounds.y.value}, ${windowBounds.width.value} x ${windowBounds.height.value}`
})
const notifyNoticeMounted = eventaContext
  ? useElectronEventaInvoke(noticeWindowEventa.pageMounted, eventaContext.value)
  : undefined
const notifyNoticeUnmounted = eventaContext
  ? useElectronEventaInvoke(noticeWindowEventa.pageUnmounted, eventaContext.value)
  : undefined
const sendNoticeAction = eventaContext
  ? useElectronEventaInvoke(noticeWindowEventa.windowAction, eventaContext.value)
  : undefined
const fetchWidget = eventaContext ? useElectronEventaInvoke(widgetsFetch, eventaContext.value) : undefined

const displayModelsStore = useDisplayModelsStore()
const settingsStageModelStore = useSettingsStageModel()
const stageWindowLifecycleStore = useStageWindowLifecycleStore()
const lifecycleStatus = computed(() => {
  const state = stageWindowLifecycleStore.windowLifecycle
  return `${state.reason}; focused=${state.focused}; minimized=${state.minimized}; visible=${state.visible}`
})

function refreshHashRoute() {
  currentHash.value = window.location.hash
}

function routeQueryValue(route: string, key: string): string | null {
  const query = route.split('?')[1]
  if (!query) return null
  return new URLSearchParams(query).get(key)
}

function routePath(route: string): string {
  return route.split('?')[0] || '/'
}

function isNoticeRoute(route: string): boolean {
  const path = routePath(route)
  return path === '/notice' || path.startsWith('/notice/')
}

function isWidgetsRoute(route: string): boolean {
  return routePath(route) === '/widgets'
}

const noticePending = ref<RequestWindowPending | null>(null)
const noticeBusy = ref(false)
const noticeStatus = computed(() => {
  if (!isNoticeRoute(windowRoute.value.route)) return ''
  if (noticePending.value) return `Request: ${noticePending.value.id}`
  return 'Waiting for request'
})
const widgetSnapshot = ref<WidgetSnapshot | null>(null)
const widgetLoading = ref(false)
const widgetId = computed(() => routeQueryValue(windowRoute.value.route, 'id'))
let mountedNoticeId: string | null = null
let widgetEventCleanups: Array<() => void> = []

async function notifyPreviousNoticeUnmounted(id: string | null) {
  if (!id || !notifyNoticeUnmounted) return
  try {
    await notifyNoticeUnmounted({ id })
  } catch {
    // The window may already be closing; the Rust side treats this as best effort.
  }
}

async function syncNoticeRoute(route: string, previousRoute?: string) {
  const previousNoticeId = previousRoute && isNoticeRoute(previousRoute) ? routeQueryValue(previousRoute, 'id') : null
  const currentNoticeId = routeQueryValue(route, 'id')

  if (previousNoticeId && previousNoticeId !== currentNoticeId) {
    await notifyPreviousNoticeUnmounted(previousNoticeId)
  }

  noticePending.value = null
  mountedNoticeId = currentNoticeId

  if (!notifyNoticeMounted) return

  try {
    const pending = await notifyNoticeMounted({ id: currentNoticeId ?? undefined })
    if (windowRoute.value.route !== route) return
    noticePending.value = pending ?? null
    mountedNoticeId = pending?.id ?? currentNoticeId
  } catch {
    noticePending.value = null
  }
}

async function syncWidgetRoute(route: string) {
  const id = routeQueryValue(route, 'id')
  widgetSnapshot.value = null
  widgetLoading.value = Boolean(id)

  if (!id || !fetchWidget) {
    widgetLoading.value = false
    return
  }

  try {
    const snapshot = await fetchWidget({ id })
    if (windowRoute.value.route !== route) return
    widgetSnapshot.value = snapshot ?? null
  } catch {
    widgetSnapshot.value = null
  } finally {
    if (windowRoute.value.route === route) widgetLoading.value = false
  }
}

function applyWidgetSnapshot(snapshot: WidgetSnapshot) {
  if (snapshot.id !== widgetId.value) return
  widgetSnapshot.value = snapshot
  widgetLoading.value = false
}

function applyWidgetUpdate(update: Partial<WidgetSnapshot> & { id: string }) {
  if (update.id !== widgetId.value) return
  if (!widgetSnapshot.value) {
    void syncWidgetRoute(windowRoute.value.route)
    return
  }

  widgetSnapshot.value = {
    ...widgetSnapshot.value,
    componentProps: update.componentProps ?? widgetSnapshot.value.componentProps,
    size: update.size ?? widgetSnapshot.value.size,
    windowSize: update.windowSize ?? widgetSnapshot.value.windowSize,
    ttlMs: update.ttlMs ?? widgetSnapshot.value.ttlMs,
  }
}

function registerWidgetEventListeners() {
  if (!eventaContext) return
  const context = eventaContext.value
  widgetEventCleanups = [
    context.on(widgetsRenderEvent, (event: { body?: WidgetSnapshot }) => {
      if (event.body) applyWidgetSnapshot(event.body)
    }),
    context.on(widgetsUpdateEvent, (event: { body?: Partial<WidgetSnapshot> & { id: string } }) => {
      if (event.body) applyWidgetUpdate(event.body)
    }),
    context.on(widgetsRemoveEvent, (event: { body?: { id: string } }) => {
      if (event.body?.id !== widgetId.value) return
      widgetSnapshot.value = null
      widgetLoading.value = false
    }),
    context.on(widgetsClearEvent, () => {
      widgetSnapshot.value = null
      widgetLoading.value = false
    }),
  ]
}

async function syncSecondaryRoute(route = windowRoute.value, previousRoute?: string) {
  if (route.kind === 'stage') return

  if (!isNoticeRoute(route.route) && previousRoute && isNoticeRoute(previousRoute)) {
    await notifyPreviousNoticeUnmounted(routeQueryValue(previousRoute, 'id') ?? mountedNoticeId)
    noticePending.value = null
    mountedNoticeId = null
  }

  if (isNoticeRoute(route.route)) {
    await syncNoticeRoute(route.route, previousRoute)
  }

  if (isWidgetsRoute(route.route)) {
    await syncWidgetRoute(route.route)
  } else {
    widgetSnapshot.value = null
    widgetLoading.value = false
  }
}

async function handleNoticeAction(action: RequestWindowActionDefault) {
  const id = noticePending.value?.id ?? routeQueryValue(windowRoute.value.route, 'id')
  if (!id || !sendNoticeAction) {
    await currentWindow?.close()
    return
  }

  noticeBusy.value = true
  try {
    await sendNoticeAction({ id, action })
    noticePending.value = null
    mountedNoticeId = null
  } finally {
    noticeBusy.value = false
  }
}

watch(
  windowRoute,
  (route, previous) => {
    void syncSecondaryRoute(route, previous?.route)
  },
  { immediate: true },
)

onMounted(async () => {
  window.addEventListener('hashchange', refreshHashRoute)
  registerWidgetEventListeners()

  if (runtime === 'Tauri') {
    await stageWindowLifecycleStore.initializeWindowLifecycleBridge()
  }

  if (windowRoute.value.kind !== 'stage') return

  await displayModelsStore.initialize()
  await displayModelsStore.loadDisplayModelsFromIndexedDB()
  await settingsStageModelStore.initializeStageModel()
  stageReady.value = true
})

onBeforeUnmount(() => {
  window.removeEventListener('hashchange', refreshHashRoute)
  void notifyPreviousNoticeUnmounted(mountedNoticeId)
  for (const cleanup of widgetEventCleanups) cleanup()
  widgetEventCleanups = []
})
</script>

<template>
  <main class="shell">
    <section v-if="windowRoute.kind === 'stage'" class="stage-shell" aria-label="AIRI character stage">
      <WidgetStage v-if="stageReady" class="stage" />
      <div class="status-panel" data-tauri-drag-region>
        <p class="eyebrow">AIRI</p>
        <h1>Character stage</h1>
        <p class="status">Runtime: {{ runtime }}</p>
        <p class="status status-compact">Bounds: {{ boundsStatus }}</p>
        <p class="status status-compact">Lifecycle: {{ lifecycleStatus }}</p>
      </div>
    </section>
    <section v-else class="secondary-window" :data-window-label="windowRoute.label">
      <div class="secondary-toolbar" data-tauri-drag-region>
        <p class="eyebrow">AIRI</p>
        <h1>{{ windowRoute.title }}</h1>
      </div>
      <dl class="secondary-details">
        <div>
          <dt>Window</dt>
          <dd>{{ windowRoute.label }}</dd>
        </div>
        <div>
          <dt>Route</dt>
          <dd>{{ windowRoute.route }}</dd>
        </div>
        <div>
          <dt>Runtime</dt>
          <dd>{{ runtime }}</dd>
        </div>
        <div>
          <dt>Bounds</dt>
          <dd>{{ boundsStatus }}</dd>
        </div>
        <div>
          <dt>Lifecycle</dt>
          <dd>{{ lifecycleStatus }}</dd>
        </div>
      </dl>
      <div v-if="isNoticeRoute(windowRoute.route)" class="secondary-panel">
        <div>
          <p class="panel-title">Notice</p>
          <p class="panel-text">{{ noticeStatus }}</p>
        </div>
        <div class="secondary-actions">
          <button type="button" :disabled="!noticePending || noticeBusy" @click="handleNoticeAction('confirm')">
            Confirm
          </button>
          <button type="button" :disabled="noticeBusy" @click="handleNoticeAction('close')">Close</button>
        </div>
      </div>
      <div v-else-if="isWidgetsRoute(windowRoute.route)" class="secondary-panel">
        <div>
          <p class="panel-title">Widget</p>
          <p class="panel-text">{{ widgetId ? `Request: ${widgetId}` : 'No widget id' }}</p>
        </div>
        <pre v-if="widgetSnapshot" class="widget-snapshot">{{ JSON.stringify(widgetSnapshot, null, 2) }}</pre>
        <p v-else class="panel-text">{{ widgetLoading ? 'Loading widget' : 'Waiting for widget snapshot' }}</p>
      </div>
    </section>
  </main>
</template>
