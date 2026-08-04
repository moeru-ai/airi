import type { ConfigKVService } from '../../services/adapters/config-kv'
import type { FluxMeter } from '../../services/domain/billing/flux-meter'
import type { FluxService } from '../../services/domain/flux'
import type { ProductEventService } from '../../services/domain/product-events'
import type { RequestLogService } from '../../services/domain/request-log'
import type { EnvelopeCrypto } from '../../utils/envelope-crypto'

/**
 * Dependencies required by the streaming speech websocket proxy.
 */
export interface AudioSpeechWsHandlersOptions {
  /** Reads the UnSpeech websocket URL and operator credentials for official sessions. */
  configKV: ConfigKVService
  /** Decrypts the selected upstream API key before the websocket handshake. */
  envelopeCrypto: EnvelopeCrypto
  /** Reads the user's current Flux balance for official-session billing. */
  fluxService: FluxService
  /** Applies pre-flight checks and final billing to official sessions only. */
  ttsMeter: FluxMeter
  /** Persists request accounting after a stream finishes. */
  requestLogService: RequestLogService
  /** Writes first-party product analytics for distinct-user aggregation. */
  productEventService: ProductEventService
}
