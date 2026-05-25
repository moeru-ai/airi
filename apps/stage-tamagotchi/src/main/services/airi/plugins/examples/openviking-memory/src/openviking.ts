export interface Memory {
  id: string
  content: string
  score: number
  timestamp: string
  metadata?: Record<string, unknown>
}

export interface ConversationTurn {
  sessionId?: string
  userMessage: string
  assistantResponse: string
  toolCalls?: unknown[]
  timestamp: string
}

export interface ConversationSaveResult {
  id: string
  sessionId: string
}

export interface OpenVikingClientConfig {
  baseUrl: string
  apiKey: string
}

export interface OpenVikingClient {
  searchMemories: (query: string, limit?: number) => Promise<Record<string, unknown>[]>
  readMemory: (uri: string) => Promise<{ uri: string, content: string }>
  saveConversation: (conversation: ConversationTurn) => Promise<ConversationSaveResult>
  saveMemory: (content: string, tags?: string[]) => Promise<{ id: string }>
  deleteMemory: (id: string) => Promise<void>
  healthCheck: () => Promise<boolean>
}

const RETRY_DELAYS = [500, 1_500]
const DEFAULT_TIMEOUT_MS = 10_000

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    return response
  }
  finally {
    clearTimeout(timeout)
  }
}

async function fetchWithRetry(url: string, options: RequestInit, retries: number, timeoutMs: number): Promise<Response> {
  let lastError: Error | undefined
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetchWithTimeout(url, options, timeoutMs)
    }
    catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (i < retries) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[i] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1]))
      }
    }
  }
  if (lastError) {
    throw lastError
  }
  throw new Error('fetch failed after retries')
}

export function extractTimestampFromUri(uri: unknown): string {
  if (typeof uri !== 'string') {
    return ''
  }
  const match = uri.match(/(\d{13})[-_]?/)
  if (match) {
    return new Date(Number(match[1])).toISOString()
  }
  return ''
}

export function createOpenVikingClient(config: OpenVikingClientConfig): OpenVikingClient {
  const { baseUrl, apiKey } = config
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  const apiFetch = async (path: string, options: RequestInit & { timeoutMs?: number } = {}): Promise<Response> => {
    const url = `${baseUrl.replace(/\/$/, '')}${path}`
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    return await fetchWithRetry(
      url,
      { ...options, headers: { ...headers, ...options.headers } },
      2,
      timeoutMs,
    )
  }

  return {
    async searchMemories(query: string, limit = 5): Promise<Record<string, unknown>[]> {
      const response = await apiFetch('/api/v1/search/find', {
        method: 'POST',
        body: JSON.stringify({ query, limit }),
      })
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('authentication failed: invalid API key')
        }
        if (response.status === 503) {
          throw new Error('service unavailable')
        }
        throw new Error(`search failed: HTTP ${response.status}`)
      }
      const data = await response.json() as { status: string, result: { memories: Record<string, unknown>[] } }
      return data.result?.memories ?? []
    },

    async readMemory(uri: string): Promise<{ uri: string, content: string }> {
      const params = new URLSearchParams({ uri })
      const response = await apiFetch(`/api/v1/content/read?${params}`, {
        method: 'GET',
      })
      if (!response.ok) {
        throw new Error(`read memory failed: HTTP ${response.status}`)
      }
      const data = await response.json() as { status: string, result: string }
      return { uri, content: data.result ?? '' }
    },

    async saveConversation(conversation: ConversationTurn): Promise<ConversationSaveResult> {
      const sessionId = conversation.sessionId || crypto.randomUUID()

      const userPayload = {
        role: 'user',
        content: conversation.userMessage || '(empty)',
        created_at: conversation.timestamp,
      }
      const msgRes = await apiFetch(`/api/v1/sessions/${sessionId}/messages`, {
        method: 'POST',
        body: JSON.stringify(userPayload),
      })
      if (!msgRes.ok) {
        throw new Error(`save message failed: HTTP ${msgRes.status}`)
      }

      const assistantPayload = {
        role: 'assistant',
        content: conversation.assistantResponse || '(empty)',
        created_at: conversation.timestamp,
      }
      const assistRes = await apiFetch(`/api/v1/sessions/${sessionId}/messages`, {
        method: 'POST',
        body: JSON.stringify(assistantPayload),
      })
      if (!assistRes.ok) {
        throw new Error(`save assistant message failed: HTTP ${assistRes.status}`)
      }

      return { id: sessionId, sessionId }
    },

    async deleteMemory(id: string): Promise<void> {
      const response = await apiFetch(`/api/v1/memories/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        throw new Error(`delete failed: HTTP ${response.status}`)
      }
    },

    async saveMemory(content: string, tags: string[] = []): Promise<{ id: string }> {
      const randomSuffix = Math.random().toString(36).slice(2, 10)
      const ts = Date.now()
      const parent = 'viking://user/default/memories/manual'
      const uri = `viking://user/default/memories/manual/${ts}-${randomSuffix}.md`
      const tagText = tags.length ? `\n\ntags: ${tags.join(', ')}` : ''

      await apiFetch('/api/v1/fs/mkdir', {
        method: 'POST',
        body: JSON.stringify({ uri: parent }),
        timeoutMs: 5_000,
      }).catch(() => {})

      const TIMEOUT_WRITE_MS = 120_000
      const writeRes = await apiFetch('/api/v1/content/write', {
        method: 'POST',
        body: JSON.stringify({
          uri,
          content: `${content}${tagText}`,
          mode: 'create',
        }),
        timeoutMs: TIMEOUT_WRITE_MS,
      })
      if (!writeRes.ok) {
        const body = await writeRes.text().catch(() => '')
        throw new Error(`save memory (create) failed: HTTP ${writeRes.status} - ${body}`)
      }

      return { id: uri }
    },

    async healthCheck(): Promise<boolean> {
      try {
        const response = await apiFetch('/health', { method: 'GET', timeoutMs: 3_000 })
        if (!response.ok) {
          return false
        }
        const data = await response.json() as { status: string }
        return data.status === 'ok'
      }
      catch {
        return false
      }
    },
  }
}
