import type { SteamInitResult, SteamTicketResult } from './types'

import { useLogg } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'
import { STEAM_APP_ID } from '@proj-airi/stage-shared/steam'

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

  try {
    const instance = getSteamworksSdk(module)
    if (!instance)
      return { ok: false, reason: 'api_unavailable' }
    if (!instance.user?.getAuthTicketForWebApi)
      return { ok: false, reason: 'api_unavailable' }

    const initialized = instance.init({ appId: STEAM_APP_ID })
    if (!initialized) {
      log.warn('SteamAPI_Init returned false')
      return { ok: false, reason: 'init_failed' }
    }

    steam = instance
    steamInitialized = true
    return { ok: true }
  }
  catch (error) {
    log.withError(error).warn('SteamAPI_Init failed')
    steam = null
    steamInitialized = false
    return { ok: false, reason: 'init_failed' }
  }
}

export async function getWebApiTicket(): Promise<SteamTicketResult> {
  if (!steamInitialized || !steam) {
    return { ok: false, reason: 'Steam is not initialized' }
  }

  try {
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
  catch (error) {
    return {
      ok: false,
      reason: errorMessageFrom(error) ?? 'GetAuthTicketForWebApi failed',
    }
  }
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
