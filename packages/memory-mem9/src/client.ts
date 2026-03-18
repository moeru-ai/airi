import type {
  Mem9ClientOptions,
  Mem9CreateMemoryInput,
  Mem9IngestInput,
  Mem9IngestResult,
  Mem9Memory,
  Mem9ProvisionResponse,
  Mem9SearchInput,
  Mem9SearchResult,
  Mem9UpdateMemoryInput,
} from './types'

const DEFAULT_API_URL = 'https://api.mem9.ai'
const DEFAULT_TIMEOUT_MS = 300000

export class Mem9Client {
  private readonly apiUrl: string
  private readonly agentId: string
  private readonly timeoutMs: number
  private tenantId: string

  constructor(options: Mem9ClientOptions) {
    this.apiUrl = (options.apiUrl ?? DEFAULT_API_URL).replace(/\/+$/, '')
    this.tenantId = options.tenantId ?? ''
    this.agentId = options.agentId
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  setTenantId(tenantId: string) {
    this.tenantId = tenantId
  }

  getTenantId() {
    return this.tenantId
  }

  async provision(): Promise<Mem9ProvisionResponse> {
    const result = await this.request<Mem9ProvisionResponse>('POST', '/v1alpha1/mem9s')
    this.tenantId = result.id
    return result
  }

  async store(input: Mem9CreateMemoryInput): Promise<Mem9Memory | Mem9IngestResult> {
    return this.request<Mem9Memory | Mem9IngestResult>('POST', this.tenantPath('/memories'), input)
  }

  async search(input: Mem9SearchInput): Promise<Mem9SearchResult> {
    const params = new URLSearchParams()
    if (input.q)
      params.set('q', input.q)
    if (input.tags)
      params.set('tags', input.tags)
    if (input.source)
      params.set('source', input.source)
    if (input.limit != null)
      params.set('limit', String(input.limit))
    if (input.offset != null)
      params.set('offset', String(input.offset))

    const suffix = params.size > 0 ? `?${params.toString()}` : ''
    return this.request<Mem9SearchResult>('GET', `${this.tenantPath('/memories')}${suffix}`)
  }

  async get(id: string): Promise<Mem9Memory | null> {
    try {
      return await this.request<Mem9Memory>('GET', this.tenantPath(`/memories/${id}`))
    }
    catch (error) {
      if (isNotFoundError(error))
        return null
      throw error
    }
  }

  async update(id: string, input: Mem9UpdateMemoryInput): Promise<Mem9Memory | null> {
    try {
      return await this.request<Mem9Memory>('PUT', this.tenantPath(`/memories/${id}`), input)
    }
    catch (error) {
      if (isNotFoundError(error))
        return null
      throw error
    }
  }

  async remove(id: string): Promise<boolean> {
    try {
      await this.request('DELETE', this.tenantPath(`/memories/${id}`))
      return true
    }
    catch (error) {
      if (isNotFoundError(error))
        return false
      throw error
    }
  }

  async ingest(input: Mem9IngestInput): Promise<Mem9IngestResult> {
    return this.request<Mem9IngestResult>('POST', this.tenantPath('/memories'), input)
  }

  private tenantPath(path: string): string {
    if (!this.tenantId) {
      throw new Error('mem9 tenant id is not configured')
    }

    return `/v1alpha1/mem9s/${this.tenantId}${path}`
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController()
    const timeoutId = globalThis.setTimeout(() => controller.abort(), this.timeoutMs)

    let response: Response
    try {
      response = await fetch(`${this.apiUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Mnemo-Agent-Id': this.agentId,
        },
        body: body == null ? undefined : JSON.stringify(body),
        signal: controller.signal,
      })
    }
    catch (error) {
      if (isAbortError(error)) {
        throw new Error(`mem9 request timed out after ${this.timeoutMs}ms`)
      }
      throw error
    }
    finally {
      globalThis.clearTimeout(timeoutId)
    }

    if (response.status === 204) {
      return undefined as T
    }

    const data = await response.json().catch(() => undefined)
    if (!response.ok) {
      throw new Error((data as { error?: string } | undefined)?.error ?? `mem9 request failed (${response.status})`)
    }

    return data as T
  }
}

function isNotFoundError(error: unknown) {
  return error instanceof Error && (error.message.includes('404') || error.message.includes('not found'))
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}
