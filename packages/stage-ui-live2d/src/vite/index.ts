import type { Cubism2CoreOptions, Cubism2Source } from '@proj-airi/unplugin-live2d-sdk/vite'

import process from 'node:process'

import { resolve } from 'node:path'

const mirroredCore = {
  url: 'https://cdn.jsdelivr.net/gh/dylanNew/live2d@fd9fd400845e9a00bb194fdac0b6635c753a1e8a/webgl/Live2D/lib/live2d.min.js',
  sha256: 'e4ea1f18bdd44b65394ffd5a1bab16982e88757d45134d1bd0737c8a6b3ddd08',
} as const

export interface CreateCubism2CoreOptions {
  /** Whether production builds may emit the configured proprietary Core. */
  distribution: Cubism2CoreOptions['distribution']
}

/**
 * Builds AIRI's source policy for the SDK-owned Cubism 2 Core provisioner.
 *
 * This helper only expresses precedence and integrity policy. The upstream
 * plugin owns filesystem access, downloads, caching, serving, and emission.
 */
export function createCubism2CoreOptions(options: CreateCubism2CoreOptions): Cubism2CoreOptions {
  const sources: Cubism2Source[] = []
  const configuredPath = process.env.AIRI_CUBISM2_CORE_PATH
  const configuredPathSha256 = process.env.AIRI_CUBISM2_CORE_SHA256
  if (configuredPath) {
    sources.push({
      path: configuredPath,
      sha256: configuredPathSha256,
      optional: true,
    })
  }

  sources.push({
    path: resolve(import.meta.dirname, '..', '..', '.cubism2', 'live2d.min.js'),
    sha256: configuredPathSha256 ?? mirroredCore.sha256,
    optional: true,
  })

  const configuredUrl = process.env.AIRI_CUBISM2_CORE_URL
  const configuredUrlSha256 = process.env.AIRI_CUBISM2_CORE_URL_SHA256
  if (configuredUrl && configuredUrlSha256) {
    sources.push({
      url: configuredUrl,
      sha256: configuredUrlSha256,
      optional: true,
    })
  }
  else if (!configuredUrl) {
    sources.push({ ...mirroredCore, optional: true })
  }

  return {
    sources,
    cacheDir: resolve(import.meta.dirname, '..', '..', '.cubism2', 'cache'),
    timeout: 10_000,
    distribution: options.distribution,
  }
}
