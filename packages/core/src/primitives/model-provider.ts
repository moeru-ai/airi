export type ProviderKind = 'chat' | 'tts' | 'stt' | 'vad'

export interface ProviderRequest<TParams = unknown> {
  kind: ProviderKind
  params: TParams
  signal?: AbortSignal
}

export interface StreamChunk<T = unknown> {
  done?: boolean
  data?: T
  error?: unknown
}

export type StreamHandler<T = unknown> = (chunk: StreamChunk<T>) => void | Promise<void>

export interface ProviderResponse<TData = unknown> {
  kind: ProviderKind
  data: TData
}

export interface StreamingProvider<TReq = ProviderRequest, TData = unknown> {
  readonly id: string
  readonly kind: ProviderKind
  stream: (req: TReq, onChunk: StreamHandler<TData>) => Promise<void>
  cancel?: (reason?: string) => void
}

export interface UnaryProvider<TReq = ProviderRequest, TRes = ProviderResponse> {
  readonly id: string
  readonly kind: ProviderKind
  request: (req: TReq) => Promise<TRes>
}

export type ModelProvider
  = | StreamingProvider<ProviderRequest, unknown>
    | UnaryProvider<ProviderRequest, ProviderResponse>
