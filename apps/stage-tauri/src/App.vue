<script setup lang="ts">
import { WidgetStage } from '@proj-airi/stage-ui/components/scenes'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { usePluginHostInspectorStore } from '@proj-airi/stage-ui/stores/devtools/plugin-host-debug'
import { useSettingsStageModel } from '@proj-airi/stage-ui/stores/settings'
import {
  autoUpdater,
  electronAutoUpdaterStateChanged,
  electronPluginsInspect,
  electronPluginsList,
  electronPluginsLoad,
  electronPluginsLoadEnabled,
  electronPluginsSetAutoReload,
  electronPluginsSetEnabled,
  electronPluginsUnload,
  noticeWindowEventa,
  widgetsClearEvent,
  widgetsFetch,
  widgetsRemoveEvent,
  widgetsRenderEvent,
  widgetsUpdateEvent,
  type AutoUpdaterState,
  type RequestWindowActionDefault,
  type RequestWindowPending,
  type WidgetSnapshot,
} from '@proj-airi/tauri-eventa'
import { useElectronEventaContext, useElectronEventaInvoke, useElectronWindowBounds } from '@proj-airi/tauri-vueuse'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import ServerChannelQrCard from './components/ServerChannelQrCard.vue' // deepsource: ignore
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
const getAutoUpdaterState = eventaContext
  ? useElectronEventaInvoke(autoUpdater.getState, eventaContext.value)
  : undefined
const checkAutoUpdaterUpdates = eventaContext
  ? useElectronEventaInvoke(autoUpdater.checkForUpdates, eventaContext.value)
  : undefined

const pluginHostInspectorStore = usePluginHostInspectorStore()
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

