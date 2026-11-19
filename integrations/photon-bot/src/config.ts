import { env } from 'node:process'

import * as v from 'valibot'

const configSchema = v.object({
  airiUrl: v.optional(v.string(), 'ws://localhost:6121/ws'),
  airiToken: v.optional(v.string()),
  photonBaseUrl: v.optional(v.pipe(v.string(), v.url()), 'https://api.photon.codes'),
  photonProjectId: v.pipe(v.string('PHOTON_PROJECT_ID is required'), v.nonEmpty()),
  photonApiKey: v.pipe(v.string('PHOTON_API_KEY is required'), v.nonEmpty()),
  stateFile: v.optional(v.string(), 'photon-bot-state.local.json'),
})

export type PhotonBotConfig = v.InferOutput<typeof configSchema>

/** Reads the configuration from the environment. An empty value counts as not set. */
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
