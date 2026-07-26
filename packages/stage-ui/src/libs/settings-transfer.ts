import { errorMessageFrom } from '@moeru/std'
import { literal, object, record, safeParse, string } from 'valibot'

/**
 * Minimal Storage surface used by the backup functions, so they can run
 * against `localStorage` in the app and a plain fake in unit tests without
 * mocking globals.
 */
export interface StorageLike {
  readonly length: number
  key: (index: number) => string | null
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

/**
 * A portable snapshot of AIRI's persisted settings.
 *
 * Values are the raw localStorage strings, NOT parsed JSON: vueuse's
 * useLocalStorage serializes by initial-value type (plain strings stay raw,
 * objects become JSON), so re-encoding values here would corrupt string
 * settings on import. Copying raw strings guarantees exact fidelity.
 */
export interface SettingsBackup {
  kind: 'airi-settings-backup'
  version: 1
  settings: Record<string, string>
}

// Keys eligible for export/import. Everything persisted under settings/
// (including provider credentials), plus a handful of top-level keys that
// hold user preferences rather than device or account state.
const EXPORTABLE_PREFIXES = ['settings/', 'artistry-', 'onboarding/']
const EXPORTABLE_KEYS = new Set(['airi-card-active-id', 'mcp/connected'])

// NOTICE:
// auth/* (OIDC session and refresh tokens) and user/* (server-owned account
// state) are deliberately never exported nor imported: session tokens are
// bound to the signed-in device and expire, and restoring them onto another
// install is a credential-leak hazard with no migration value. This is a
// policy decision, not an oversight; remove only if auth intentionally moves
// to a portable format.
const BLOCKED_PREFIXES = ['auth/', 'user/']

// Keys whose values are credentials. They are exported only on explicit
// request (the UI requires a second confirmation, per the request in
// https://github.com/moeru-ai/airi/issues/1254) but always accepted on
// import: an import file containing secrets was exported intentionally.
const SECRET_KEY_PATTERN = /api-key|api-secret|-token|\/token|secret|credentials/

function isBlocked(key: string): boolean {
  return BLOCKED_PREFIXES.some(prefix => key.startsWith(prefix))
}

function isExportable(key: string): boolean {
  if (isBlocked(key))
    return false

  return EXPORTABLE_KEYS.has(key) || EXPORTABLE_PREFIXES.some(prefix => key.startsWith(prefix))
}

/** Whether a settings key stores credentials (API keys, tokens, secrets). */
export function isSecretSettingsKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key)
}

const settingsBackupSchema = object({
  kind: literal('airi-settings-backup'),
  version: literal(1),
  settings: record(string(), string()),
})

/**
 * Collects the exportable settings from storage into a backup snapshot.
 *
 * Secrets (API keys, tokens) are omitted unless `includeSecrets` is set —
 * callers must get explicit user confirmation before requesting them.
 */
export function collectSettingsBackup(storage: StorageLike, options: { includeSecrets: boolean }): SettingsBackup {
  const settings: Record<string, string> = {}

  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index)
    if (!key || !isExportable(key))
      continue

    if (!options.includeSecrets && isSecretSettingsKey(key))
      continue

    const value = storage.getItem(key)
    if (value !== null)
      settings[key] = value
  }

  return { kind: 'airi-settings-backup', version: 1, settings }
}

/** Serializes a backup for file download. */
export function serializeSettingsBackup(backup: SettingsBackup): string {
  return `${JSON.stringify(backup, null, 2)}\n`
}

/**
 * Parses a previously exported settings backup.
 *
 * @throws Error with a user-facing message when the content is not a
 * version-1 AIRI settings backup.
 */
export function parseSettingsBackup(content: string): SettingsBackup {
  let data: unknown
  try {
    data = JSON.parse(content)
  }
  catch (error) {
    throw new Error(`Failed to parse settings backup: ${errorMessageFrom(error) ?? 'unknown error'}`)
  }

  const result = safeParse(settingsBackupSchema, data)
  if (!result.success)
    throw new Error('This file does not look like an AIRI settings backup.')

  return result.output
}

/**
 * Writes a backup's settings into storage and reports how many keys were
 * applied.
 *
 * Keys outside the exportable policy are silently dropped: an imported file
 * is untrusted input and must not be able to plant auth/session tokens or
 * arbitrary storage entries.
 */
export function applySettingsBackup(storage: StorageLike, backup: SettingsBackup): { appliedCount: number } {
  let appliedCount = 0

  for (const [key, value] of Object.entries(backup.settings)) {
    if (!isExportable(key))
      continue

    storage.setItem(key, value)
    appliedCount++
  }

  return { appliedCount }
}
