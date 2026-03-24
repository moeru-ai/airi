import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk'

import type { CoworkMessage } from '../../coworkStore'

export type CoworkAgentEngine = 'openclaw' | 'yd_cowork'

export const ENGINE_SWITCHED_CODE = 'ENGINE_SWITCHED'

export interface PermissionRequest {
  requestId: string
  toolName: string
  toolInput: Record<string, unknown>
  toolUseId?: string | null
}

export interface CoworkRuntimeEvents {
  message: (sessionId: string, message: CoworkMessage) => void
  messageUpdate: (sessionId: string, messageId: string, content: string) => void
  permissionRequest: (sessionId: string, request: PermissionRequest) => void
  complete: (sessionId: string, claudeSessionId: string | null) => void
  error: (sessionId: string, error: string) => void
}

export interface CoworkImageAttachment {
  name: string
  mimeType: string
  base64Data: string
}

export interface CoworkStartOptions {
  skipInitialUserMessage?: boolean
  skillIds?: string[]
  systemPrompt?: string
  autoApprove?: boolean
  workspaceRoot?: string
  confirmationMode?: 'modal' | 'text'
  imageAttachments?: CoworkImageAttachment[]
}

export interface CoworkContinueOptions {
  systemPrompt?: string
  skillIds?: string[]
  imageAttachments?: CoworkImageAttachment[]
}

export interface CoworkRuntime {
  on<U extends keyof CoworkRuntimeEvents>(
    event: U,
    listener: CoworkRuntimeEvents[U],
  ): this
  off<U extends keyof CoworkRuntimeEvents>(
    event: U,
    listener: CoworkRuntimeEvents[U],
  ): this
  startSession: (sessionId: string, prompt: string, options?: CoworkStartOptions) => Promise<void>
  continueSession: (sessionId: string, prompt: string, options?: CoworkContinueOptions) => Promise<void>
  stopSession: (sessionId: string) => void
  stopAllSessions: () => void
  respondToPermission: (requestId: string, result: PermissionResult) => void
  isSessionActive: (sessionId: string) => boolean
  getSessionConfirmationMode: (sessionId: string) => 'modal' | 'text' | null
  onSessionDeleted?: (sessionId: string) => void
}
