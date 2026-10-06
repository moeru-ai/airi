import type { GenAiMetrics } from '../../otel'
import type { ConfigKVService } from '../../services/adapters/config-kv'
import type { SpeechMeter } from '../../services/domain/billing/speech-billing'
import type { EnvelopeCrypto } from '../../utils/envelope-crypto'

/**
 * Dependencies required by the streaming speech websocket proxy.
 */
export interface AudioSpeechWsHandlersOptions {
  /** Reads upstream websocket URL and encrypted API keys. */
  configKV: ConfigKVService
  /** Decrypts the selected upstream API key before the websocket handshake. */
  envelopeCrypto: EnvelopeCrypto
  /** Reads the user's current Flux balance for pre-flight and final billing. */
  /** Applies pre-flight affordability checks and final streaming TTS billing. */
  speechBilling: SpeechMeter
  /** Records session duration and time to first audio. */
  genAi?: GenAiMetrics | null
}
