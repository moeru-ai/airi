import type { WidgetSnapshot, WidgetsAddPayload, WidgetsUpdatePayload } from '../../../../../shared/eventa'

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setupPluginHostHostService } from './index'

const appMock = vi.hoisted(() => ({
  getPath: vi.fn(),
}))
const sessionMock = vi.hoisted(() => ({
  defaultSession: {
    cookies: {
      remove: vi.fn(async (_url: string, _name: string) => {}),
      set: vi.fn(async (_details: { name: string, value: string }) => {}),
    },
  },
}))

vi.mock('electron', () => ({
  app: appMock,
  ipcMain: {},
  protocol: {},
  session: sessionMock,
}))

const pluginManifestFileName = 'plugin.airi.json'

function createWidgetsManagerDouble() {
  const widgetSnapshots = new Map<string, WidgetSnapshot>()
  const widgetEventListeners = new Set<(event: { id: string, event: Record<string, unknown> }) => void>()
  return {
    openWindow: vi.fn(async (_params?: { id?: string }) => {}),
    pushWidget: vi.fn(async (payload: WidgetsAddPayload) => {
      const snapshot: WidgetSnapshot = {
        id: payload.id ?? Math.random().toString(36).slice(2, 10),
        componentName: payload.componentName,
        componentProps: payload.componentProps ?? {},
        size: payload.size ?? 'm',
        windowSize: payload.windowSize,
        ttlMs: payload.ttlMs ?? 0,
      }
      widgetSnapshots.set(snapshot.id, snapshot)
      return snapshot.id
    }),
    updateWidget: vi.fn(async (_payload: WidgetsUpdatePayload) => {}),
    removeWidget: vi.fn(async (id: string) => { widgetSnapshots.delete(id) }),
    getWidgetSnapshot: vi.fn((id: string) => widgetSnapshots.get(id)),
    publishWidgetEvent: vi.fn((_id: string, _event: Record<string, unknown>) => {
      for (const listener of widgetEventListeners) {
        listener({ id: _id, event: _event })
      }
    }),
    onWidgetEvent: vi.fn((listener: (event: { id: string, event: Record<string, unknown> }) => void) => {
      widgetEventListeners.add(listener)
      return () => { widgetEventListeners.delete(listener) }
    }),
  }
}

async function createPluginInDir(
  pluginsDir: string,
  pluginDirName: string,
  pluginName: string,
  configSchema?: Record<string, unknown>,
) {
  const pluginDir = join(pluginsDir, pluginDirName)
  await mkdir(pluginDir, { recursive: true })
  await writeFile(join(pluginDir, 'entrypoint.mjs'), 'export async function init() {}')

  const manifest: Record<string, unknown> = {
    apiVersion: 'v1',
    kind: 'manifest.plugin.airi.moeru.ai',
    name: pluginName,
    permissions: {},
    entrypoints: { electron: './entrypoint.mjs' },
  }
  if (configSchema) {
    manifest.config = { schema: configSchema }
  }
  await writeFile(join(pluginDir, pluginManifestFileName), JSON.stringify(manifest, null, 2))
}

async function removeDirWithRetry(path: string, options: { attempts?: number, waitMs?: number } = {}) {
  const attempts = Math.max(1, options.attempts ?? 5)
  const waitMs = Math.max(1, options.waitMs ?? 20)
  for (let index = 0; index < attempts; index += 1) {
    try {
      await rm(path, { recursive: true, force: true })
      return
    } catch {
      if (index >= attempts - 1) {
        throw new Error(`Failed to remove ${path} after ${attempts} attempts`)
      }
      await new Promise(resolve => setTimeout(resolve, waitMs))
    }
  }
}

