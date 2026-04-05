export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  images?: string[]
}

export interface OllamaChatRequest {
  model: string
  messages: OllamaChatMessage[]
  stream?: boolean
}

export interface OllamaChatResponse {
  message: { role: string, content: string }
  done: boolean
  total_duration?: number
  eval_count?: number
}

export async function postChat(
  baseUrl: string,
  request: OllamaChatRequest,
): Promise<OllamaChatResponse> {
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...request, stream: false }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Ollama chat failed (${res.status}): ${body}`)
  }

  return res.json() as Promise<OllamaChatResponse>
}

export async function checkHealth(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    })
    return res.ok
  }
  catch {
    return false
  }
}

export async function listModels(baseUrl: string): Promise<string[]> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok)
      return []
    const data = await res.json() as { models?: Array<{ name: string }> }
    return data.models?.map(m => m.name) ?? []
  }
  catch {
    return []
  }
}
