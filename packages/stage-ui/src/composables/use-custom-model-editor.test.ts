import type { ModelDiscoveryResult, ModelGenerationValidationResult } from '@proj-airi/core-agent'

import type { InferenceServiceProvider } from '../libs/providers/types'

import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, effectScope } from 'vue'

import { useProviderConfigStore } from '../stores/providers/config'
import { useCustomModelEditor } from './use-custom-model-editor'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

const mocks = vi.hoisted(() => ({
  client: {},
  token: null as string | null,
  service: {
    buildLocal: vi.fn(),
    fetchRemote: vi.fn(),
    createRemote: vi.fn(),
    deleteRemote: vi.fn(),
    patchConfigRemote: vi.fn(),
  },
}))

vi.mock('./api', () => ({ client: mocks.client }))
vi.mock('../stores/auth', () => ({
  useAuthStore: () => ({ token: mocks.token }),
}))
vi.mock('../services/inference-service-providers', () => ({ inferenceServiceProvidersService: mocks.service }))
vi.mock('../libs/providers', () => ({
  getDefinedProvider: vi.fn((id: string) => ({
    id,
    name: id === 'custom-model' ? 'Custom Model' : 'Other',
    configStorage: id === 'custom-model' ? 'local' : 'remote',
  })),
}))

const validConfig = {
  protocol: 'openai-chat-completions' as const,
  baseUrl: 'https://example.com/v1',
  generationPath: 'chat/completions',
  modelListPath: 'models',
  auth: { type: 'bearer' as const, secret: 'sk-live' },
  headers: { 'X-Token': 'secret-header' },
  models: [{ id: 'hand-filled' }],
}

const memoryStorage = new Map<string, string>()

function installEditor() {
  const app = createApp({})
  const pinia = createPinia()
  app.use(pinia)
  app.use(PiniaColada)
  setActivePinia(pinia)
  return useProviderConfigStore()
}

