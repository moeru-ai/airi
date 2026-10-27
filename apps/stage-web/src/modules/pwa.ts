export { registerSW } from 'virtual:pwa-register'

export interface StageWebBuild {
  version: string
  commit: string
  builtAt: string
}

declare const __STAGE_WEB_BUILD__: StageWebBuild

/** The build this page was loaded from. `version.json` of the same build has the same value. */
export const currentBuild: StageWebBuild = __STAGE_WEB_BUILD__

export function formatBuild(build: StageWebBuild) {
  return `${build.version} · ${build.commit} · ${build.builtAt.slice(5, 16).replace('T', ' ')}`
}

/**
 * Reads the build the waiting service worker will switch to. `version.json` is not
 * precached, so this request reaches the network.
 */
export async function fetchWaitingBuild(): Promise<StageWebBuild | undefined> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-store' })
    return res.ok ? await res.json() : undefined
  }
  catch {
    return undefined
  }
}
