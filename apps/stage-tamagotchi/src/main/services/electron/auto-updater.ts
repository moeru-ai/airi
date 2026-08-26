import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { AutoUpdaterState } from '@proj-airi/electron-eventa/electron-updater'
import type { BrowserWindow } from 'electron'
import type { UpdateInfo } from 'electron-updater'

import type { ElectronUpdaterChannel } from '../../../shared/eventa'

import process from 'node:process'

import { appendFile, mkdir, rm } from 'node:fs/promises'
import { dirname, join, normalize } from 'node:path'

import electronUpdater from 'electron-updater'
import semver from 'semver'

import { is } from '@electron-toolkit/utils'
import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { tryCatch } from '@moeru/std'
import { errorMessageFromValue } from '@proj-airi/stage-shared'
import { committerDate } from '~build/git'
import { app } from 'electron'
import { Semaphore } from 'es-toolkit'
import { isWindows } from 'std-env'

import {
  autoUpdater as autoUpdaterEventa,
  electronAutoUpdaterStateChanged,
  electronGetUpdaterPreferences,
  electronSetUpdaterPreferences,

} from '../../../shared/eventa'
import { MockAutoUpdater } from './mock-auto-updater'

function getReleaseChannelName() {
  return process.arch === 'arm64' ? 'latest-arm64' : 'latest-x64'
}

const GITHUB_RELEASES_API_URL = 'https://api.github.com/repos/moeru-ai/airi/releases?per_page=100'
const GITHUB_RELEASES_ATOM_URL = 'https://github.com/moeru-ai/airi/releases.atom'
const GITHUB_RELEASE_DOWNLOAD_BASE_URL = 'https://github.com/moeru-ai/airi/releases/download'
const UPDATE_CHANNEL_ENV_KEY = 'AIRI_UPDATE_CHANNEL'

function getCacheRoot() {
  // NOTICE: Electron resolves the cache directory per platform/app, but the
  // shipped type definitions here do not expose `cache`, so we cast the key.
  return app.getPath('cache' as Parameters<typeof app.getPath>[0])
}

function getLegacyCacheRoot() {
  switch (process.platform) {
    case 'darwin':
      return join(process.env.HOME || '', 'Library', 'Caches')
    case 'win32':
      return process.env.LOCALAPPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Local')
    default:
      return process.env.XDG_CACHE_HOME || join(process.env.HOME || '', '.cache')
  }
}

const UPDATER_DEBUG_CACHE_DIR = join(getCacheRoot(), 'stage-tamagotchi-updater')
const UPDATER_LOG_FILE = join(UPDATER_DEBUG_CACHE_DIR, 'updater-log.txt')
const OFFICIAL_UPDATER_CACHE_DIR = join(getCacheRoot(), 'ai.moeru.airi-updater')
const LEGACY_OFFICIAL_UPDATER_CACHE_DIR = join(getLegacyCacheRoot(), 'ai.moeru.airi-updater')
const OFFICIAL_UPDATER_CACHE_DIRS = Array.from(new Set([
  LEGACY_OFFICIAL_UPDATER_CACHE_DIR,
  OFFICIAL_UPDATER_CACHE_DIR,
]))

export interface AppUpdaterLike {
  allowPrerelease?: boolean
  autoDownload?: boolean
  channel?: string
  checkForUpdates: () => Promise<any>
  downloadUpdate: () => Promise<any>
  forceDevUpdateConfig?: boolean
  logger?: any
  on: (event: string, listener: (...args: any[]) => void) => any
  quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => Promise<void> | void
  setFeedURL?: (options: { provider: 'generic', url: string }) => void
}

export interface AutoUpdater {
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  getPreferredUpdateLane: () => undefined | UpdateLane
  quitAndInstall: () => Promise<void>
  setPreferredUpdateLane: (lane: undefined | UpdateLane) => Promise<void>
  state: AutoUpdaterState
  subscribe: (callback: (state: AutoUpdaterState) => void) => () => void
}

export interface AutoUpdaterOptions {
  /**
   * Whether AIRI owns application updates for this distribution.
   *
   * @default true
   */
  enabled?: boolean
  /** Reads the release channel persisted by the application configuration. */
  getStoredUpdateLane?: () => undefined | UpdateLane
  /** Persists a release-channel change requested through updater IPC. */
  setStoredUpdateLane?: (lane: undefined | UpdateLane) => void
}
export type UpdateLane = ElectronUpdaterChannel

