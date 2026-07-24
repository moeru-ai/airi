import type { SteamInitResult, SteamTicketResult } from './types'

import process from 'node:process'

import { appendFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { is } from '@electron-toolkit/utils'
import { useLogg } from '@guiiai/logg'
import { app } from 'electron'

import { STEAM_APP_ID } from './types'

const log = useLogg('steam-client').useGlobalConfig()

// #region agent log
/** Temporary ETE markers for C1/C2 (packaged Steam init). Session af8d97. */
function steamDebugLog(message: string, data?: Record<string, unknown>): void {
  const line = `[${new Date().toISOString()}] ${message}${data ? ` ${JSON.stringify(data)}` : ''}\n`
  try {
    appendFileSync(join(app.getPath('userData'), 'steam-debug.log'), line, 'utf8')
  }
  catch {
    // Before app.ready or sandboxed write — ignore.
  }
  fetch('http://127.0.0.1:7272/ingest/025a1957-803e-4aec-a183-f77d1570779e', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'af8d97' },
    body: JSON.stringify({ sessionId: 'af8d97', location: 'steam/client.ts', message, data, timestamp: Date.now() }),
  }).catch(() => {})
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
    steamDebugLog('loadSteamModule:ok', { caseId: 'C1' })
    // #endregion
    return steamModule
  }
  catch (error) {
    // #region agent log
    steamDebugLog('loadSteamModule:fail', {
      caseId: 'C1',
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
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
  steamDebugLog('initSteam:start', {
    caseId: 'C1',
    cwd: process.cwd(),
    exe: is.dev ? '(dev)' : app.getPath('exe'),
    isDev: is.dev,
    platform: process.platform,
  })
  // #endregion

  const module = await loadSteamModule()
  if (!module) {
    // #region agent log
    steamDebugLog('initSteam:result', { caseId: 'C1', initOk: false, reason: 'not_steam' })
    // #endregion
    return { ok: false, reason: 'not_steam' }
  }

  const instance = getSteamworksSdk(module)
  if (!instance) {
    // #region agent log
    steamDebugLog('initSteam:result', { caseId: 'C1', initOk: false, reason: 'api_unavailable' })
    // #endregion
    return { ok: false, reason: 'api_unavailable' }
  }
  if (!instance.user?.getAuthTicketForWebApi) {
    // #region agent log
    steamDebugLog('initSteam:result', { caseId: 'C1', initOk: false, reason: 'api_unavailable' })
    // #endregion
    return { ok: false, reason: 'api_unavailable' }
  }

  // Pin the SDK location so we never depend on the library's cwd-based search
  // (which fails on macOS where .app bundles launch with cwd=/).
  const sdkPath = resolveSteamworksSdkPath()
  // #region agent log
  steamDebugLog('initSteam:setSdkPath', {
    caseId: 'C1',
    sdkPath,
    sdkExists: existsSync(sdkPath),
  })
  // #endregion
  instance.setSdkPath(sdkPath)

  // SteamAPICore.init() can throw (e.g. dlopen failure) rather than returning
  // false, so we must catch to avoid propagating an unhandled error through
  // the IPC handler.
  let initialized: boolean
  try {
    initialized = instance.init({ appId: STEAM_APP_ID })
  }
  catch (initError) {
    // #region agent log
    steamDebugLog('initSteam:result', {
      caseId: 'C2',
      initOk: false,
      reason: 'init_failed',
      threw: true,
      error: initError instanceof Error ? `${initError.name}: ${initError.message}` : String(initError),
    })
    // #endregion
    log.withError(initError).warn('SteamAPI init threw')
    return { ok: false, reason: 'init_failed' }
  }
  if (!initialized) {
    // #region agent log
    steamDebugLog('initSteam:result', { caseId: 'C2', initOk: false, reason: 'init_failed', threw: false })
    // #endregion
    log.warn('SteamAPI_Init returned false')
    return { ok: false, reason: 'init_failed' }
  }

  steam = instance
  steamInitialized = true
  // #region agent log
  steamDebugLog('initSteam:result', { caseId: 'C1', initOk: true, sdkPath })
  // #endregion
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
