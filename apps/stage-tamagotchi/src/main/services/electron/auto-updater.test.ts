import { beforeEach, describe, expect, it, vi } from 'vitest'

const appMock = vi.hoisted(() => ({
  getVersion: vi.fn(() => '0.9.0-beta.4'),
  getPath: vi.fn((name: string) => name === 'logs' ? '/tmp/airi/logs' : `/tmp/${name}`),
  quit: vi.fn(),
  isPackaged: false,
}))

const isDevState = vi.hoisted(() => ({
  value: false,
}))

const updaterState = vi.hoisted(() => ({
  instance: createUpdaterMock(),
}))

function createUpdaterMock() {
  return {
    on: vi.fn(),
    autoDownload: true,
    allowPrerelease: false,
    channel: undefined as string | undefined,
    logger: undefined as any,
    forceDevUpdateConfig: false,
    setFeedURL: vi.fn(),
    checkForUpdates: vi.fn().mockResolvedValue(undefined),
    downloadUpdate: vi.fn().mockResolvedValue(undefined),
    quitAndInstall: vi.fn(),
  }
}

vi.mock('electron', () => ({
  app: appMock,
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: {
    get dev() {
      return isDevState.value
    },
  },
}))

vi.mock('@guiiai/logg', () => ({
  useLogg: () => ({
    useGlobalConfig: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      withError: () => ({
        error: vi.fn(),
      }),
    }),
  }),
}))

vi.mock('electron-updater', () => ({
  default: {
    get autoUpdater() {
      return updaterState.instance
    },
  },
}))

vi.mock('~build/git', () => ({
  committerDate: '2026-04-01T00:00:00.000Z',
}))

describe('setupAutoUpdater', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    updaterState.instance = createUpdaterMock()
    appMock.getVersion.mockReturnValue('0.9.0-beta.4')
    appMock.getPath.mockImplementation((name: string) => name === 'logs' ? '/tmp/airi/logs' : `/tmp/${name}`)
    isDevState.value = false
    delete process.env.UPDATE_SERVER_URL
  })

  it('does not query the GitHub Releases API during setup or manual checks', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    })
    vi.stubGlobal('fetch', fetchSpy)

    const { setupAutoUpdater } = await import('./auto-updater')
    const service = setupAutoUpdater()

    await Promise.resolve()
    await service.checkForUpdates()

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('only uses setFeedURL when an explicit update server override is provided', async () => {
    process.env.UPDATE_SERVER_URL = 'http://localhost:8787/stable'

    const { setupAutoUpdater } = await import('./auto-updater')
    setupAutoUpdater()

    expect(updaterState.instance.setFeedURL).toHaveBeenCalledWith({
      provider: 'generic',
      url: 'http://localhost:8787/stable',
    })
  })

  it('uses the real updater in dev mode when an explicit update server override is provided', async () => {
    isDevState.value = true
    process.env.UPDATE_SERVER_URL = 'http://localhost:8787/stable'

    const { setupAutoUpdater } = await import('./auto-updater')
    setupAutoUpdater()

    expect(updaterState.instance.setFeedURL).toHaveBeenCalledWith({
      provider: 'generic',
      url: 'http://localhost:8787/stable',
    })
    expect(updaterState.instance.forceDevUpdateConfig).toBe(true)
  })

  it('reports only authoritative diagnostics fields', async () => {
    const { setupAutoUpdater } = await import('./auto-updater')
    const service = setupAutoUpdater()

    expect(service.state.diagnostics).toEqual(expect.objectContaining({
      platform: process.platform,
      arch: process.arch,
      channel: 'latest-arm64',
      executablePath: expect.any(String),
      logFilePath: '/tmp/airi/logs',
      isOverrideActive: false,
    }))
    expect(service.state.diagnostics).not.toHaveProperty('updaterCacheDir')
    expect(service.state.diagnostics).not.toHaveProperty('pendingDir')
    expect(service.state.diagnostics).not.toHaveProperty('uninstallPath')
    expect(service.state.diagnostics).not.toHaveProperty('uninstallExists')
  })

  it('uses silent relaunch install on Windows only', async () => {
    const originalPlatform = process.platform
    vi.stubEnv('TEST_PLATFORM', '')

    const { setupAutoUpdater } = await import('./auto-updater')
    const service = setupAutoUpdater()

    Object.defineProperty(process, 'platform', { value: 'win32' })
    await service.quitAndInstall()
    expect(updaterState.instance.quitAndInstall).toHaveBeenCalledWith(true, true)

    updaterState.instance.quitAndInstall.mockClear()
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    await service.quitAndInstall()
    expect(updaterState.instance.quitAndInstall).toHaveBeenCalledWith()

    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })
})