interface GitHubReleaseRecord {
  draft?: boolean
  prerelease?: boolean
  tag_name?: string
}

type MainContext = ReturnType<typeof createContext>['context']

export function createAutoUpdaterService(params: { context: MainContext, service: AutoUpdater, window: BrowserWindow }) {
  const { context, service, window } = params

  const log = useLogg('auto-updater-service').useGlobalConfig()

  const unsubscribe = service.subscribe((state) => {
    if (window.isDestroyed())
      return

    tryCatch(() => context.emit(electronAutoUpdaterStateChanged, state))
  })

  const cleanups: Array<() => void> = [
    unsubscribe,
    defineInvokeHandler(context, autoUpdaterEventa.getState, () => service.state),
    defineInvokeHandler(context, autoUpdaterEventa.checkForUpdates, async () => {
      await service.checkForUpdates().catch(error => log.withError(error).error('checkForUpdates() failed'))
      return service.state
    }),
    defineInvokeHandler(context, autoUpdaterEventa.downloadUpdate, async () => {
      await service.downloadUpdate()
      return service.state
    }),
    defineInvokeHandler(context, electronGetUpdaterPreferences, async () => ({
      channel: service.getPreferredUpdateLane(),
    })),
    defineInvokeHandler(context, electronSetUpdaterPreferences, async (payload) => {
      await service.setPreferredUpdateLane(payload?.channel)
      return {
        channel: service.getPreferredUpdateLane(),
      }
    }),
    defineInvokeHandler(context, autoUpdaterEventa.quitAndInstall, async () => {
      await service.quitAndInstall()
    }),
  ]

  const cleanup = () => {
    for (const fn of cleanups)
      fn()
  }

  window.on('closed', cleanup)
  return cleanup
}

// NOTICE: this part of code is copied from https://www.electron.build/auto-update
// Or https://github.com/electron-userland/electron-builder/blob/b866e99ccd3ea9f85bc1e840f0f6a6a162fca388/pages/auto-update.md?plain=1#L57-L66
export function fromImported(): AppUpdaterLike {
  if (is.dev && !getUpdateServerOverride())
    return new MockAutoUpdater()

  const { autoUpdater } = electronUpdater
  return autoUpdater as unknown as AppUpdaterLike
}

