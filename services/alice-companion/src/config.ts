import type { InferOutput } from 'valibot'

import { check, integer, minValue, nonEmpty, object, optional, parse, picklist, pipe, regex, string, transform } from 'valibot'

const SiteName = /^[\w-]+$/

function integerFromString(defaultValue: number, envKey: string, minimum: number) {
  return optional(
    pipe(
      string(),
      nonEmpty(`${envKey} must not be empty`),
      transform(input => Number(input)),
      integer(`${envKey} must be an integer`),
      minValue(minimum, `${envKey} must be at least ${minimum}`),
    ),
    String(defaultValue),
  )
}

function booleanFromString(defaultValue: boolean, envKey: string) {
  return optional(
    pipe(
      picklist(['true', 'false'], `${envKey} must be "true" or "false"`),
      transform(input => input === 'true'),
    ),
    defaultValue ? 'true' : 'false',
  )
}

function isTimeZone(value: string): boolean {
  try {
    // `Intl.DateTimeFormat` throws a RangeError for an unknown IANA time zone.
    void new Intl.DateTimeFormat('en', { timeZone: value })
    return true
  }
  catch {
    return false
  }
}

/** Environment of the service. Every value has a default except the secrets, which are optional. */
const EnvSchema = object({
  ALICE_COMPANION_MQTT_URL: optional(pipe(string(), nonEmpty()), 'mqtt://localhost:1883'),
  ALICE_COMPANION_MQTT_USERNAME: optional(string()),
  ALICE_COMPANION_MQTT_PASSWORD: optional(string()),
  /** Directory of `state.json`, `state.json.bak`, `audit.jsonl`, and the lock file. */
  ALICE_COMPANION_DATA_DIR: optional(pipe(string(), nonEmpty()), './data'),
  ALICE_COMPANION_PERSONA_ID: optional(pipe(string(), regex(SiteName)), 'alice'),
  ALICE_COMPANION_OWNER_PROFILE_ID: optional(pipe(string(), regex(SiteName)), 'default'),
  ALICE_COMPANION_PUBLISH_SITE: optional(pipe(string(), regex(SiteName, 'ALICE_COMPANION_PUBLISH_SITE must be one topic level')), 'companion'),
  /** Comma-separated sites to read. Empty reads all sites. */
  ALICE_COMPANION_INPUT_SITES: optional(
    pipe(string(), transform(raw => raw.split(',').map(site => site.trim()).filter(Boolean))),
    '',
  ),
  ALICE_COMPANION_TIME_ZONE: optional(pipe(string(), check(isTimeZone, 'ALICE_COMPANION_TIME_ZONE must be an IANA time zone')), 'America/Sao_Paulo'),
  ALICE_COMPANION_ENERGY_MODE: optional(picklist(['simulation', 'disabled']), 'simulation'),
  ALICE_COMPANION_DERIVE_INTERACTIONS: booleanFromString(true, 'ALICE_COMPANION_DERIVE_INTERACTIONS'),
  ALICE_COMPANION_DERIVE_WINDOW_MS: integerFromString(120_000, 'ALICE_COMPANION_DERIVE_WINDOW_MS', 1_000),
  ALICE_COMPANION_REFRESH_INTERVAL_MS: integerFromString(600_000, 'ALICE_COMPANION_REFRESH_INTERVAL_MS', 10_000),
})

export type CompanionEnv = InferOutput<typeof EnvSchema>

/** Parses the environment. Throws a Valibot error with the first invalid key. */
export function parseEnv(env: Record<string, string | undefined>): CompanionEnv {
  return parse(EnvSchema, env)
}
