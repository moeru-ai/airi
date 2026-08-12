import type { Buffer } from 'node:buffer'

export interface StreamingTtsStartCommand {
  /** Canonical public model id used for provider resolution and billing. */
  model: string
  /** Provider voice id already selected by the client. */
  voice: string
  /** Client audio container request; providers map it to their wire format. */
  responseFormat?: string
  /** Provider-neutral optional controls forwarded through the selected adapter. */
  extraBody?: Record<string, unknown>
}

export type StreamingTtsCommand
  = | { type: 'text', text: string }
    | { type: 'finish' }

export type StreamingTtsProviderEvent
  = | { type: 'started' }
    | { type: 'input-accepted', chars: number }
    | { type: 'audio', data: ArrayBuffer }
    | { type: 'control', event: 'sentence.start' | 'sentence.end' | 'subtitle', payload: Record<string, unknown> }
    | { type: 'completed', usageChars?: number }
    | { type: 'failed', code: string, message: string }
    | { type: 'closed', code: number, reason: string }

/**
 * Hides an upstream provider's websocket protocol behind AIRI's streaming TTS
 * lifecycle. Commands may be submitted while connecting and are delivered in
 * order once the provider session is ready.
 */
export interface StreamingTtsTransport {
  /** Resolved provider identity used by telemetry. */
  readonly kind: 'unspeech' | 'stepfun'
  /** Exact upstream endpoint used for this connection. */
  readonly upstreamURL: string
  /** Encrypted key entry identifier used for observability, never the secret. */
  readonly keyEntryId: string
  /** Queues or sends one ordered client command until the provider is ready. */
  send: (command: StreamingTtsCommand) => void
  /** Immediately stops generation and releases the upstream websocket. */
  abort: () => void
}

/** Inputs shared by provider-specific streaming websocket adapters. */
export interface StreamingTtsTransportOptions {
  /** Validated client start command. */
  start: StreamingTtsStartCommand
  /** Provider endpoint selected by configuration policy. */
  upstreamURL: string
  /** Credential identifier recorded in traces. */
  keyEntryId: string
  /** Decrypted credential; the adapter must zero it after constructing the websocket. */
  keyPlaintext: Buffer
  /** Synchronous provider-neutral event sink owned by the client session. */
  onEvent: (event: StreamingTtsProviderEvent) => void
  /** Optional runtime deadlines; adapters apply production defaults when omitted. */
  timeouts?: Partial<StreamingTtsTransportTimeouts>
}

/** Deadlines that prevent stalled upstream sessions from retaining resources. */
export interface StreamingTtsTransportTimeouts {
  /** Maximum milliseconds from dialing until the provider acknowledges the session. */
  handshakeMs: number
  /** Maximum milliseconds without provider progress after finish is sent. */
  completionMs: number
}
