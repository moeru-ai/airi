import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockDisplayModels = {
  'preset-live2d-1': {
    id: 'preset-live2d-1',
    format: 'live2d-zip',
    type: 'url',
    url: 'https://example.test/hiyori_pro_zh.zip',
    name: 'Hiyori (Pro)',
    importedAt: 1,
  },
  'preset-live2d-2': {
    id: 'preset-live2d-2',
    format: 'live2d-zip',
    type: 'url',
    url: 'https://example.test/hiyori_free_zh.zip',
    name: 'Hiyori (Free)',
    importedAt: 1,
  },
  'preset-vrm-1': {
    id: 'preset-vrm-1',
    format: 'vrm',
    type: 'url',
    url: 'https://example.test/AvatarSample_A.vrm',
    name: 'AvatarSample_A',
    importedAt: 1,
  },
  'preset-vrm-2': {
    id: 'preset-vrm-2',
    format: 'vrm',
    type: 'url',
    url: 'https://example.test/AvatarSample_B.vrm',
    name: 'AvatarSample_B',
    importedAt: 1,
  },
} as const

const mockGetDisplayModel = vi.fn(async (id: string) => mockDisplayModels[id as keyof typeof mockDisplayModels])

vi.mock('../display-models', () => ({
  DisplayModelFormat: {
    Live2dZip: 'live2d-zip',
    Live2dDirectory: 'live2d-directory',
    VRM: 'vrm',
    PMXZip: 'pmx-zip',
    PMXDirectory: 'pmx-directory',
    PMD: 'pmd',
  },
  useDisplayModelsStore: () => ({
    getDisplayModel: mockGetDisplayModel,
  }),
}))

const { useSettingsStageModel } = await import('./stage-model')

function createLocalStorageMock() {
  const backingStore = new Map<string, string>()

  return {
    getItem(key: string) {
      return backingStore.has(key) ? backingStore.get(key)! : null
    },
    setItem(key: string, value: string) {
      backingStore.set(key, String(value))
    },
    removeItem(key: string) {
      backingStore.delete(key)
    },
    clear() {
      backingStore.clear()
    },
    key(index: number) {
      return [...backingStore.keys()][index] ?? null
    },
    get length() {
      return backingStore.size
    },
  }
}

function stubPresetAssetAvailability(statusByAssetName: Record<string, boolean>) {
  const fetchSpy = vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    const matchedEntry = Object.entries(statusByAssetName)
      .find(([assetName]) => url.includes(assetName))

    return new Response(null, {
      status: matchedEntry?.[1] ? 200 : 404,
    })
  })

  vi.stubGlobal('fetch', fetchSpy)
  return fetchSpy
}

describe('settings stage model', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('localStorage', createLocalStorageMock())
    localStorage.clear()
    mockGetDisplayModel.mockClear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('falls back to the bundled free Live2D preset when the default preset is unavailable', async () => {
    stubPresetAssetAvailability({
      'hiyori_pro_zh.zip': false,
      'hiyori_free_zh.zip': true,
      'AvatarSample_A.vrm': true,
      'AvatarSample_B.vrm': true,
    })

    const store = useSettingsStageModel()
    await store.initializeStageModel()

    expect(store.stageModelSelected).toBe('preset-live2d-2')
    expect(store.stageModelRenderer).toBe('live2d')
    expect(store.stageModelSelectedUrl).toContain('hiyori_free_zh.zip')
  })

  it('falls back to a VRM preset when no Live2D preset remains available', async () => {
    stubPresetAssetAvailability({
      'hiyori_pro_zh.zip': false,
      'hiyori_free_zh.zip': false,
      'AvatarSample_A.vrm': true,
      'AvatarSample_B.vrm': true,
    })

    const store = useSettingsStageModel()
    store.stageModelSelected = 'preset-live2d-2'

    await store.fallbackStageModel('preset-live2d-2')

    expect(store.stageModelSelected).toBe('preset-vrm-1')
    expect(store.stageModelRenderer).toBe('vrm')
    expect(store.stageModelSelectedUrl).toContain('AvatarSample_A.vrm')
  })
})
