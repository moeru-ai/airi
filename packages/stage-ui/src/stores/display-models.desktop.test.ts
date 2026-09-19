import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useDisplayModelsStore } from './display-models'

vi.mock('@proj-airi/stage-ui/stores/display-model-assets', () => ({
  presetLive2dProUrl: 'file:///hiyori_pro_zh.zip',
  presetLive2dFreeUrl: 'https://dist.ayaka.moe/live2d-models/hiyori_free_zh.zip',
  presetLive2dPreview: 'file:///hiyori-preview.png',
  presetVrmAvatarAUrl: 'https://dist.ayaka.moe/vrm-models/VRoid-Hub/AvatarSample-A/AvatarSample_A.vrm',
  presetVrmAvatarAPreview: 'file:///avatar-a-preview.png',
  presetVrmAvatarBUrl: 'https://dist.ayaka.moe/vrm-models/VRoid-Hub/AvatarSample-B/AvatarSample_B.vrm',
  presetVrmAvatarBPreview: 'file:///avatar-b-preview.png',
}))

vi.mock('localforage', () => ({
  default: {
    getItem: vi.fn(async () => undefined),
    iterate: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
    setItem: vi.fn(async (_key: string, value: unknown) => value),
  },
}))

describe('desktop display model delivery', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('keeps Hiyori Pro local and resolves optional presets remotely', async () => {
    const store = useDisplayModelsStore()
    await store.loadDisplayModelsFromIndexedDB()
    const defaultModel = store.displayModels.find(model => model.id === 'preset-live2d-1')
    const optionalModels = store.displayModels.filter(model => model.id !== 'preset-live2d-1')
    const defaultModelUrl = defaultModel?.type === 'url' ? defaultModel : undefined

    expect(defaultModel?.type).toBe('url')
    expect(defaultModelUrl?.url).toMatch(/^file:/)
    expect(optionalModels).toHaveLength(3)
    expect(optionalModels.every(model => model.type === 'url' && model.url.startsWith('https://'))).toBe(true)
  })
})
