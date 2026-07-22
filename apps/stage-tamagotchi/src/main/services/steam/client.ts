import type { SteamInitResult, SteamTicketResult } from './types'

import process from 'node:process'

import { dirname, join } from 'node:path'

import { is } from '@electron-toolkit/utils'
import { useLogg } from '@guiiai/logg'
import { app } from 'electron'

import { STEAM_APP_ID } from './types'

const log = useLogg('steam-client').useGlobalConfig()

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
    return steamModule
  }
  catch (error) {
    log.withError(error).debug('steamworks-ffi-node is not available')
    return null
  }
}

export async function initSteam(): Promise<SteamInitResult> {
  if (steamInitialized)
    return { ok: true }

  const module = await loadSteamModule()
  if (!module) {
    return { ok: false, reason: 'not_steam' }
  }

  const instance = getSteamworksSdk(module)
  if (!instance)
    return { ok: false, reason: 'api_unavailable' }
  if (!instance.user?.getAuthTicketForWebApi)
    return { ok: false, reason: 'api_unavailable' }

  // Pin the SDK location so we never depend on the library's cwd-based search
  // (which fails on macOS where .app bundles launch with cwd=/).
  instance.setSdkPath(resolveSteamworksSdkPath())

  const initialized = instance.init({ appId: STEAM_APP_ID })
  if (!initialized) {
    log.warn('SteamAPI_Init returned false')
    return { ok: false, reason: 'init_failed' }
  }

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