export function setupAutoUpdater(options: AutoUpdaterOptions = {}): AutoUpdater {
  if (options.enabled === false)
    return createDisabledAutoUpdater(options)

  const semaphore = new Semaphore(1)
  const appVersion = app.getVersion()
  const isPrereleaseBuild = isPrereleaseVersion(appVersion)
  const log = useLogg('auto-updater').useGlobalConfig()
  const autoUpdater = fromImported()
  const feedUrlOverride = getUpdateServerOverride()
  let storedPreferredLane = options.getStoredUpdateLane?.()
  const releaseChannelName = getReleaseChannelName()
  let activeFeedUrlOverride = feedUrlOverride
  let resolvedReleaseTag: string | undefined
  let prepareFeedPromise: Promise<void> | undefined

  autoUpdater.allowPrerelease = isPrereleaseBuild
  autoUpdater.autoDownload = false
  void cleanupStaleUpdateFiles()
  if (activeFeedUrlOverride)
    autoUpdater.channel = releaseChannelName
  autoUpdater.forceDevUpdateConfig = !!feedUrlOverride && !app.isPackaged
  autoUpdater.logger = {
    debug: (message: string) => {
      log.debug(message)
      void logToFile('DEBUG', message)
    },
    error: (message: string) => {
      log.error(message)
      void logToFile('ERROR', message)
    },
    info: (message: string) => {
      log.log(message)
      void logToFile('INFO', message)
    },
    warn: (message: string) => {
      log.warn(message)
      void logToFile('WARN', message)
    },
  }

  if (activeFeedUrlOverride)
    autoUpdater.setFeedURL?.({ provider: 'generic', url: activeFeedUrlOverride })

  const withDiagnostics = (next: AutoUpdaterState): AutoUpdaterState => ({
    ...next,
    diagnostics: {
      arch: process.arch,
      channel: autoUpdater.channel || releaseChannelName,
      executablePath: process.execPath,
      installDirectory: dirname(process.execPath),
      isOverrideActive: !!activeFeedUrlOverride,
      logFilePath: UPDATER_LOG_FILE,
      platform: process.platform,
      requiresAdminForInstallPath: requiresAdminForInstallPath(process.execPath),
      ...(activeFeedUrlOverride ? { feedUrl: activeFeedUrlOverride } : {}),
    },
  })

  let state: AutoUpdaterState = withDiagnostics({ status: 'idle' })
  const hooks = new Set<(state: AutoUpdaterState) => void>()

  function broadcast(next: AutoUpdaterState) {
    state = withDiagnostics(next)

    for (const listener of hooks) {
      try {
        listener(state)
      }
      catch (error) {
        log.withError(error).error('Failed to notify listener')
      }
    }
  }

  function broadcastUpdaterError(error: unknown, reason: string) {
    broadcast({
      error: { message: errorMessageFromValue(error) },
      status: 'error',
    })
    log.withError(error).error(reason)
  }

  function applyGenericFeedOverride(url: string, reason: string) {
    activeFeedUrlOverride = url
    autoUpdater.channel = releaseChannelName
    autoUpdater.setFeedURL?.({ provider: 'generic', url })
    log.warn(`[auto-updater] applied generic feed override (${reason}): ${url}`)
  }

  function resetPreparedFeedForLaneChange() {
    if (feedUrlOverride)
      return

    activeFeedUrlOverride = undefined
    resolvedReleaseTag = undefined
    prepareFeedPromise = undefined
    autoUpdater.channel = undefined
  }

  async function resolveGitHubReleaseTagForLane(lane: UpdateLane) {
    try {
      const response = await fetch(GITHUB_RELEASES_API_URL, {
        headers: {
          accept: 'application/vnd.github+json',
        },
      })

      if (!response.ok)
        throw new Error(`Failed to fetch GitHub releases (${response.status} ${response.statusText})`)

      const payload = await response.json()
      if (!Array.isArray(payload))
        throw new Error('Unexpected GitHub releases payload shape')

      const tag = selectLatestTagForLane(payload as GitHubReleaseRecord[], lane)
      if (tag)
        return tag
    }
    catch (error) {
      log.withError(error).warn('GitHub releases API lookup failed, trying releases.atom fallback')
    }

    const atomResponse = await fetch(GITHUB_RELEASES_ATOM_URL)
    if (!atomResponse.ok)
      throw new Error(`Failed to fetch GitHub releases atom (${atomResponse.status} ${atomResponse.statusText})`)

    const atom = await atomResponse.text()
    const releasesFromAtom = extractReleaseTagsFromAtom(atom).map(tag => ({ tag_name: tag }))
    const tag = selectLatestTagForLane(releasesFromAtom, lane)
    if (!tag)
      throw new Error(`No GitHub release found for update lane "${lane}"`)

    return tag
  }

  async function prepareGitHubGenericFeed() {
    if (activeFeedUrlOverride)
      return
    if (resolvedReleaseTag)
      return
    if (prepareFeedPromise) {
      await prepareFeedPromise
      return
    }

    prepareFeedPromise = (async () => {
      const preferredLane = getPreferredUpdateLane({ storedLane: storedPreferredLane, version: appVersion })
      const tag = await resolveGitHubReleaseTagForLane(preferredLane)
      resolvedReleaseTag = tag
      applyGenericFeedOverride(`${GITHUB_RELEASE_DOWNLOAD_BASE_URL}/${tag}`, `github-release-lane:${preferredLane}`)
    })()

    try {
      await prepareFeedPromise
    }
    finally {
      prepareFeedPromise = undefined
    }
  }

  async function checkForUpdatesWithPreparedFeed() {
    await prepareGitHubGenericFeed()
    await autoUpdater.checkForUpdates()
  }

  autoUpdater.on('error', error => broadcastUpdaterError(error, 'autoUpdater error'))
  autoUpdater.on('checking-for-update', () => broadcast({ status: 'checking' }))
  autoUpdater.on('update-available', (info: UpdateInfo) => broadcast({ info, status: 'available' }))
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => broadcast({ info, status: 'downloaded' }))
  autoUpdater.on('update-not-available', () => broadcast({
    info: {
      files: [],
      releaseDate: committerDate,
      version: app.getVersion(),
    },
    status: 'not-available',
  }))
  autoUpdater.on('download-progress', progress => broadcast({
    ...state,
    progress: {
      bytesPerSecond: progress.bytesPerSecond,
      percent: progress.percent,
      total: progress.total,
      transferred: progress.transferred,
    },
    status: 'downloading',
  }))

  void checkForUpdatesWithPreparedFeed()
    .catch(error => broadcastUpdaterError(error, 'checkForUpdates() failed'))

  return {
    async checkForUpdates() {
      broadcast({ status: 'checking' })
      await checkForUpdatesWithPreparedFeed().catch(error => broadcastUpdaterError(error, 'checkForUpdates() failed'))
    },
    async downloadUpdate() {
      if (state.status === 'downloading' || state.status === 'downloaded')
        return

      await semaphore.acquire()

      try {
        await autoUpdater.downloadUpdate()
      }
      finally {
        semaphore.release()
      }
    },
    getPreferredUpdateLane() {
      return storedPreferredLane
    },
    async quitAndInstall() {
      await semaphore.acquire()

      try {
        if (isWindows)
          autoUpdater.quitAndInstall(true, true)
        else
          autoUpdater.quitAndInstall()
      }
      finally {
        semaphore.release()
      }
    },
    async setPreferredUpdateLane(lane) {
      if (storedPreferredLane === lane)
        return

      storedPreferredLane = lane
      options.setStoredUpdateLane?.(lane)
      resetPreparedFeedForLaneChange()
      // Keep UI state consistent with the newly selected lane.
      // A fresh check runs right after channel update from renderer.
      broadcast({ status: 'idle' })
    },
    get state() {
      return state
    },
    subscribe(callback) {
      hooks.add(callback)

      try {
        callback(state)
      }
      catch {}

      return () => {
        hooks.delete(callback)
      }
    },
  }
}

