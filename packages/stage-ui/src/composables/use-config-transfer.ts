import { parse, stringify } from 'yaml'

import { useConsciousnessStore } from '../stores/modules/consciousness'
import { useHearingStore } from '../stores/modules/hearing'
import { useSpeechStore } from '../stores/modules/speech'
import { useProvidersStore } from '../stores/providers'

// ——————————————————————————————————————————
// Types
// ——————————————————————————————————————————

export interface ProviderCredentialsData {
  format: 'airi-provider-credentials:v1'
  providers: Record<string, Record<string, unknown>>
}

export interface AiriSettingsData {
  format: 'airi-settings:v1'
  modules: {
    consciousness: {
      activeProvider: string
      activeModel: string
      customModelName: string
    }
    speech: {
      activeProvider: string
      activeModel: string
      voiceId: string
      pitch: number
      rate: number
      ssmlEnabled: boolean
      language: string
    }
    hearing: {
      activeProvider: string
      activeModel: string
      customModelName: string
      autoSendEnabled: boolean
      autoSendDelay: number
    }
  }
}

export type ConfigFormat = 'yaml' | 'env'

// ——————————————————————————————————————————
// Helpers
// ——————————————————————————————————————————

/**
 * Convert a string to UPPER_SNAKE_CASE for use in .env keys.
 * Handles both kebab-case provider IDs and camelCase field names.
 */
function toUpperSnake(str: string): string {
  return str
    .replace(/-/g, '_') // kebab to underscore
    .replace(/([a-z])([A-Z])/g, '$1_$2') // camelCase split
    .toUpperCase()
}

/**
 * Convert UPPER_SNAKE_CASE to camelCase.
 * Used to restore field names when parsing .env content.
 */
function upperSnakeToCamel(str: string): string {
  return str
    .toLowerCase()
    .replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

/**
 * Keys that must never be used as object property names to prevent prototype pollution.
 */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Sanitize a value before embedding it into a .env format line.
 * Strips newline characters to prevent .env injection attacks where a crafted
 * value could introduce additional key-value pairs into the exported file.
 */
function sanitizeEnvValue(value: unknown): string {
  return String(value).replace(/[\r\n]/g, '')
}

/**
 * Parse a simple KEY=VALUE .env format.
 * Lines starting with '#' or empty lines are ignored.
 * Values are trimmed and surrounding quotes are stripped.
 * Keys matching dangerous prototype names are silently dropped.
 */
function parseEnv(content: string): Record<string, string> {
  // Use Object.create(null) to avoid accidental prototype-chain access on the accumulator
  const result = Object.create(null) as Record<string, string>
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#'))
      continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex < 0)
      continue
    const key = trimmed.slice(0, eqIndex).trim()
    // Reject dangerous keys that could cause prototype pollution
    if (DANGEROUS_KEYS.has(key))
      continue
    let value = trimmed.slice(eqIndex + 1).trim()
    // Strip surrounding single or double quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\'')))
      value = value.slice(1, -1)
    result[key] = value
  }
  return result
}

// ——————————————————————————————————————————
// Composable
// ——————————————————————————————————————————

/**
 * Composable for exporting and importing AIRI configuration.
 *
 * Supports two categories:
 *  - Provider credentials (API keys, base URLs, etc.)
 *  - Module settings (active provider/model selections, speech tuning, hearing options)
 *
 * Each category can be serialized as YAML or .env format.
 *
 * The .env key conventions are:
 *  - Providers: `AIRI_PROV_<PROVIDER_ID>__<FIELD>` (e.g. `AIRI_PROV_OPENAI__API_KEY`)
 *  - Modules:   `AIRI_MOD_<MODULE>__<FIELD>`        (e.g. `AIRI_MOD_CONSCIOUSNESS__ACTIVE_PROVIDER`)
 */