describe('setPluginConfig validation', () => {
  let userDataDir: string
  let pluginsDir: string
  let service: Awaited<ReturnType<typeof setupPluginHostHostService>>

  beforeEach(async () => {
    userDataDir = await mkdtemp(join(tmpdir(), 'airi-plugins-set-config-'))
    pluginsDir = join(userDataDir, 'plugins', 'v1')
    await mkdir(pluginsDir, { recursive: true })
    appMock.getPath.mockReturnValue(userDataDir)
  })

  afterEach(async () => {
    await service.dispose().catch(() => {})
    await removeDirWithRetry(userDataDir)
    vi.restoreAllMocks()
  })

  describe('plugin lookup', () => {
    it('throws when the plugin does not exist in the registry', async () => {
      const widgets = createWidgetsManagerDouble()
      service = await setupPluginHostHostService({ widgetsManager: widgets })

      await expect(service.setPluginConfig({
        pluginName: 'nonexistent-plugin',
        config: { foo: 'bar' },
      })).rejects.toThrow('Plugin not found: nonexistent-plugin')
    })
  })

  describe('unknown key rejection', () => {
    it('throws when a config key is not declared in the schema', async () => {
      await createPluginInDir(pluginsDir, 'test-plugin', 'test-plugin', {
        allowedKey: { type: 'string', label: 'Allowed' },
      })
      const widgets = createWidgetsManagerDouble()
      service = await setupPluginHostHostService({ widgetsManager: widgets })

      await expect(service.setPluginConfig({
        pluginName: 'test-plugin',
        config: { unknownKey: 'value' },
      })).rejects.toThrow('Unknown config key: unknownKey')
    })

    it('throws when multiple unknown keys are present', async () => {
      await createPluginInDir(pluginsDir, 'test-plugin', 'test-plugin', {
        allowedKey: { type: 'string', label: 'Allowed' },
      })
      const widgets = createWidgetsManagerDouble()
      service = await setupPluginHostHostService({ widgetsManager: widgets })

      await expect(service.setPluginConfig({
        pluginName: 'test-plugin',
        config: { allowedKey: 'ok', unknown1: 'x', unknown2: 'y' },
      })).rejects.toThrow('Unknown config key: unknown1')
    })
  })

  describe('required field validation', () => {
    it('throws when a required field is missing from the payload', async () => {
      await createPluginInDir(pluginsDir, 'test-plugin', 'test-plugin', {
        apiKey: { type: 'string', label: 'API Key', required: true },
      })
      const widgets = createWidgetsManagerDouble()
      service = await setupPluginHostHostService({ widgetsManager: widgets })

      await expect(service.setPluginConfig({
        pluginName: 'test-plugin',
        config: {},
      })).rejects.toThrow('Missing required config field: apiKey')
    })

    it('throws when a required string field is present but empty', async () => {
      await createPluginInDir(pluginsDir, 'test-plugin', 'test-plugin', {
        baseUrl: { type: 'string', label: 'Base URL', required: true },
      })
      const widgets = createWidgetsManagerDouble()
      service = await setupPluginHostHostService({ widgetsManager: widgets })

      await expect(service.setPluginConfig({
        pluginName: 'test-plugin',
        config: { baseUrl: '' },
      })).rejects.toThrow('Required string config field "baseUrl" must not be empty')
    })

    it('allows an optional field to be omitted', async () => {
      await createPluginInDir(pluginsDir, 'test-plugin', 'test-plugin', {
        requiredField: { type: 'string', label: 'Required', required: true },
        optionalField: { type: 'string', label: 'Optional' },
      })
      const widgets = createWidgetsManagerDouble()
      service = await setupPluginHostHostService({ widgetsManager: widgets })

      await expect(service.setPluginConfig({
        pluginName: 'test-plugin',
        config: { requiredField: 'value' },
      })).resolves.toBeDefined()
    })

    it('ignores required validations when no schema is declared', async () => {
      await createPluginInDir(pluginsDir, 'test-plugin', 'test-plugin')
      const widgets = createWidgetsManagerDouble()
      service = await setupPluginHostHostService({ widgetsManager: widgets })

      await expect(service.setPluginConfig({
        pluginName: 'test-plugin',
        config: { anyKey: 'anyValue' },
      })).resolves.toBeDefined()
    })
  })

  describe('value type validation', () => {
    it('rejects a non-string value for a string field', async () => {
      await createPluginInDir(pluginsDir, 'test-plugin', 'test-plugin', {
        name: { type: 'string', label: 'Name' },
      })
      const widgets = createWidgetsManagerDouble()
      service = await setupPluginHostHostService({ widgetsManager: widgets })

      await expect(service.setPluginConfig({
        pluginName: 'test-plugin',
        config: { name: 42 },
      })).rejects.toThrow('Config field "name" must be a string, got number')
    })

    it('rejects a non-string value for a secret field', async () => {
      await createPluginInDir(pluginsDir, 'test-plugin', 'test-plugin', {
        token: { type: 'secret', label: 'Token' },
      })
      const widgets = createWidgetsManagerDouble()
      service = await setupPluginHostHostService({ widgetsManager: widgets })

      await expect(service.setPluginConfig({
        pluginName: 'test-plugin',
        config: { token: true },
      })).rejects.toThrow('Config field "token" must be a string, got boolean')
    })

    it('rejects a non-number value for a number field', async () => {
      await createPluginInDir(pluginsDir, 'test-plugin', 'test-plugin', {
        port: { type: 'number', label: 'Port' },
      })
      const widgets = createWidgetsManagerDouble()
      service = await setupPluginHostHostService({ widgetsManager: widgets })

      await expect(service.setPluginConfig({
        pluginName: 'test-plugin',
        config: { port: '8080' },
      })).rejects.toThrow('Config field "port" must be a number, got string')
    })

    it('rejects a non-boolean value for a boolean field', async () => {
      await createPluginInDir(pluginsDir, 'test-plugin', 'test-plugin', {
        enabled: { type: 'boolean', label: 'Enabled' },
      })
      const widgets = createWidgetsManagerDouble()
      service = await setupPluginHostHostService({ widgetsManager: widgets })

      await expect(service.setPluginConfig({
        pluginName: 'test-plugin',
        config: { enabled: 'true' },
      })).rejects.toThrow('Config field "enabled" must be a boolean, got string')
    })
  })

  describe('successful config persistence', () => {
    it('accepts a valid full config with all field types', async () => {
      await createPluginInDir(pluginsDir, 'test-plugin', 'test-plugin', {
        name: { type: 'string', label: 'Name' },
        count: { type: 'number', label: 'Count' },
        active: { type: 'boolean', label: 'Active' },
      })
      const widgets = createWidgetsManagerDouble()
      service = await setupPluginHostHostService({ widgetsManager: widgets })

      const result = await service.setPluginConfig({
        pluginName: 'test-plugin',
        config: { name: 'test', count: 3, active: true },
      })

      expect(result).toBeDefined()
      expect(result.plugins).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'test-plugin' }),
      ]))
    })

    it('persists config values and returns them in the list snapshot', async () => {
      await createPluginInDir(pluginsDir, 'test-plugin', 'test-plugin', {
        greeting: { type: 'string', label: 'Greeting', default: 'hello' },
      })
      const widgets = createWidgetsManagerDouble()
      service = await setupPluginHostHostService({ widgetsManager: widgets })

      await service.setPluginConfig({
        pluginName: 'test-plugin',
        config: { greeting: 'hi' },
      })

      const config = await service.getPluginConfig({ pluginName: 'test-plugin' })
      expect(config.values).toEqual(expect.objectContaining({ greeting: 'hi' }))
    })
  })
})
