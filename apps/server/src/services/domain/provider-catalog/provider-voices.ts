import type { ProviderCatalogTtsVoice, ProviderCatalogTtsVoiceLabels, ProviderCatalogTtsVoiceLanguage } from '../../../schemas/provider-catalog'

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value == null || Array.isArray(value))
    return undefined
  return value as Record<string, unknown>
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function asLanguageList(value: unknown): ProviderCatalogTtsVoiceLanguage[] | undefined {
  if (!Array.isArray(value))
    return undefined

  const languages = value.flatMap((item) => {
    const record = asRecord(item)
    const code = asOptionalString(record?.code)
    if (!code)
      return []
    const title = asOptionalString(record?.title)
    return [{ code, ...(title ? { title } : {}) }]
  })
  return languages.length > 0 ? languages : undefined
}

function asLabels(value: unknown): ProviderCatalogTtsVoiceLabels | undefined {
  const record = asRecord(value)
  return record ? { ...record } : undefined
}

/**
 * Normalizes a provider-specific voice object into the provider catalog sync shape.
 *
 * Before:
 * - `{ id: "en-US-AvaMultilingualNeural", name: "Ava", previewUrl: "https://..." }`
 *
 * After:
 * - `{ id: "en-US-AvaMultilingualNeural", name: "Ava", previewAudioUrl: "https://..." }`
 */
export function normalizeProviderVoiceForCatalog(value: unknown) {
  const record = asRecord(value)
  const id = asOptionalString(record?.id)
  if (!id)
    return null

  return {
    id,
    name: asOptionalString(record?.name),
    languages: asLanguageList(record?.languages),
    labels: asLabels(record?.labels),
    previewAudioUrl: asOptionalString(record?.previewAudioUrl) ?? asOptionalString(record?.previewUrl) ?? null,
  }
}

export function catalogVoiceResponse(voice: ProviderCatalogTtsVoice) {
  // NOTICE: Admin-generated previews may temporarily live as data URIs until
  // object storage is wired. Public voice catalogs stay lightweight and only
  // expose provider or storage URLs.
  const previewAudioUrl = voice.previewAudioUrl?.startsWith('data:') ? undefined : voice.previewAudioUrl

  return {
    id: voice.providerVoiceId,
    name: voice.displayName,
    languages: voice.languages,
    labels: voice.labels,
    preview_audio_url: previewAudioUrl ?? undefined,
  }
}