function isAboutRoute(route: string): boolean {
  const path = routePath(route)
  return path === '/about' || path === '/about/updater'
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
const updaterState = ref<AutoUpdaterState>({
  currentVersion: '',
  isUpdateAvailable: false,
  status: 'idle',
})
const updaterChecking = ref(false)
const updaterVersion = computed(
  () => updaterState.value.currentVersion || updaterState.value.info?.version || 'unknown',
)
const updaterRequestActive = computed(
  () =>
    updaterChecking.value || updaterState.value.status === 'checking' || updaterState.value.status === 'downloading',
)
type UpdaterStatusResolver = (state: AutoUpdaterState) => string

const updaterStatusResolvers: Record<AutoUpdaterState['status'], UpdaterStatusResolver> = {
  idle: ({ isUpdateAvailable }) => (isUpdateAvailable ? 'Update available' : 'Idle'),
  disabled: () => 'Updater disabled',
  checking: () => 'Checking',
  available: () => 'Update available',
  'not-available': () => 'No updates available',
  downloading: () => 'Downloading update',
  downloaded: () => 'Update downloaded',
  error: ({ error }) => (error?.message ? `Updater error: ${error.message}` : 'Updater error'),
}

function resolveUpdaterStatus(state: AutoUpdaterState): string {
  return updaterStatusResolvers[state.status](state)
}

const updaterStatus = computed(() => resolveUpdaterStatus(updaterState.value))
let mountedNoticeId: string | null = null
let widgetEventCleanups: Array<() => void> = []
let autoUpdaterEventCleanup: (() => void) | undefined

function noticeIdForRoute(route?: string): string | null {
  if (!route || !isNoticeRoute(route)) return null
  return routeQueryValue(route, 'id')
}

function clearNoticeState(nextMountedId: string | null = null) {
  noticePending.value = null
  mountedNoticeId = nextMountedId
}

function clearWidgetState() {
  widgetSnapshot.value = null
  widgetLoading.value = false
}

async function notifyPreviousNoticeUnmounted(id: string | null) {
  if (!id || !notifyNoticeUnmounted) return
  try {
    await notifyNoticeUnmounted({ id })
  } catch {
    // The window may already be closing; the Rust side treats this as best effort.
  }
}

async function fetchMountedNotice(id: string | null) {
  if (!notifyNoticeMounted) return null

  try {
    return await notifyNoticeMounted({ id: id ?? undefined })
  } catch {
    return null
  }
}

async function unmountChangedNoticeRoute(previousRoute: string | undefined, currentNoticeId: string | null) {
  const previousNoticeId = noticeIdForRoute(previousRoute)
  if (!previousNoticeId || previousNoticeId === currentNoticeId) return
  await notifyPreviousNoticeUnmounted(previousNoticeId)
}

function applyMountedNotice(route: string, currentNoticeId: string | null, pending: RequestWindowPending | null) {
  if (windowRoute.value.route !== route) return

  noticePending.value = pending
  mountedNoticeId = pending?.id ?? currentNoticeId
}

async function syncNoticeRoute(route: string, previousRoute?: string) {
  const currentNoticeId = routeQueryValue(route, 'id')
  await unmountChangedNoticeRoute(previousRoute, currentNoticeId)
  clearNoticeState(currentNoticeId)
  applyMountedNotice(route, currentNoticeId, await fetchMountedNotice(currentNoticeId))
}

async function fetchWidgetSnapshot(id: string) {
  if (!fetchWidget) return null

  try {
    return await fetchWidget({ id })
  } catch {
    return null
  }
}

function beginWidgetRouteSync(route: string) {
  const id = routeQueryValue(route, 'id')
  clearWidgetState()
  widgetLoading.value = Boolean(id)
  return id
}

async function loadWidgetRouteSnapshot(route: string, id: string | null) {
  if (!id) return null

  const snapshot = await fetchWidgetSnapshot(id)
  if (windowRoute.value.route !== route) return null

  widgetSnapshot.value = snapshot ?? null
  widgetLoading.value = false
  return widgetSnapshot.value
}

async function syncWidgetRoute(route: string): Promise<WidgetSnapshot | null> {
  return loadWidgetRouteSnapshot(route, beginWidgetRouteSync(route))
}

async function refreshUpdaterState() {
  if (!getAutoUpdaterState) return

  try {
    updaterState.value = await getAutoUpdaterState()
  } catch (error) {
    updaterState.value = {
      ...updaterState.value,
      error: { message: error instanceof Error ? error.message : String(error) },
      status: 'error',
    }
  }
}

async function checkForUpdatesFromAbout() {
  if (!checkAutoUpdaterUpdates || updaterRequestActive.value) return

  updaterChecking.value = true
  updaterState.value = { ...updaterState.value, status: 'checking' }
  try {
    updaterState.value = await checkAutoUpdaterUpdates()
  } catch (error) {
    updaterState.value = {
      ...updaterState.value,
      error: { message: error instanceof Error ? error.message : String(error) },
      status: 'error',
    }
  } finally {
    updaterChecking.value = false
  }
}

function applyWidgetSnapshot(snapshot: WidgetSnapshot) {
  if (snapshot.id !== widgetId.value) return
  widgetSnapshot.value = snapshot
  widgetLoading.value = false
}

function mergeWidgetSnapshot(
  snapshot: WidgetSnapshot,
  update: Partial<WidgetSnapshot> & { id: string },
): WidgetSnapshot {
  return {
    ...snapshot,
    componentProps: update.componentProps ?? snapshot.componentProps,
    size: update.size ?? snapshot.size,
    windowSize: update.windowSize ?? snapshot.windowSize,
    ttlMs: update.ttlMs ?? snapshot.ttlMs,
  }
}

function currentWidgetSnapshotForUpdate(update: Partial<WidgetSnapshot> & { id: string }) {
  if (update.id !== widgetId.value) return null
  return widgetSnapshot.value
}

function applyWidgetUpdate(update: Partial<WidgetSnapshot> & { id: string }) {
  const snapshot = currentWidgetSnapshotForUpdate(update)
  if (!snapshot) {
    void syncWidgetRoute(windowRoute.value.route)
    return
  }

  widgetSnapshot.value = mergeWidgetSnapshot(snapshot, update)
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

function noticeIdForRouteTransition(route: string, previousRoute?: string) {
  if (isNoticeRoute(route) || !previousRoute || !isNoticeRoute(previousRoute)) return null
  return routeQueryValue(previousRoute, 'id') ?? mountedNoticeId
}

async function cleanupPreviousNoticeRoute(route: string, previousRoute?: string) {
  const id = noticeIdForRouteTransition(route, previousRoute)
  if (!id) return
  await notifyPreviousNoticeUnmounted(id)
  clearNoticeState()
}

async function syncWidgetRouteOrClear(route: string) {
  if (isWidgetsRoute(route)) {
    await syncWidgetRoute(route)
    return
  }

  clearWidgetState()
}

async function syncSecondaryRoute(route = windowRoute.value, previousRoute?: string) {
  await cleanupPreviousNoticeRoute(route.route, previousRoute)

  if (route.kind === 'stage') {
    clearWidgetState()
    return
  }

  if (isNoticeRoute(route.route)) {
    await syncNoticeRoute(route.route, previousRoute)
  }

  if (isAboutRoute(route.route)) {
    await refreshUpdaterState()
  }

  await syncWidgetRouteOrClear(route.route)
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
    clearNoticeState()
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

  if (eventaContext) {
    const ctx = eventaContext.value
    const listPlugins = useElectronEventaInvoke(electronPluginsList, ctx)
    const setPluginEnabled = useElectronEventaInvoke(electronPluginsSetEnabled, ctx)
    const setPluginAutoReload = useElectronEventaInvoke(electronPluginsSetAutoReload, ctx)
    const loadEnabledPlugins = useElectronEventaInvoke(electronPluginsLoadEnabled, ctx)
    const loadPlugin = useElectronEventaInvoke(electronPluginsLoad, ctx)
    const unloadPlugin = useElectronEventaInvoke(electronPluginsUnload, ctx)
    const inspectPluginHost = useElectronEventaInvoke(electronPluginsInspect, ctx)
    autoUpdaterEventCleanup = ctx.on(electronAutoUpdaterStateChanged, (event: { body?: AutoUpdaterState }) => {
      if (event.body) updaterState.value = event.body
    })

    pluginHostInspectorStore.setBridge({
      list: () => listPlugins(),
      setEnabled: (payload) => setPluginEnabled(payload),
      setAutoReload: (payload) => setPluginAutoReload(payload),
      loadEnabled: () => loadEnabledPlugins(),
      load: (payload) => loadPlugin(payload),
      unload: (payload) => unloadPlugin(payload),
      inspect: () => inspectPluginHost(),
    })

    void pluginHostInspectorStore.refreshAll().catch((error) => {
      console.warn('[App] Failed to refresh plugin host debug state:', error)
    })
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
  autoUpdaterEventCleanup?.()
  autoUpdaterEventCleanup = undefined
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
      <div v-if="windowRoute.kind === 'settings-connection'" class="secondary-panel secondary-panel-block">
        <ServerChannelQrCard />
      </div>
      <div v-else-if="isAboutRoute(windowRoute.route)" class="secondary-panel">
        <div>
          <p class="panel-title">Updater</p>
          <p class="panel-text">Current version: {{ updaterVersion }}</p>
          <p class="panel-text">Status: {{ updaterStatus }}</p>
          <p class="panel-text">Update available: {{ updaterState.isUpdateAvailable ? 'Yes' : 'No' }}</p>
        </div>
        <div class="secondary-actions">
          <button type="button" :disabled="updaterRequestActive" @click="checkForUpdatesFromAbout()">
            {{ updaterChecking ? 'Checking' : 'Check for updates' }}
          </button>
        </div>
      </div>
      <div v-else-if="isNoticeRoute(windowRoute.route)" class="secondary-panel">
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