async function cleanupStaleUpdateFiles() {
  // Remove both current and legacy updater cache roots so stale installers do not linger.
  await Promise.allSettled(OFFICIAL_UPDATER_CACHE_DIRS.map(cacheDir => rm(cacheDir, { force: true, recursive: true })))
  await logToFile('INFO', `Updater cache cleanup attempted: ${OFFICIAL_UPDATER_CACHE_DIRS.join(', ')}`)
}

/**
 * Preserves the updater IPC contract when the storefront owns application updates.
 *
 * No method reaches Electron Updater or a release feed, while preference reads and
 * subscriptions remain available to existing renderer consumers.
 */
function createDisabledAutoUpdater(options: AutoUpdaterOptions): AutoUpdater {
  const state: AutoUpdaterState = { status: 'disabled' }
  let storedPreferredLane = options.getStoredUpdateLane?.()

  return {
    async checkForUpdates() {},
    async downloadUpdate() {},
    getPreferredUpdateLane() {
      return storedPreferredLane
    },
    async quitAndInstall() {},
    async setPreferredUpdateLane(lane) {
      storedPreferredLane = lane
      options.setStoredUpdateLane?.(lane)
    },
    state,
    subscribe(callback) {
      callback(state)
      return () => {}
    },
  }
}

/**
 * Extract release tags from GitHub releases Atom feed without adding XML-parser dependencies.
 *
 * The current feed contains entries like:
 * `<entry><link rel="alternate" type="text/html" href="https://github.com/moeru-ai/airi/releases/tag/v0.9.0-beta.6"/></entry>`
 * and
 * `<entry><id>tag:github.com,2008:Repository/963495975/v0.9.0-alpha.36</id></entry>`
 *
 * We intentionally scan for `/moeru-ai/airi/releases/tag/` so we only consume actual release tag links.
 */