describe('use custom model editor', () => {
  beforeEach(() => {
    mocks.token = null
    memoryStorage.clear()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => memoryStorage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memoryStorage.set(key, value)
      },
      removeItem: (key: string) => {
        memoryStorage.delete(key)
      },
      clear: () => {
        memoryStorage.clear()
      },
      key: (index: number) => [...memoryStorage.keys()][index] ?? null,
      get length() {
        return memoryStorage.size
      },
    })
    mocks.service.buildLocal.mockImplementation(() => ({
      id: 'custom-1',
      definitionId: 'custom-model',
      name: 'Custom Model',
      persistence: 'local',
      config: {},
      status: 'unconfigured',
      configuredBy: 'user',
    } satisfies InferenceServiceProvider))
    mocks.service.fetchRemote.mockResolvedValue({})
  })

  async function createEditor(
    discover: () => Promise<ModelDiscoveryResult>,
    validateGeneration: () => Promise<ModelGenerationValidationResult>,
  ) {
    const store = installEditor()
    const created = await store.addProvider('custom-model', validConfig, { name: 'OpenCode Go' })
    const scope = effectScope()
    const editor = scope.run(() => useCustomModelEditor(created.id, { discover, validateGeneration }))
    if (!editor)
      throw new Error('Custom Model editor was not created.')
    return { store, created, editor, scope }
  }

  it('fills the model list from discovery when only a Base URL is set', async () => {
    // ROOT CAUSE:
    //
    // Discover called the persistence validator and then only listed new
    // models as optional add buttons. A new OpenCode Go draft blocked
    // GET /models, and a successful list did not fill the editor.
    //
    // Discovery now runs from a Base URL, writes parsed models into the
    // list, and selects the first model for the generation test.
    const store = installEditor()
    const created = await store.addProvider('custom-model')
    const discover = vi.fn(async () => ({
      status: 'success' as const,
      models: [{ id: 'opencode/grok-code', name: 'Grok' }, { id: 'opencode/minimax' }],
    }))
    const scope = effectScope()
    const editor = scope.run(() => useCustomModelEditor(created.id, {
      discover,
      validateGeneration: async () => ({ success: true }),
    }))
    if (!editor)
      throw new Error('Custom Model editor was not created.')

    expect(editor.canDiscover).toBe(false)
    editor.draft.baseUrl = 'https://opencode.ai/zen/go/v1'

    await editor.runDiscovery()

    expect(editor.canDiscover).toBe(true)
    expect(discover).toHaveBeenCalledOnce()
    expect(editor.discoveryStatus).toBe('success')
    expect(editor.draft.models).toEqual([
      { id: 'opencode/grok-code', name: 'Grok' },
      { id: 'opencode/minimax', name: '' },
    ])
    expect(editor.draft.selectedModelId).toBe('opencode/grok-code')
    expect(editor.discoveredNewModels).toEqual([])
    expect(editor.discoveryError).toBeUndefined()
    scope.stop()
  })

  it('keeps user model IDs when discovery succeeds, is empty, fails, or is unsupported', async () => {
    const { editor } = await createEditor(async () => ({
      status: 'success',
      models: [{ id: 'hand-filled' }, { id: 'discovered' }],
    }), async () => ({ success: true }))

    expect(editor.draft.models.map(model => model.id)).toContain('hand-filled')
    await editor.runDiscovery()
    expect(editor.discoveryStatus).toBe('success')
    expect(editor.draft.models.map(model => model.id)).toEqual(['hand-filled', 'discovered'])
    expect(editor.draft.selectedModelId).toBe('hand-filled')
    expect(editor.discoveredNewModels).toEqual([])

    editor.discoveredNewModels = []
    const emptyEditor = await createEditor(async () => ({ status: 'empty', models: [] }), async () => ({ success: true }))
    await emptyEditor.editor.runDiscovery()
    expect(emptyEditor.editor.discoveryStatus).toBe('empty')
    expect(emptyEditor.editor.draft.models.map(model => model.id)).toEqual(['hand-filled'])

    const failedEditor = await createEditor(async () => ({
      status: 'failed',
      error: {
        stage: 'discovery',
        code: 'unauthorized',
        message: 'Bearer sk-live',
        retryable: false,
      },
    }), async () => ({ success: true }))
    await failedEditor.editor.runDiscovery()
    expect(failedEditor.editor.discoveryStatus).toBe('failed')
    expect(failedEditor.editor.discoveryError?.message).not.toContain('sk-live')
    expect(failedEditor.editor.draft.models.map(model => model.id)).toEqual(['hand-filled'])

    const unsupportedEditor = await createEditor(async () => ({ status: 'unsupported' }), async () => ({ success: true }))
    await unsupportedEditor.editor.runDiscovery()
    expect(unsupportedEditor.editor.discoveryStatus).toBe('unsupported')
    expect(unsupportedEditor.editor.draft.models.map(model => model.id)).toEqual(['hand-filled'])
  })

  it('requires an explicit confirm path to save an unverified connection', async () => {
    const { store, created, editor } = await createEditor(async () => ({ status: 'unsupported' }), async () => ({
      success: false,
      error: {
        stage: 'generation',
        code: 'unauthorized',
        message: 'Bearer sk-live rejected',
        retryable: false,
      },
    }))

    await editor.runGenerationTest()
    expect(editor.generationSuccess).toBe(false)
    expect(editor.generationError?.message).not.toContain('sk-live')

    const saved = await editor.saveUnverified()
    expect(saved).toBe(true)
    expect(store.getProvider(created.id)?.status).toBe('bypassed')
    expect(store.getProvider(created.id)?.status).not.toBe('configured')
  })

  it('saves a verified connection only after a current generation test', async () => {
    const { store, created, editor } = await createEditor(async () => ({ status: 'unsupported' }), async () => ({ success: true }))

    expect(await editor.saveVerified()).toBe(false)
    expect(store.getProvider(created.id)?.status).not.toBe('configured')

    await editor.runGenerationTest()
    expect(editor.generationIsCurrent).toBe(true)
    expect(await editor.saveVerified()).toBe(true)
    expect(store.getProvider(created.id)?.status).toBe('configured')
  })

  it('masks secret header values in the draft input contract', async () => {
    const { editor } = await createEditor(async () => ({ status: 'unsupported' }), async () => ({ success: true }))
    expect(editor.draft.headers.some(header => header.key === 'X-Token' && header.value === 'secret-header')).toBe(true)
    expect(editor.browserBlocked).toBeUndefined()
  })

  it('lists CORS, network, and TLS causes for a browser-blocked generation test', async () => {
    const { editor } = await createEditor(async () => ({ status: 'unsupported' }), async () => ({
      success: false,
      error: {
        stage: 'transport',
        code: 'browser-request-blocked',
        message: 'Failed to fetch',
        retryable: true,
      },
    }))

    await editor.runGenerationTest()
    expect(editor.browserBlocked?.causes).toEqual(['cors', 'network', 'tls'])
    expect(editor.generationError?.message).toBe('Failed to fetch')
  })
})
