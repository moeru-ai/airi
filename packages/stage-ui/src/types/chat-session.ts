import type { ChatHistoryItem } from './chat'

export interface ChatSessionGraphNode {
  id: string
  parentId?: string
  forkAtIndex?: number
  reason?: string
  hidden?: boolean
  createdAt: number
}

export interface ChatSessionGraph {
  nodes: Record<string, ChatSessionGraphNode>
  activeSessionId: string
}

export interface ChatPromptVersion {
  id: string // e.g. 'v1', 'v2' or hash
  rootId: string
  systemPrompt: string
  systemPromptHash: string
  createdAt: number
  graph: ChatSessionGraph
}

export interface ChatUserCharacterRoot {
  userId: string
  characterId: string
  activeVersionId: string
  versions: string[] // versionIds
}

export interface ChatSessionMeta {
  sessionId: string
  versionId: string
  rootId: string
  title?: string
  updatedAt: number
}

export interface ChatSessionsExport {
  format: 'chat-session-graph:v2'
  root: ChatUserCharacterRoot
  versions: Record<string, ChatPromptVersion>
  sessions: Record<string, ChatHistoryItem[]>
  metas: Record<string, ChatSessionMeta>
}
