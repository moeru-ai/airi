export const companionModePreviewChannelName = 'airi-companion-mode-preview-snapshot'

export type CompanionModePreviewChannelEvent
  = | { type: 'request-current' }
    | {
      type: 'snapshot'
      ownerInstanceId: string
      images: Record<string, string>
    }
    | {
      type: 'owner-gone'
      ownerInstanceId: string
    }
