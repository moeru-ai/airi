import { z } from 'zod'

export const DEFAULT_OPENROUTER_AUDIO_BASE_URL = 'https://openrouter.ai/api/v1/'

export const openRouterAudioConfigSchema = z.object({
  apiKey: z.string(),
  baseUrl: z.string().default(DEFAULT_OPENROUTER_AUDIO_BASE_URL),
})

export type OpenRouterAudioConfig = z.input<typeof openRouterAudioConfigSchema>

/**
 * Normalizes the OpenRouter audio base URL.
 *
 * @example
 * normalizeOpenRouterAudioBaseUrl('https://openrouter.ai/api/v1')
 * // => 'https://openrouter.ai/api/v1/'
 */
export function normalizeOpenRouterAudioBaseUrl(baseUrl: string | undefined) {
  const value = baseUrl?.trim() || DEFAULT_OPENROUTER_AUDIO_BASE_URL
  return value.endsWith('/') ? value : `${value}/`
}
