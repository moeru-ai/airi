/**
 * Represents supported chat message action identifiers.
 */
export type ChatActionMenuAction = 'replay' | 'reply' | 'copy' | 'retry' | 'delete'

/**
 * Represents one visible action in a chat message action menu.
 */
export interface ChatActionMenuItem {
  /**
   * Action emitted when the menu item is selected.
   */
  action: ChatActionMenuAction
  /**
   * Human-readable menu label.
   */
  label: string
  /**
   * UnoCSS Iconify class used for the item icon.
   */
  icon: string
  /**
   * Marks destructive actions for danger styling.
   */
  danger?: boolean
}

/**
 * Represents the visual state for the compact action menu trigger.
 */
export interface ChatActionMenuTriggerState {
  /**
   * UnoCSS Iconify class used for the trigger icon.
   */
  icon: string
  /**
   * Visual tone applied to the trigger icon.
   */
  tone: 'default' | 'success'
}

/**
 * Creates chat action menu items from action availability flags.
 *
 * Use when:
 * - Rendering dropdown or context menu entries for a chat message
 * - Keeping action ordering consistent across menu surfaces
 *
 * Expects:
 * - Boolean flags already reflect message capability and visibility rules
 *
 * Returns:
 * - Menu items ordered as reply, copy, retry, delete
 */
export function createChatActionMenuItems(options: {
  canReply: boolean
  canCopy: boolean
  canRetry: boolean
  canDelete: boolean
  canReplay?: boolean
  retryLabel?: string
  replyLabel: string
  replayLabel?: string
}): ChatActionMenuItem[] {
  return [
    options.canReplay
      ? {
          action: 'replay',
          label: options.replayLabel ?? 'Replay',
          icon: 'i-solar:restart-bold',
        }
      : null,
    options.canReply
      ? {
          action: 'reply',
          label: options.replyLabel,
          icon: 'i-solar:reply-bold',
        }
      : null,
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

/**
 * Creates the compact trigger icon state for chat action menus.
 *
 * Use when:
 * - Rendering trigger feedback after a copy action
 * - Keeping trigger icon and tone selection outside the Vue template
 *
 * Expects:
 * - `copyFeedbackActive` is true only while copy feedback should be visible
 *
 * Returns:
 * - A default menu icon state or a success checkmark state
 */
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
