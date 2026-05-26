/**
 * Context attached when a parsed LLM streaming control token is dispatched.
 */
export interface LlmStreamingControlDispatchContext {
  /** Turn id that owns the token and its timeline children, when known. */
  turnId?: string
  /** Speech intent id that carried the token, when known. Prefer `turnId` for lifecycle work. */
  intentId?: string
  /** Speech stream id that carried the token, when known. */
  streamId?: string
  /** True when the dispatch came from another runtime and must not be re-broadcast. */
  remote?: boolean
  /** Optional observer used by host integrations to aggregate dispatch telemetry. */
  observer?: LlmStreamingControlDispatchObserver
}

export type LlmStreamingControlDispatchEvent
  = | { type: 'rejected', reason: 'no-matching-parser' | 'parse-failed', parserName?: string }
    | { type: 'parsed', parserName: string, tokenType: LlmStreamingControlSignal['type'], callName?: string, parameter?: string }
    | { type: 'call-handler-count', count: number }
    | { type: 'call-handler-missing', callName: string, payload?: Record<string, unknown> }
    | { type: 'call-handler-start', callName: string }
    | { type: 'call-handler-end', callName: string }
    | { type: 'call-handler-error', callName: string, error: unknown }
    | { type: 'signal-handler-error', tokenType: LlmStreamingControlSignal['type'], error: unknown }

export type LlmStreamingControlDispatchObserver = (event: LlmStreamingControlDispatchEvent) => void

/**
 * Runtime context passed to a registered CALL handler.
 */
export interface LlmStreamingControlCallContext extends LlmStreamingControlDispatchContext {
  /** Local timestamp for ordering and debugging. */
  createdAt: number
}

/**
 * Runtime context passed to a parsed streaming-control signal handler.
 */
export interface LlmStreamingControlSignalContext extends LlmStreamingControlDispatchContext {
  /** Local timestamp for ordering and debugging. */
  createdAt: number
}

export type LlmStreamingControlCallHandler<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> = (
  payload: TPayload | undefined,
  context: LlmStreamingControlCallContext,
) => void | Promise<void>

export type LlmStreamingControlSignalHandler = (
  signal: LlmStreamingControlSignal,
  context: LlmStreamingControlSignalContext,
) => void | Promise<void>

/**
 * Provider-facing manifest for one streaming `CALL` token.
 *
 * The manifest is registered with the callback so the runtime can render
 * few-shot instructions from the same source of truth that executes the call.
 */
export interface LlmStreamingControlCallManifest {
  /** Opaque plugin-owned call name used inside `<|CALL ["name"]|>`. */
  name: string
  /** Required model instruction describing when this call should be emitted. */
  prompt: string
  /** Optional few-shot token examples. */
  examples?: string[]
}

export type LlmStreamingControlTurnDoneReason = 'completed' | 'cancelled'

export interface LlmStreamingControlTurnDone {
  type: LlmStreamingControlTurnDoneReason
}

export interface LlmStreamingControlTurn {
  turnId: string
  on: <TPayload extends Record<string, unknown> = Record<string, unknown>>(
    manifest: LlmStreamingControlCallManifest,
    handler: LlmStreamingControlCallHandler<TPayload>,
  ) => () => void
  renderManifestPrompt: () => string
  complete: () => void
  cancel: () => void
  done: Promise<LlmStreamingControlTurnDone>
}

/**
 * Parser for one LLM streaming control syntax.
 *
 * @param TParsed Parsed token payload owned by the matching control.
 */
export interface LlmStreamingControlParser<TParsed> {
  /** Token syntax name, for example `CALL`. */
  name: string
  /** Returns true when this parser owns the special token syntax. */
  match: (special: string) => boolean
  /** Parses a special token into plain data. This method must not perform side effects. */
  parse: (special: string) => TParsed | undefined
}

/**
 * Runtime for LLM streaming controls embedded in `<|...|>` special tokens.
 */
export interface LlmStreamingControl {
  /** Returns true when any loaded control parser recognizes the special token. */
  match: (special: string) => boolean
  /**
   * Parses and dispatches one special token through the first matching control.
   *
   * Returns:
   * - `true` when a loaded control matched and parsed the token
   * - `false` when callers should continue normal special-token handling
   */
  dispatchWith: (special: string, context?: Partial<LlmStreamingControlDispatchContext>) => Promise<boolean>
  /**
   * Registers a callback for one plugin-owned CALL name.
   *
   * Returns:
   * - A disposer that unregisters the callback
   */
  on: <TPayload extends Record<string, unknown> = Record<string, unknown>>(
    manifest: LlmStreamingControlCallManifest,
    handler: LlmStreamingControlCallHandler<TPayload>,
  ) => () => void
  /**
   * Renders currently registered CALL manifests into prompt instructions.
   *
   * Returns:
   * - Empty string when no CALL manifests are registered
   * - A provider-safe instruction block with syntax rules and examples otherwise
   */
  renderManifestPrompt: () => string
  /**
   * Registers a callback for every parsed streaming-control signal.
   *
   * Returns:
   * - A disposer that unregisters the callback
   */
  onSignal: (handler: LlmStreamingControlSignalHandler) => () => void
  beginTurn: (options?: { turnId?: string }) => LlmStreamingControlTurn
  completeTurn: (turnId: string) => void
  cancelTurn: (turnId: string) => void
}

export interface LlmStreamingControlOptions {
  /** Optional parsers. Defaults to the built-in ACT, DELAY, and CALL parsers. */
  parsers?: LlmStreamingControlParser<LlmStreamingControlSignal>[]
}

/**
 * Parsed CALL token payload.
 *
 * @param TPayload Payload object shape expected by one CALL name.
 */
export interface LlmStreamingControlTokenCall<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Parsed signal kind. */
  type: 'call'
  /** Plugin-owned call name. Stage UI treats this as opaque data. */
  name: string
  /** Optional call payload reserved for plugin-owned extensions. */
  payload?: TPayload
}

/**
 * Parsed ACT token payload.
 */
export interface LlmStreamingControlTokenAct {
  /** Parsed signal kind. */
  type: 'act'
  /** Parsed JSON object literal supplied by the model. */
  payload: Record<string, unknown>
}

/**
 * Parsed DELAY token payload.
 */
export interface LlmStreamingControlTokenDelay {
  /** Parsed signal kind. */
  type: 'delay'
  /** Delay length in seconds. */
  seconds: number
}

export type LlmStreamingControlSignal
  = | LlmStreamingControlTokenAct
    | LlmStreamingControlTokenCall
    | LlmStreamingControlTokenDelay
