export type ChatActionMenuAction = 'copy' | 'delete'

export interface ChatActionMenuItem {
  action: ChatActionMenuAction
  label: string
  icon: string
  danger?: boolean
}

export interface ChatActionMenuTriggerState {
  icon: string
  tone: 'default' | 'success'
}

export function createChatActionMenuItems(options: {
  canCopy: boolean
  canDelete: boolean
}): ChatActionMenuItem[] {
  return [
    options.canCopy
      ? {
          action: 'copy',
          label: 'Copy',
          icon: 'i-solar:copy-bold',
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

export function createChatActionMenuTriggerState(options: {
  copyFeedbackActive?: boolean
}): ChatActionMenuTriggerState {
  if (options.copyFeedbackActive) {
    return {
      icon: 'i-carbon:checkmark',
      tone: 'success',
    }
  }

  return {
    icon: 'i-solar:menu-dots-bold',
    tone: 'default',
  }
}
