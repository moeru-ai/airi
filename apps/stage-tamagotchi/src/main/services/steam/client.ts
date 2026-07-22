import type { SteamInitResult, SteamTicketResult } from './types'

import process from 'node:process'

import { appendFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { is } from '@electron-toolkit/utils'
import { useLogg } from '@guiiai/logg'
import { app } from 'electron'

import { STEAM_APP_ID } from './types'

const log = useLogg('steam-client').useGlobalConfig()

// #region agent log
// Runtime instrumentation for Steam init debugging. Writes to both a dedicated
// file (~/Library/Application Support/AIRI/steam-debug.log) and the debug HTTP
// endpoint so logs survive even if the debug server isn't running.
function steamDebugLog(message: string, data?: Record<string, unknown>): void {
  const ts = new Date().toISOString()
  const line = `[${ts}] ${message}${data ? ` ${JSON.stringify(data)}` : ''}\n`
  try {
    const debugLogPath = join(app.getPath('userData'), 'steam-debug.log')
    appendFileSync(debugLogPath, line, 'utf8')
  }
  catch {
    // File write may fail before app is ready; ignore.
  }
  fetch('http://127.0.0.1:7272/ingest/025a1957-803e-4aec-a183-f77d1570779e', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '7c9b4e' },
    body: JSON.stringify({ sessionId: '7c9b4e', location: 'steam/client.ts', message, data, timestamp: Date.now() }),
  }).catch(() => {})
  log.debug(message, data)
}
// #endregion

type SteamworksModule = typeof import('steamworks-ffi-node')
type SteamworksSdkClass = SteamworksModule['SteamworksSDK']
type SteamworksSdk = ReturnType<SteamworksSdkClass['getInstance']>

function getSteamworksSdk(module: SteamworksModule): SteamworksSdk | null {
  const ctor = module.SteamworksSDK
    ?? (module.default as { default?: SteamworksSdkClass }).default
  if (typeof ctor?.getInstance !== 'function')
    return null
  return ctor.getInstance()
}

/**
 * Resolves the `steamworks_sdk` directory deterministically from the executable
 * instead of relying on the library's cwd/`__dirname` heuristics.
 *
 * Why: macOS `.app` bundles launched via Steam/Finder run with `process.cwd() === '/'`,
 * so the library's cwd-based search never reaches the SDK placed beside `AIRI.app`
 * by electron-builder `afterPack`. Windows/Linux keep cwd at the install dir, but we
 * resolve from the exe anyway for a single consistent rule.
 *
 * Dev keeps the package-root layout produced by `pack-steam-redistributables.ts`.
 */
function resolveSteamworksSdkPath(): string {
  if (is.dev)
    return join(process.cwd(), 'steamworks_sdk')

  // exe = AIRI.app/Contents/MacOS/airi (macOS) | <install>/airi.exe (Windows) | <install>/airi (Linux)
  const exeDir = dirname(app.getPath('exe'))
  // macOS: climb MacOS -> Contents -> AIRI.app -> install dir (SDK sits beside the .app).
  // Win/Linux: exe already lives in the install dir alongside the SDK.
  const installDir = process.platform === 'darwin' ? dirname(dirname(dirname(exeDir))) : exeDir
  return join(installDir, 'steamworks_sdk')
}

let steamModule: SteamworksModule | null = null
let steam: SteamworksSdk | null = null
let steamInitialized = false

async function loadSteamModule(): Promise<SteamworksModule | null> {
  if (steamModule)
    return steamModule

  try {
    steamModule = await import('steamworks-ffi-node')
    // #region agent log
    steamDebugLog('loadSteamModule: import resolved', { hypothesisId: 'H1' })
    // #endregion
    return steamModule
  }
  catch (error) {
    // #region agent log
    steamDebugLog('loadSteamModule: import rejected', {
      hypothesisId: 'H1',
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      stack: error instanceof Error ? error.stack?.split('\n').slice(0, 5).join(' | ') : undefined,
    })
    // #endregion
    log.withError(error).debug('steamworks-ffi-node is not available')
    return null
  }
}

