import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { AutoUpdaterState } from '@proj-airi/electron-eventa/electron-updater'
import type { BrowserWindow } from 'electron'
import type { UpdateInfo } from 'electron-updater'

import fs from 'node:fs'
import process from 'node:process'

import { join } from 'node:path'

import electronUpdater from 'electron-updater'
import semver from 'semver'

import { is } from '@electron-toolkit/utils'
import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom, tryCatch } from '@moeru/std'
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
  switch (process.platform) {
    case 'win32':
      return process.env.LOCALAPPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Local')
    case 'darwin':
      return join(process.env.HOME || '', 'Library', 'Caches')
    default:
      return process.env.XDG_CACHE_HOME || join(process.env.HOME || '', '.cache')
  }
}

const UPDATER_DEBUG_CACHE_DIR = join(getCacheRoot(), 'stage-tamagotchi-updater')
const UPDATER_LOG_FILE = join(UPDATER_DEBUG_CACHE_DIR, 'updater-log.txt')
const OFFICIAL_UPDATER_CACHE_DIR = join(getCacheRoot(), 'ai.moeru.airi-updater')

async function logToFile(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string) {
  await fs.promises.mkdir(UPDATER_DEBUG_CACHE_DIR, { recursive: true }).catch(() => {})
  await fs.promises.appendFile(UPDATER_LOG_FILE, `${new Date().toISOString()} [${level}] ${message}\n`).catch(() => {})
}

async function cleanupStaleUpdateFiles() {
  // Remove the updater cache root after the app relaunches so stale installer files do not linger.
  await fs.promises.rm(OFFICIAL_UPDATER_CACHE_DIR, { recursive: true, force: true }).catch(() => {})
  await logToFile('INFO', `Updater cache cleanup attempted: ${OFFICIAL_UPDATER_CACHE_DIR}`)
}

export type UpdateLane = 'stable' | 'alpha' | 'beta' | 'nightly' | 'canary'
interface GitHubReleaseRecord {
  tag_name?: string
  draft?: boolean
  prerelease?: boolean
}

function getUpdateServerOverride() {
  // NOTICE: UPDATE_SERVER_URL is intentionally development-only for local update-test harness.
  // Production update routing must not depend on this variable.
  if (!is.dev)
    return undefined

  const value = process.env.UPDATE_SERVER_URL?.trim()
  return value || undefined
}

function normalizeLane(value: string | undefined): UpdateLane | undefined {
  if (!value)
    return undefined

  switch (value.toLowerCase()) {
    case 'stable':
    case 'alpha':
    case 'beta':
    case 'nightly':
    case 'canary':
      return value.toLowerCase() as UpdateLane
    default:
      return undefined
  }
}

function laneFromVersion(version: string): UpdateLane {
  const prerelease = semver.prerelease(version)?.[0]?.toString().toLowerCase()
  return normalizeLane(prerelease) ?? 'stable'
}

function getPreferredUpdateLane(params: { version: string, storedLane?: UpdateLane }): UpdateLane {
  return normalizeLane(process.env[UPDATE_CHANNEL_ENV_KEY]?.trim()) ?? params.storedLane ?? laneFromVersion(params.version)
}

function getSemverFromTag(tag: string) {
  return semver.valid(tag) ?? semver.valid(tag.startsWith('v') ? tag.slice(1) : tag)
}

function isTagInLane(tag: string, lane: UpdateLane) {
  const version = getSemverFromTag(tag)
  if (!version)
    return false

  const prerelease = semver.prerelease(version)?.[0]?.toString().toLowerCase()
  if (lane === 'stable')
    return !prerelease

  return prerelease === lane
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

export interface AppUpdaterLike {
  on: (event: string, listener: (...args: any[]) => void) => any
  checkForUpdates: () => Promise<any>
  downloadUpdate: () => Promise<any>
  quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => Promise<void> | void
  setFeedURL?: (options: { provider: 'generic', url: string }) => void
  logger?: any
  allowPrerelease?: boolean
  autoDownload?: boolean
  channel?: string
  forceDevUpdateConfig?: boolean
}

// NOTICE: this part of code is copied from https://www.electron.build/auto-update
// Or https://github.com/electron-userland/electron-builder/blob/b866e99ccd3ea9f85bc1e840f0f6a6a162fca388/pages/auto-update.md?plain=1#L57-L66
export function fromImported(): AppUpdaterLike {
  if (is.dev && !getUpdateServerOverride())
    return new MockAutoUpdater()

  const { autoUpdater } = electronUpdater
  return autoUpdater as unknown as AppUpdaterLike
}

type MainContext = ReturnType<typeof createContext>['context']

export interface AutoUpdater {
  state: AutoUpdaterState
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  quitAndInstall: () => Promise<void>
  getPreferredUpdateLane: () => UpdateLane | undefined
  setPreferredUpdateLane: (lane: UpdateLane | undefined) => Promise<void>
  subscribe: (callback: (state: AutoUpdaterState) => void) => () => void
}

export interface AutoUpdaterOptions {
  getStoredUpdateLane?: () => UpdateLane | undefined
  setStoredUpdateLane?: (lane: UpdateLane | undefined) => void
}

function isPrereleaseVersion(version: string) {
  return (semver.prerelease(version)?.length ?? 0) > 0
}

export function setupAutoUpdater(options: AutoUpdaterOptions = {}): AutoUpdater {
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
    info: (message: string) => {
      log.log(message)
      void logToFile('INFO', message)
    },
    warn: (message: string) => {
      log.warn(message)
      void logToFile('WARN', message)
    },
    error: (message: string) => {
      log.error(message)
      void logToFile('ERROR', message)
    },
    debug: (message: string) => {
      log.debug(message)
      void logToFile('DEBUG', message)
    },
  }

  if (activeFeedUrlOverride)
    autoUpdater.setFeedURL?.({ provider: 'generic', url: activeFeedUrlOverride })

  const withDiagnostics = (next: AutoUpdaterState): AutoUpdaterState => ({
    ...next,
    diagnostics: {
      platform: process.platform,
      arch: process.arch,
      channel: autoUpdater.channel || releaseChannelName,
      logFilePath: UPDATER_LOG_FILE,
      executablePath: process.execPath,
      isOverrideActive: !!activeFeedUrlOverride,
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
      status: 'error',
      error: { message: errorMessageFrom(error) ?? String(error) },
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
      const preferredLane = getPreferredUpdateLane({ version: appVersion, storedLane: storedPreferredLane })
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
  autoUpdater.on('update-available', (info: UpdateInfo) => broadcast({ status: 'available', info }))
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => broadcast({ status: 'downloaded', info }))
  autoUpdater.on('update-not-available', () => broadcast({
    status: 'not-available',
    info: {
      version: app.getVersion(),
      files: [],
      releaseDate: committerDate,
    },
  }))
  autoUpdater.on('download-progress', progress => broadcast({
    ...state,
    status: 'downloading',
    progress: {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    },
  }))

  void checkForUpdatesWithPreparedFeed()
    .catch(error => broadcastUpdaterError(error, 'checkForUpdates() failed'))

  return {
    get state() {
      return state
    },
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
    getPreferredUpdateLane() {
      return storedPreferredLane
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

export function createAutoUpdaterService(params: { context: MainContext, window: BrowserWindow, service: AutoUpdater }) {
  const { context, window, service } = params

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
