export interface Mem9Memory {
  id: string
  content: string
  source?: string | null
  tags?: string[] | null
  metadata?: Record<string, unknown> | null
  version?: number
  updated_by?: string | null
  created_at: string
  updated_at: string
  score?: number
  memory_type?: string
  state?: string
  agent_id?: string
  session_id?: string
}

export interface Mem9SearchInput {
  q?: string
  tags?: string
  source?: string
  limit?: number
  offset?: number
}

export interface Mem9SearchResult {
  memories: Mem9Memory[]
  total: number
  limit: number
  offset: number
}

export interface Mem9CreateMemoryInput {
  content: string
  source?: string
  tags?: string[]
  metadata?: Record<string, unknown>
}

export interface Mem9UpdateMemoryInput {
  content?: string
  source?: string
  tags?: string[]
  metadata?: Record<string, unknown>
}

export interface Mem9IngestMessage {
  role: string
  content: string
}

export interface Mem9IngestInput {
  messages: Mem9IngestMessage[]
  session_id: string
  agent_id: string
  mode?: 'smart' | 'raw'
}

export interface Mem9IngestResult {
  status: 'accepted' | 'complete' | 'partial' | 'failed'
  memories_changed?: number
  insight_ids?: string[]
  warnings?: number
  error?: string
}

export interface Mem9ProvisionResponse {
  id: string
}

export interface Mem9ClientOptions {
  apiUrl?: string
  tenantId?: string
  agentId: string
  timeoutMs?: number
}
