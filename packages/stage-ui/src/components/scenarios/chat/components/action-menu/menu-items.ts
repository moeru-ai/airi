export type ChatActionMenuAction = 'copy' | 'retry' | 'delete'

export interface ChatActionMenuItem {
  action: ChatActionMenuAction
  label: string
  icon: string
  danger?: boolean
}

export function createChatActionMenuItems(options: {
  canCopy: boolean
  canRetry: boolean
  canDelete: boolean
  retryLabel?: string
}): ChatActionMenuItem[] {
  return [
    options.canCopy
      ? {
          action: 'copy',
          label: 'Copy',
          icon: 'i-solar:copy-bold',
        }
      : null,
    options.canRetry
      ? {
          action: 'retry',
          label: options.retryLabel ?? 'Retry',
          icon: 'i-solar:refresh-bold',
        }
      : null,
    options.canDelete
      ? {
          action: 'delete',
          label: 'Delete',
          icon: 'i-solar:trash-bin-minimalistic-bold',
          danger: true,
        }
      : null,
  ].filter(Boolean) as ChatActionMenuItem[]
}
