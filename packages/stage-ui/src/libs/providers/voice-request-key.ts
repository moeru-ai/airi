/**
 * Creates the identity for one Provider voice-catalog request.
 *
 * The configuration is part of the identity because credentials and account
 * fields can change the returned catalog.
 *
 * @example
 * createProviderVoiceRequestKey('elevenlabs', 'model-a', { apiKey: 'key-a' })
 * // => '["elevenlabs","model-a",{"apiKey":"key-a"}]'
 */
export function createProviderVoiceRequestKey(
  providerId: string,
  model: string | undefined,
  config: Record<string, unknown>,
): string {
  return JSON.stringify([providerId, model ?? null, config])
}
