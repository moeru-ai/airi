/**
 * Connection policy snapshotted from the active streaming speech provider.
 *
 * Official sessions use AIRI-hosted credentials and Flux. BYOK sessions send
 * the user credential inside the authenticated WSS session so the AIRI bridge
 * can inject it into UnSpeech's upstream upgrade request.
 */
export interface StreamingTtsConnection {
  credentialMode: 'official' | 'byok'
  providerId: 'official-provider-speech-streaming' | 'volcengine-streaming'
  /** Plaintext credential used only for a BYOK upstream handshake. */
  apiKey?: string
}
