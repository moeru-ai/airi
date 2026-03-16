import { beforeEach, describe, expect, it, vi } from 'vitest'

const { capVitePlugin, defineConfig, loadConfigFromFile, mergeConfig } = vi.hoisted(() => ({
  capVitePlugin: vi.fn(),
  defineConfig: vi.fn((config: unknown) => config),
  loadConfigFromFile: vi.fn(),
  mergeConfig: vi.fn(),
}))

vi.mock('vite', () => ({
  defineConfig,
  loadConfigFromFile,
  mergeConfig,
}))

vi.mock('./vite-plugin', () => ({
  capVitePlugin,
}))

describe('vite-wrapper-config', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    process.env.CAP_VITE_BASE_CONFIG = '/repo/app/vite.config.ts'
    process.env.CAP_VITE_CAP_ARGS_JSON = JSON.stringify(['ios', '--target', 'iPhone 16 Pro'])
    process.env.CAP_VITE_CONFIG_LOADER = 'runner'
    process.env.CAP_VITE_ROOT = '/repo/app'
  })

  it('loads the user config and merges the injected plugin', async () => {
    loadConfigFromFile.mockResolvedValue({
      config: {
        server: {
          port: 5173,
        },
      },
      dependencies: [],
      path: '/repo/app/vite.config.ts',
    })
    mergeConfig.mockImplementation((defaults: Record<string, unknown>, overrides: Record<string, unknown>) => ({
      ...defaults,
      ...overrides,
    }))
    capVitePlugin.mockReturnValue({ name: 'cap-vite:run-capacitor' })

    const module = await import('./vite-wrapper-config')
    const config = await module.default({
      command: 'serve',
      mode: 'development',
      isPreview: false,
    })

    expect(defineConfig).toHaveBeenCalledTimes(1)
    expect(loadConfigFromFile).toHaveBeenCalledWith(
      {
        command: 'serve',
        isPreview: false,
        mode: 'development',
      },
      '/repo/app/vite.config.ts',
      '/repo/app',
      undefined,
      undefined,
      'runner',
    )
    expect(capVitePlugin).toHaveBeenCalledWith({
      capArgs: ['ios', '--target', 'iPhone 16 Pro'],
    })
    expect(config).toEqual({
      plugins: [{ name: 'cap-vite:run-capacitor' }],
      server: {
        port: 5173,
      },
    })
  })
})
