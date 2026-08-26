/**
 * Represents supported chat message action identifiers.
 */
export type ChatActionMenuAction = 'copy' | 'delete' | 'retry'

/**
 * Represents one visible action in a chat message action menu.
 */
export interface ChatActionMenuItem {
  /**
   * Action emitted when the menu item is selected.
   */
  action: ChatActionMenuAction
  /**
   * Marks destructive actions for danger styling.
   */
  danger?: boolean
  /**
   * UnoCSS Iconify class used for the item icon.
   */
  icon: string
  /**
   * Human-readable menu label.
   */
  label: string
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
 * - Menu items ordered as copy, retry, delete
 */
export function createChatActionMenuItems(options: {
  canCopy: boolean
  canDelete: boolean
  canRetry: boolean
  retryLabel?: string
}): ChatActionMenuItem[] {
  return [
    options.canCopy
      ? {
          action: 'copy',
          icon: 'i-solar:copy-bold',
          label: 'Copy',
        }
      : null,
    options.canRetry
      ? {
          action: 'retry',
          icon: 'i-solar:refresh-bold',
          label: options.retryLabel ?? 'Retry',
        }
      : null,
    options.canDelete
      ? {
          action: 'delete',
          danger: true,
          icon: 'i-solar:trash-bin-minimalistic-bold',
          label: 'Delete',
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