export async function initSteam(): Promise<SteamInitResult> {
  if (steamInitialized)
    return { ok: true }

  // #region agent log
  const exePath = is.dev ? '(dev)' : app.getPath('exe')
  steamDebugLog('initSteam: start', { cwd: process.cwd(), exe: exePath, isDev: is.dev, platform: process.platform, hypothesisId: 'H1-H5' })
  // #endregion

  const module = await loadSteamModule()
  if (!module) {
    // #region agent log
    steamDebugLog('initSteam: module import failed -> not_steam', { hypothesisId: 'H1' })
    // #endregion
    return { ok: false, reason: 'not_steam' }
  }

  // #region agent log
  steamDebugLog('initSteam: module imported OK', { hypothesisId: 'H1-rejected' })
  // #endregion

  const instance = getSteamworksSdk(module)
  if (!instance) {
    // #region agent log
    steamDebugLog('initSteam: getInstance returned null -> api_unavailable', { hypothesisId: 'H1b' })
    // #endregion
    return { ok: false, reason: 'api_unavailable' }
  }
  if (!instance.user?.getAuthTicketForWebApi) {
    // #region agent log
    steamDebugLog('initSteam: getAuthTicketForWebApi missing -> api_unavailable', { hypothesisId: 'H1b' })
    // #endregion
    return { ok: false, reason: 'api_unavailable' }
  }

  // Pin the SDK location so we never depend on the library's cwd-based search
  // (which fails on macOS where .app bundles launch with cwd=/).
  const sdkPath = resolveSteamworksSdkPath()
  // #region agent log
  steamDebugLog('initSteam: setSdkPath', { sdkPath, hypothesisId: 'H3-H5' })
  // #endregion
  instance.setSdkPath(sdkPath)

  let initialized: boolean
  try {
    initialized = instance.init({ appId: STEAM_APP_ID })
  }
  catch (initError) {
    // #region agent log
    steamDebugLog('initSteam: instance.init() THREW', {
      hypothesisId: 'H2-H3-H5',
      sdkPath,
      error: initError instanceof Error ? `${initError.name}: ${initError.message}` : String(initError),
      stack: initError instanceof Error ? initError.stack?.split('\n').slice(0, 8).join(' | ') : undefined,
    })
    // #endregion
    log.withError(initError).warn('instance.init() threw')
    return { ok: false, reason: 'init_failed' }
  }
  if (!initialized) {
    // #region agent log
    steamDebugLog('initSteam: SteamAPI_Init returned false -> init_failed', { sdkPath, hypothesisId: 'H2-H3' })
    // #endregion
    log.warn('SteamAPI_Init returned false')
    return { ok: false, reason: 'init_failed' }
  }

  // #region agent log
  steamDebugLog('initSteam: success', { hypothesisId: 'all-rejected' })
  // #endregion
  steam = instance
  steamInitialized = true
  return { ok: true }
}

export async function getWebApiTicket(): Promise<SteamTicketResult> {
  if (!steamInitialized || !steam) {
    return { ok: false, reason: 'Steam is not initialized' }
  }

  const result = await steam.user.getAuthTicketForWebApi({
    genericString: 'airi-desktop',
  })

  if (!result.success || !result.ticketHex) {
    return {
      ok: false,
      reason: result.error ?? 'GetAuthTicketForWebApi failed',
    }
  }

  return { ok: true, ticketHex: result.ticketHex }
}

export function shutdownSteam(): void {
  if (!steamInitialized || !steam)
    return

  try {
    steam.shutdown()
  }
  catch (error) {
    log.withError(error).warn('SteamAPI_Shutdown failed')
  }
  finally {
    steam = null
    steamInitialized = false
  }
}

/** @internal */
export function resetSteamClientForTests(): void {
  shutdownSteam()
  steamModule = null
}
