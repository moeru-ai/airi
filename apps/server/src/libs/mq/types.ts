export type RedisArgument = string | number

export interface RedisCommandClient {
  call: (command: string, ...args: RedisArgument[]) => Promise<unknown>
}

export interface MqOptions<TEvent> {
  /** Redis Stream key name. */
  stream: string
  /** Approximate max stream length (MAXLEN ~). Unbounded if omitted. */
  maxLength?: number
  /** Convert a typed event into flat Redis field/value pairs. */
  serialize: (event: TEvent) => Record<string, string | undefined>
  /** Reconstruct a typed event from flat Redis field/value pairs. */
  deserialize: (fields: Record<string, string>) => TEvent
}

export interface StreamMessage<TEvent> {
  streamMessageId: string
  event: TEvent
}

export interface ConsumeOptions {
  group: string
  consumer: string
  count?: number
  blockMs?: number
  startId?: string
}

export interface ClaimIdleOptions {
  group: string
  consumer: string
  minIdleTimeMs: number
  startId?: string
  count?: number
}

export interface WorkerOptions<TEvent> {
  group: string
  consumer: string
  signal: AbortSignal
  batchSize?: number
  blockMs?: number
  minIdleTimeMs?: number
  onMessage: (message: StreamMessage<TEvent>) => Promise<void>
}