export function useConfigTransfer() {
  const providersStore = useProvidersStore()
  const consciousnessStore = useConsciousnessStore()
  const speechStore = useSpeechStore()
  const hearingStore = useHearingStore()

  // ——————————————————————————————————————————
  // Provider credentials
  // ——————————————————————————————————————————

  function getProviderCredentialsData(): ProviderCredentialsData {
    return {
      format: 'airi-provider-credentials:v1',
      // Deep clone so callers cannot accidentally mutate the store
      providers: JSON.parse(JSON.stringify(providersStore.providers)),
    }
  }

  function exportProviderCredentials(format: ConfigFormat): string {
    const data = getProviderCredentialsData()

    if (format === 'yaml') {
      return stringify(data)
    }

    // .env format — prefix: AIRI_PROV_<PROVIDER_ID>__<FIELD>
    const lines: string[] = [
      '# AIRI Provider Credentials',
      '# WARNING: This file contains sensitive credentials in plaintext. Keep it safe.',
      '',
    ]
    for (const [providerId, config] of Object.entries(data.providers)) {
      const prefix = `AIRI_PROV_${toUpperSnake(providerId)}`
      for (const [field, value] of Object.entries(config)) {
        if (value === null || value === undefined || value === '')
          continue
        if (typeof value === 'object') {
          // Handle nested objects (e.g. volcengine's app: { appId: '...' })
          // NOTICE: Use double underscore (__) as the nested separator to stay consistent
          // with the top-level separator and allow unambiguous reconstruction on import.
          for (const [nestedKey, nestedValue] of Object.entries(value as Record<string, unknown>)) {
            if (nestedValue !== null && nestedValue !== undefined && nestedValue !== '') {
              lines.push(`${prefix}__${toUpperSnake(field)}__${toUpperSnake(nestedKey)}=${sanitizeEnvValue(nestedValue)}`)
            }
          }
        }
        else {
          lines.push(`${prefix}__${toUpperSnake(field)}=${sanitizeEnvValue(value)}`)
        }
      }
    }
    return lines.join('\n')
  }

  /**
   * Import provider credentials from a YAML or .env string.
   * Merges into existing credentials (does not wipe uncovered providers).
   */
  function importProviderCredentials(content: string, format: ConfigFormat): void {
    if (format === 'yaml') {
      const data = parse(content) as ProviderCredentialsData
      if (!data || data.format !== 'airi-provider-credentials:v1' || typeof data.providers !== 'object') {
        throw new Error('Invalid YAML: expected format "airi-provider-credentials:v1"')
      }
      for (const [providerId, config] of Object.entries(data.providers)) {
        // Guard against prototype pollution from crafted YAML
        if (DANGEROUS_KEYS.has(providerId))
          continue
        // Safe merge: copy only own enumerable props, skipping dangerous keys
        const safeConfig: Record<string, unknown> = Object.create(null)
        for (const [k, v] of Object.entries(config)) {
          if (!DANGEROUS_KEYS.has(k))
            safeConfig[k] = v
        }
        providersStore.providers[providerId] = {
          ...providersStore.providers[providerId],
          ...safeConfig,
        }
        // Mark the provider as added when at least one field is non-empty
        if (Object.values(safeConfig).some(v => v !== null && v !== undefined && v !== '')) {
          providersStore.addedProviders[providerId] = true
        }
      }
    }
    else {
      // .env format
      const env = parseEnv(content)
      // Use Object.create(null) to prevent prototype pollution on the accumulator
      const providerMap = Object.create(null) as Record<string, Record<string, string>>

      for (const [key, value] of Object.entries(env)) {
        if (!key.startsWith('AIRI_PROV_'))
          continue
        const rest = key.slice('AIRI_PROV_'.length)
        const sepIdx = rest.indexOf('__')
        if (sepIdx < 0)
          continue
        // Convert UPPER_SNAKE back to kebab-case provider ID
        const providerId = rest.slice(0, sepIdx).toLowerCase().replace(/_/g, '-')
        if (DANGEROUS_KEYS.has(providerId))
          continue
        const fieldName = upperSnakeToCamel(rest.slice(sepIdx + 2))
        if (DANGEROUS_KEYS.has(fieldName))
          continue
        if (!providerMap[providerId])
          providerMap[providerId] = Object.create(null) as Record<string, string>
        providerMap[providerId][fieldName] = value
      }

      for (const [providerId, config] of Object.entries(providerMap)) {
        providersStore.providers[providerId] = {
          ...providersStore.providers[providerId],
          ...config,
        }
        if (Object.values(config).some(v => v !== null && v !== undefined && v !== '')) {
          providersStore.addedProviders[providerId] = true
        }
      }
    }
  }

  // ——————————————————————————————————————————
  // Module settings
  // ——————————————————————————————————————————

  function getModuleSettingsData(): AiriSettingsData {
    return {
      format: 'airi-settings:v1',
      modules: {
        consciousness: {
          activeProvider: consciousnessStore.activeProvider,
          activeModel: consciousnessStore.activeModel,
          customModelName: consciousnessStore.customModelName,
        },
        speech: {
          activeProvider: speechStore.activeSpeechProvider,
          activeModel: speechStore.activeSpeechModel,
          voiceId: speechStore.activeSpeechVoiceId,
          pitch: speechStore.pitch,
          rate: speechStore.rate,
          ssmlEnabled: speechStore.ssmlEnabled,
          language: speechStore.selectedLanguage,
        },
        hearing: {
          activeProvider: hearingStore.activeTranscriptionProvider,
          activeModel: hearingStore.activeTranscriptionModel,
          customModelName: hearingStore.activeCustomModelName,
          autoSendEnabled: hearingStore.autoSendEnabled,
          autoSendDelay: hearingStore.autoSendDelay,
        },
      },
    }
  }

  function exportModuleSettings(format: ConfigFormat): string {
    const data = getModuleSettingsData()

    if (format === 'yaml') {
      return stringify(data)
    }

    // .env format — prefix: AIRI_MOD_<MODULE>__<FIELD>
    const lines: string[] = ['# AIRI Module Settings', '']
    for (const [moduleName, settings] of Object.entries(data.modules)) {
      const prefix = `AIRI_MOD_${toUpperSnake(moduleName)}`
      for (const [field, value] of Object.entries(settings as Record<string, unknown>)) {
        if (value !== null && value !== undefined) {
          lines.push(`${prefix}__${toUpperSnake(field)}=${value}`)
        }
      }
      lines.push('')
    }
    return lines.join('\n').trimEnd()
  }

  /**
   * Import module settings from a YAML or .env string.
   * Only overwrites fields that are present in the import data (non-empty).
   */
  function importModuleSettings(content: string, format: ConfigFormat): void {
    if (format === 'yaml') {
      const data = parse(content) as AiriSettingsData
      if (!data || data.format !== 'airi-settings:v1' || typeof data.modules !== 'object') {
        throw new Error('Invalid YAML: expected format "airi-settings:v1"')
      }
      const { modules } = data

      if (modules.consciousness) {
        const c = modules.consciousness
        if (c.activeProvider)
          consciousnessStore.activeProvider = c.activeProvider
        if (c.activeModel)
          consciousnessStore.activeModel = c.activeModel
        // Explicit string check: YAML could provide null/non-string for this field
        if (typeof c.customModelName === 'string')
          consciousnessStore.customModelName = c.customModelName
      }

      if (modules.speech) {
        const s = modules.speech
        if (s.activeProvider)
          speechStore.activeSpeechProvider = s.activeProvider
        if (s.activeModel)
          speechStore.activeSpeechModel = s.activeModel
        if (s.voiceId)
          speechStore.activeSpeechVoiceId = s.voiceId
        if (s.pitch !== undefined)
          speechStore.pitch = s.pitch
        if (s.rate !== undefined)
          speechStore.rate = s.rate
        if (s.ssmlEnabled !== undefined)
          speechStore.ssmlEnabled = s.ssmlEnabled
        if (s.language)
          speechStore.selectedLanguage = s.language
      }

      if (modules.hearing) {
        const h = modules.hearing
        if (h.activeProvider)
          hearingStore.activeTranscriptionProvider = h.activeProvider
        if (h.activeModel)
          hearingStore.activeTranscriptionModel = h.activeModel
        // Explicit string check: YAML could provide null/non-string for this field
        if (typeof h.customModelName === 'string')
          hearingStore.activeCustomModelName = h.customModelName
        if (h.autoSendEnabled !== undefined)
          hearingStore.autoSendEnabled = h.autoSendEnabled
        if (h.autoSendDelay !== undefined)
          hearingStore.autoSendDelay = h.autoSendDelay
      }
    }
    else {
      // .env format
      const env = parseEnv(content)
      // Use Object.create(null) to prevent prototype pollution on the accumulator
      const moduleMap = Object.create(null) as Record<string, Record<string, string>>

      for (const [key, value] of Object.entries(env)) {
        if (!key.startsWith('AIRI_MOD_'))
          continue
        const rest = key.slice('AIRI_MOD_'.length)
        const sepIdx = rest.indexOf('__')
        if (sepIdx < 0)
          continue
        const moduleName = upperSnakeToCamel(rest.slice(0, sepIdx).toLowerCase())
        if (DANGEROUS_KEYS.has(moduleName))
          continue
        const fieldName = upperSnakeToCamel(rest.slice(sepIdx + 2))
        if (DANGEROUS_KEYS.has(fieldName))
          continue
        if (!moduleMap[moduleName])
          moduleMap[moduleName] = Object.create(null) as Record<string, string>
        moduleMap[moduleName][fieldName] = value
      }

      const c = moduleMap.consciousness
      if (c) {
        if (c.activeProvider)
          consciousnessStore.activeProvider = c.activeProvider
        if (c.activeModel)
          consciousnessStore.activeModel = c.activeModel
        if (c.customModelName !== undefined)
          consciousnessStore.customModelName = c.customModelName
      }

      const s = moduleMap.speech
      if (s) {
        if (s.activeProvider)
          speechStore.activeSpeechProvider = s.activeProvider
        if (s.activeModel)
          speechStore.activeSpeechModel = s.activeModel
        if (s.voiceId)
          speechStore.activeSpeechVoiceId = s.voiceId
        if (s.pitch !== undefined) {
          const pitch = Number(s.pitch)
          // Guard against NaN from non-numeric .env values
          if (Number.isFinite(pitch))
            speechStore.pitch = pitch
        }
        if (s.rate !== undefined) {
          const rate = Number(s.rate)
          if (Number.isFinite(rate))
            speechStore.rate = rate
        }
        if (s.ssmlEnabled !== undefined)
          speechStore.ssmlEnabled = s.ssmlEnabled === 'true'
        if (s.language)
          speechStore.selectedLanguage = s.language
      }

      const h = moduleMap.hearing
      if (h) {
        if (h.activeProvider)
          hearingStore.activeTranscriptionProvider = h.activeProvider
        if (h.activeModel)
          hearingStore.activeTranscriptionModel = h.activeModel
        if (h.customModelName !== undefined)
          hearingStore.activeCustomModelName = h.customModelName
        if (h.autoSendEnabled !== undefined)
          hearingStore.autoSendEnabled = h.autoSendEnabled === 'true'
        if (h.autoSendDelay !== undefined) {
          const delay = Number(h.autoSendDelay)
          if (Number.isFinite(delay))
            hearingStore.autoSendDelay = delay
        }
      }
    }
  }

  return {
    getProviderCredentialsData,
    exportProviderCredentials,
    importProviderCredentials,
    getModuleSettingsData,
    exportModuleSettings,
    importModuleSettings,
  }
}
