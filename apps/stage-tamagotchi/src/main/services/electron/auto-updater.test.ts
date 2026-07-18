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

const stdEnvState = vi.hoisted(() => ({
  isWindows: false,
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

vi.mock('std-env', () => ({
  get isWindows() {
    return stdEnvState.isWindows
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
  const expectedChannelByArch = process.arch === 'arm64' ? 'latest-arm64' : 'latest-x64'

  const laneReleaseTagMap = {
    latest: 'v0.9.12-nightly.7',
    stable: 'v0.9.9',
    beta: 'v0.9.10-beta.3',
    alpha: 'v0.9.11-alpha.4',
    nightly: 'v0.9.12-nightly.7',
  } as const
  const bundleVersions = ['0.9.0', '0.9.0-beta.4', '0.9.0-alpha.2'] as const
  const laneMatrix = ['latest', 'stable', 'beta', 'alpha', 'nightly'] as const

  const defaultReleases = [
    { tag_name: 'v0.9.0-beta.6', draft: false, prerelease: true },
  ]
  const matrixReleases = [
    { tag_name: 'v0.9.7', draft: false, prerelease: false },
    { tag_name: 'v0.9.9', draft: false, prerelease: false },
    { tag_name: 'v0.9.9-beta.1', draft: false, prerelease: true },
    { tag_name: 'v0.9.10-beta.3', draft: false, prerelease: true },
    { tag_name: 'v0.9.10-alpha.5', draft: false, prerelease: true },
    { tag_name: 'v0.9.11-alpha.4', draft: false, prerelease: true },
    { tag_name: 'v0.9.11-nightly.1', draft: false, prerelease: true },
    { tag_name: 'v0.9.12-nightly.7', draft: false, prerelease: true },
  ]

  function mockGitHubReleasesFetch(releases = defaultReleases) {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => releases,
    })
    vi.stubGlobal('fetch', fetchSpy)
    return fetchSpy
  }

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    updaterState.instance = createUpdaterMock()
    appMock.getVersion.mockReturnValue('0.9.0-beta.4')
    appMock.getPath.mockImplementation((name: string) => name === 'logs' ? '/tmp/airi/logs' : `/tmp/${name}`)
    isDevState.value = false
    stdEnvState.isWindows = false
    delete process.env.UPDATE_SERVER_URL
    delete process.env.AIRI_UPDATE_CHANNEL
    mockGitHubReleasesFetch()
  })

  it('resolves release tag from GitHub API and configures generic provider for checks', async () => {
    const fetchSpy = mockGitHubReleasesFetch([
      { tag_name: 'v0.9.0-beta.6', draft: false, prerelease: true },
      { tag_name: 'v0.9.0-beta.5', draft: false, prerelease: true },
    ])
    const { setupAutoUpdater } = await import('./auto-updater')
    const service = setupAutoUpdater()

    await Promise.resolve()
    await service.checkForUpdates()

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(updaterState.instance.setFeedURL).toHaveBeenCalledWith({
      provider: 'generic',
      url: 'https://github.com/moeru-ai/airi/releases/download/v0.9.0-beta.6',
    })
    expect(updaterState.instance.channel).toBe(expectedChannelByArch)
  })

  it('ignores UPDATE_SERVER_URL in non-dev runtime', async () => {
    process.env.UPDATE_SERVER_URL = 'http://localhost:8787/stable'

    const { setupAutoUpdater } = await import('./auto-updater')
    const service = setupAutoUpdater()
    await service.checkForUpdates()

    expect(updaterState.instance.setFeedURL).toHaveBeenCalledWith({
      provider: 'generic',
      url: 'https://github.com/moeru-ai/airi/releases/download/v0.9.0-beta.6',
    })
  })

  it('uses UPDATE_SERVER_URL only in dev mode for update-test harness', async () => {
    isDevState.value = true
    process.env.UPDATE_SERVER_URL = 'http://localhost:8787/stable'

    const fetchSpy = mockGitHubReleasesFetch()
    const { setupAutoUpdater } = await import('./auto-updater')
    setupAutoUpdater()

    expect(updaterState.instance.setFeedURL).toHaveBeenCalledWith({
      provider: 'generic',
      url: 'http://localhost:8787/stable',
    })
    expect(updaterState.instance.forceDevUpdateConfig).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('supports explicit stable lane selection for future dynamic channel switching', async () => {
    process.env.AIRI_UPDATE_CHANNEL = 'stable'
    mockGitHubReleasesFetch([
      { tag_name: 'v0.9.0-beta.6', draft: false, prerelease: true },
      { tag_name: 'v0.8.9', draft: false, prerelease: false },
      { tag_name: 'v0.8.8', draft: false, prerelease: false },
    ])

    const { setupAutoUpdater } = await import('./auto-updater')
    const service = setupAutoUpdater()
    await service.checkForUpdates()

    expect(updaterState.instance.setFeedURL).toHaveBeenCalledWith({
      provider: 'generic',
      url: 'https://github.com/moeru-ai/airi/releases/download/v0.8.9',
    })
  })

  it.each(laneMatrix)('supports AIRI_UPDATE_CHANNEL override for lane=%s', async (lane) => {
    appMock.getVersion.mockReturnValue('0.9.0-alpha.2')
    process.env.AIRI_UPDATE_CHANNEL = lane
    mockGitHubReleasesFetch(matrixReleases)

    const { setupAutoUpdater } = await import('./auto-updater')
    const service = setupAutoUpdater()
    await service.checkForUpdates()

    expect(updaterState.instance.setFeedURL).toHaveBeenCalledWith({
      provider: 'generic',
      url: `https://github.com/moeru-ai/airi/releases/download/${laneReleaseTagMap[lane]}`,
    })
  })

  it.each(bundleVersions)('uses bundled version lane when no AIRI_UPDATE_CHANNEL (bundle=%s)', async (bundleVersion) => {
    appMock.getVersion.mockReturnValue(bundleVersion)
    mockGitHubReleasesFetch(matrixReleases)

    const { setupAutoUpdater } = await import('./auto-updater')
    const service = setupAutoUpdater()
    await service.checkForUpdates()

    const expectedLane = bundleVersion.includes('-beta')
      ? 'beta'
      : bundleVersion.includes('-alpha')
        ? 'alpha'
        : 'stable'

    expect(updaterState.instance.setFeedURL).toHaveBeenCalledWith({
      provider: 'generic',
      url: `https://github.com/moeru-ai/airi/releases/download/${laneReleaseTagMap[expectedLane]}`,
    })
  })

  it.each(bundleVersions.flatMap(bundleVersion => laneMatrix.map(lane => ({ bundleVersion, lane }))))(
    'matrix lane/feed/bundle works with UPDATE_SERVER_URL override (%o)',
    async ({ bundleVersion, lane }) => {
      appMock.getVersion.mockReturnValue(bundleVersion)
      isDevState.value = true
      process.env.AIRI_UPDATE_CHANNEL = lane
      process.env.UPDATE_SERVER_URL = `http://127.0.0.1:8787/${lane}`

      const fetchSpy = mockGitHubReleasesFetch(matrixReleases)
      const { setupAutoUpdater } = await import('./auto-updater')
      const service = setupAutoUpdater()
      await service.checkForUpdates()

      expect(updaterState.instance.setFeedURL).toHaveBeenCalledWith({
        provider: 'generic',
        url: `http://127.0.0.1:8787/${lane}`,
      })
      expect(fetchSpy).not.toHaveBeenCalled()
    },
  )

  it('reports only authoritative diagnostics fields', async () => {
    const { setupAutoUpdater } = await import('./auto-updater')
    const service = setupAutoUpdater()

    expect(service.state.diagnostics).toEqual(expect.objectContaining({
      platform: process.platform,
      arch: process.arch,
      channel: expectedChannelByArch,
      executablePath: expect.any(String),
      logFilePath: expect.stringMatching(/stage-tamagotchi-updater[\\/]updater-log\.txt$/),
      isOverrideActive: false,
    }))
    expect(service.state.diagnostics).not.toHaveProperty('updaterCacheDir')
    expect(service.state.diagnostics).not.toHaveProperty('pendingDir')
    expect(service.state.diagnostics).not.toHaveProperty('uninstallPath')
    expect(service.state.diagnostics).not.toHaveProperty('uninstallExists')
  })

  it('does not treat build metadata as prerelease', async () => {
    appMock.getVersion.mockReturnValue('1.2.3+build-1')

    const { setupAutoUpdater } = await import('./auto-updater')
    setupAutoUpdater()

    expect(updaterState.instance.allowPrerelease).toBe(false)
  })

  it('uses silent relaunch install on Windows only', async () => {
    stdEnvState.isWindows = true
    const { setupAutoUpdater } = await import('./auto-updater')
    const service = setupAutoUpdater()

    await service.quitAndInstall()
    expect(updaterState.instance.quitAndInstall).toHaveBeenCalledWith(true, true)

    stdEnvState.isWindows = false
    updaterState.instance.quitAndInstall.mockClear()
    await service.quitAndInstall()
    expect(updaterState.instance.quitAndInstall).toHaveBeenCalledWith()
  })
})
