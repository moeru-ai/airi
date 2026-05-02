import { defineInvokeEventa } from '@moeru/eventa'

export type VisualChatDesktopSetupState
  = | 'idle'
    | 'checking'
    | 'installing-engine'
    | 'pulling-model'
    | 'starting-services'
    | 'starting-tunnel'
    | 'ready'
    | 'error'

export type VisualChatDesktopSetupStepStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped'

export interface VisualChatDesktopSetupStep {
  id: 'engine' | 'model' | 'gateway' | 'worker' | 'tunnel'
  label: string
  status: VisualChatDesktopSetupStepStatus
  detail: string
}

export interface VisualChatDesktopSetupStatus {
  available: boolean
  state: VisualChatDesktopSetupState
  fixedModel: string
  gatewayUrl: string
  workerUrl: string
  workspaceRoot?: string
  steps: VisualChatDesktopSetupStep[]
  logs: string[]
  updatedAt: number
  error?: string
  tunnelFrontendUrl?: string
  tunnelGatewayUrl?: string
}

export const electronVisualChatGetSetupStatus = defineInvokeEventa<VisualChatDesktopSetupStatus>('eventa:invoke:electron:visual-chat:setup:get-status')
export const electronVisualChatRunSetup = defineInvokeEventa<VisualChatDesktopSetupStatus, { auto?: boolean }>('eventa:invoke:electron:visual-chat:setup:run')
