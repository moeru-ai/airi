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
 * Parse a simple KEY=VALUE .env format.
 * Lines starting with '#' or empty lines are ignored.
 */
function parseEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#'))
      continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex < 0)
      continue
    const key = trimmed.slice(0, eqIndex).trim()
    const value = trimmed.slice(eqIndex + 1)
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
          for (const [nestedKey, nestedValue] of Object.entries(value as Record<string, unknown>)) {
            if (nestedValue !== null && nestedValue !== undefined && nestedValue !== '') {
              lines.push(`${prefix}__${toUpperSnake(field)}_${toUpperSnake(nestedKey)}=${nestedValue}`)
            }
          }
        }
        else {
          lines.push(`${prefix}__${toUpperSnake(field)}=${value}`)
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
        providersStore.providers[providerId] = {
          ...providersStore.providers[providerId],
          ...config,
        }
        // Mark the provider as added when at least one field is non-empty
        if (Object.values(config).some(v => v !== null && v !== undefined && v !== '')) {
          providersStore.addedProviders[providerId] = true
        }
      }
    }
    else {
      // .env format
      const env = parseEnv(content)
      const providerMap: Record<string, Record<string, string>> = {}

      for (const [key, value] of Object.entries(env)) {
        if (!key.startsWith('AIRI_PROV_'))
          continue
        const rest = key.slice('AIRI_PROV_'.length)
        const sepIdx = rest.indexOf('__')
        if (sepIdx < 0)
          continue
        // Convert UPPER_SNAKE back to kebab-case provider ID
        const providerId = rest.slice(0, sepIdx).toLowerCase().replace(/_/g, '-')
        const fieldName = upperSnakeToCamel(rest.slice(sepIdx + 2))
        if (!providerMap[providerId])
          providerMap[providerId] = {}
        providerMap[providerId][fieldName] = value
      }

      for (const [providerId, config] of Object.entries(providerMap)) {
        providersStore.providers[providerId] = {
          ...providersStore.providers[providerId],
          ...config,
        }
        if (Object.values(config).some(v => !!v)) {
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
        if (c.customModelName !== undefined)
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
        if (h.customModelName !== undefined)
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
      const moduleMap: Record<string, Record<string, string>> = {}

      for (const [key, value] of Object.entries(env)) {
        if (!key.startsWith('AIRI_MOD_'))
          continue
        const rest = key.slice('AIRI_MOD_'.length)
        const sepIdx = rest.indexOf('__')
        if (sepIdx < 0)
          continue
        const moduleName = upperSnakeToCamel(rest.slice(0, sepIdx).toLowerCase())
        const fieldName = upperSnakeToCamel(rest.slice(sepIdx + 2))
        if (!moduleMap[moduleName])
          moduleMap[moduleName] = {}
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
        if (s.pitch !== undefined)
          speechStore.pitch = Number(s.pitch)
        if (s.rate !== undefined)
          speechStore.rate = Number(s.rate)
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
        if (h.autoSendDelay !== undefined)
          hearingStore.autoSendDelay = Number(h.autoSendDelay)
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
