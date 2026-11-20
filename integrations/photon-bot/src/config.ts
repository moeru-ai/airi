import { env } from 'node:process'

import * as v from 'valibot'

const configSchema = v.object({
  airiUrl: v.optional(v.string(), 'ws://localhost:6121/ws'),
  airiToken: v.optional(v.string()),
  photonBaseUrl: v.optional(v.pipe(v.string(), v.url()), 'https://api.photon.codes'),
  photonProjectId: v.optional(v.string()),
  photonApiKey: v.optional(v.string()),
  stateFile: v.optional(v.string(), 'photon-bot-state.local.json'),
})

export type PhotonBotConfig = v.InferOutput<typeof configSchema>

/**
 * Reads the configuration from the environment. An empty value counts as not set.
 *
 * The Photon project ID and API key are optional here. The iMessage page of AIRI can send them later with `module:configure`.
 */
export function loadConfig(source: Record<string, string | undefined> = env): PhotonBotConfig {
  return v.parse(configSchema, {
    airiUrl: source.AIRI_URL || undefined,
    airiToken: source.AIRI_TOKEN || undefined,
    photonBaseUrl: source.PHOTON_BASE_URL || undefined,
    photonProjectId: source.PHOTON_PROJECT_ID || undefined,
    photonApiKey: source.PHOTON_API_KEY || undefined,
    stateFile: source.PHOTON_STATE_FILE || undefined,
  })
}

/** The settings that the iMessage page of AIRI sends with `module:configure`. */
export const moduleSettingsSchema = v.object({
  enabled: v.optional(v.boolean()),
  projectId: v.optional(v.string()),
  apiKey: v.optional(v.string()),
})

export type PhotonModuleSettings = v.InferOutput<typeof moduleSettingsSchema>
