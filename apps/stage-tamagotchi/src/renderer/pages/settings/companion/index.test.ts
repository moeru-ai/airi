// @vitest-environment jsdom

import type { SourcesOptions } from 'electron'
import type { App, MaybeRefOrGetter } from 'vue'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref, toValue } from 'vue'

let mountedApp: App<Element> | null = null
let sourcesOptions: MaybeRefOrGetter<SourcesOptions> | null = null
let hasScreenCapturePermission = false
let emitPermissionGranted: (() => void) | null = null

const refetchSources = vi.fn()
const cleanup = vi.fn()
const requestPermission = vi.fn()

function createCompanionStore() {
  return {
    enabled: ref(false),
    intervalSeconds: ref(60),
    sourceKind: ref<'screen' | 'window'>('screen'),
    sourceId: ref(''),
    promptTemplate: ref(''),
    logs: ref([]),
    runtimeSnapshot: ref(null),
    setPromptTemplate: vi.fn(),
    clearLogs: vi.fn(),
  }
}

let companionStore = createCompanionStore()

vi.mock('pinia', () => ({
  storeToRefs: (store: object) => store,
}))

vi.mock('@proj-airi/stage-ui/stores/settings', () => ({
  useSettingsGeneral: () => ({
    language: ref('en'),
  }),
}))

vi.mock('@proj-airi/ui', () => {
  const Stub = {
    render: () => null,
  }

  return {
    Button: Stub,
    FieldCheckbox: Stub,
    FieldCombobox: Stub,
    FieldRange: Stub,
    FieldTextArea: Stub,
    SelectTab: Stub,
  }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../../../components/WithScreenCapture.vue', async () => {
  const { defineComponent } = await import('vue')

  return {
    default: defineComponent({
      emits: ['permissionGranted'],
      setup(_props, { emit, slots }) {
        emitPermissionGranted = () => emit('permissionGranted')
        return () => slots.default?.({
          hasPermissions: hasScreenCapturePermission,
          requestPermission,
        })
      },
    }),
  }
})

vi.mock('../../../composables/use-vision-screen-capture', () => ({
  useVisionScreenCapture: (options: MaybeRefOrGetter<SourcesOptions>) => {
    sourcesOptions = options
    return {
      sources: ref([]),
      isRefetching: ref(false),
      refetchSources,
      cleanup,
    }
  },
}))

vi.mock('../../../stores/companion-mode', () => ({
  getDefaultCompanionModePromptTemplate: () => 'Observe the screen.',
  isCompanionModeScreenSource: (sourceId: string) => sourceId.startsWith('screen:'),
  isCompanionModeSourceAllowedForKind: (sourceId: string, sourceKind: 'screen' | 'window') => sourceKind === 'window'
    ? sourceId.startsWith('screen:') || sourceId.startsWith('window:')
    : sourceId.startsWith('screen:'),
  isCompanionModeWindowSource: (sourceId: string) => sourceId.startsWith('window:'),
  resolveCompanionModeRuntimeStatus: () => ({
    kind: 'idle',
    lastCaptureAt: null,
    lastSkippedAt: null,
    lastError: null,
  }),
  useCompanionModeStore: () => companionStore,
}))

describe('companion mode settings', async () => {
  const { default: CompanionModeSettingsPage } = await import('./index.vue')

  beforeEach(() => {
    companionStore = createCompanionStore()
    sourcesOptions = null
    hasScreenCapturePermission = false
    emitPermissionGranted = null
    refetchSources.mockReset()
    cleanup.mockReset()
    requestPermission.mockReset()
  })

  afterEach(() => {
    mountedApp?.unmount()
    mountedApp = null
    emitPermissionGranted = null
  })

  it('waits for screen-recording permission before loading picker sources', async () => {
    const host = document.createElement('div')
    mountedApp = createApp(CompanionModeSettingsPage)
    mountedApp.mount(host)
    await nextTick()

    expect(sourcesOptions).not.toBeNull()
    expect(toValue(sourcesOptions!)).toMatchObject({
      thumbnailSize: {
        width: 0,
        height: 0,
      },
    })
    expect(refetchSources).not.toHaveBeenCalled()

    companionStore.sourceKind.value = 'window'
    await nextTick()
    expect(refetchSources).not.toHaveBeenCalled()

    hasScreenCapturePermission = true
    expect(emitPermissionGranted).not.toBeNull()
    emitPermissionGranted?.()
    await nextTick()

    expect(refetchSources).toHaveBeenCalledTimes(1)
  })
})