function extractReleaseTagsFromAtom(atom: string) {
  const tags: string[] = []
  const marker = '/moeru-ai/airi/releases/tag/'
  let offset = 0

  while (offset < atom.length) {
    const markerIndex = atom.indexOf(marker, offset)
    if (markerIndex === -1)
      break

    const start = markerIndex + marker.length
    let end = start
    while (end < atom.length) {
      const char = atom[end]
      if (char === '"' || char === '<' || char === '?' || char === '&')
        break
      end += 1
    }

    // Slice the raw path segment after the marker, e.g. `v0.9.0-beta.6`.
    const rawTag = atom.slice(start, end).trim()
    // Atom encodes URLs, so decode in case future tags contain escaped characters.
    const decodedTag = decodeURIComponent(rawTag)
    // Feed entries can repeat across updates; keep a unique ordered tag list.
    if (decodedTag && !tags.includes(decodedTag))
      tags.push(decodedTag)

    offset = end + 1
  }

  return tags
}

function getPreferredUpdateLane(params: { storedLane?: UpdateLane, version: string }): UpdateLane {
  return normalizeLane(process.env[UPDATE_CHANNEL_ENV_KEY]?.trim()) ?? params.storedLane ?? laneFromVersion(params.version)
}

function getSemverFromTag(tag: string) {
  return semver.valid(tag) ?? semver.valid(tag.startsWith('v') ? tag.slice(1) : tag)
}

function getUpdateServerOverride() {
  // NOTICE: UPDATE_SERVER_URL is intentionally development-only for local update-test harness.
  // Production update routing must not depend on this variable.
  if (!is.dev)
    return undefined

  const value = process.env.UPDATE_SERVER_URL?.trim()
  return value || undefined
}

function getWindowsProtectedInstallRoots() {
  return [
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    process.env.ProgramW6432,
    process.env.SystemRoot,
    process.env.windir,
  ]
    .filter((value): value is string => Boolean(value))
    .map(value => normalize(value))
}

function isPathInside(parentPath: string, targetPath: string) {
  const normalizedParent = normalize(parentPath)
  const normalizedTarget = normalize(targetPath)
  const parentWithSeparator = normalizedParent.endsWith('\\') ? normalizedParent : `${normalizedParent}\\`
  return normalizedTarget === normalizedParent || normalizedTarget.startsWith(parentWithSeparator)
}

function isPrereleaseVersion(version: string) {
  return (semver.prerelease(version)?.length ?? 0) > 0
}

function isTagInLane(tag: string, lane: UpdateLane) {
  const version = getSemverFromTag(tag)
  if (!version)
    return false

  if (lane === 'latest')
    return true

  const prerelease = semver.prerelease(version)?.[0]?.toString().toLowerCase()
  if (lane === 'stable')
    return !prerelease

  return prerelease === lane
}

function laneFromVersion(version: string): UpdateLane {
  const prerelease = semver.prerelease(version)?.[0]?.toString().toLowerCase()
  return normalizeLane(prerelease) ?? 'stable'
}

async function logToFile(level: 'DEBUG' | 'ERROR' | 'INFO' | 'WARN', message: string) {
  await mkdir(UPDATER_DEBUG_CACHE_DIR, { recursive: true }).catch(() => {})
  await appendFile(UPDATER_LOG_FILE, `${new Date().toISOString()} [${level}] ${message}\n`).catch(() => {})
}

function normalizeLane(value: string | undefined): undefined | UpdateLane {
  if (!value)
    return undefined

  switch (value.toLowerCase()) {
    case 'alpha':
    case 'beta':
    case 'canary':
    case 'latest':
    case 'nightly':
    case 'stable':
      return value.toLowerCase() as UpdateLane
    default:
      return undefined
  }
}

function requiresAdminForInstallPath(executablePath: string) {
  if (!isWindows)
    return false

  const installDirectory = dirname(executablePath)
  return getWindowsProtectedInstallRoots().some(root => isPathInside(root, installDirectory))
}

function selectLatestTagForLane(releases: GitHubReleaseRecord[], lane: UpdateLane) {
  const candidates = releases
    .filter(release => !release.draft && typeof release.tag_name === 'string' && isTagInLane(release.tag_name, lane))
    .map((release) => {
      const tag = release.tag_name as string
      const version = getSemverFromTag(tag)
      return version ? { tag, version } : null
    })
    .filter(Boolean) as Array<{ tag: string, version: string }>

  candidates.sort((a, b) => semver.rcompare(a.version, b.version))
  return candidates[0]?.tag
}
