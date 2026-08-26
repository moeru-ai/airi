export type ActionErrorCode
  = | 'ACTIVATION_FAILED'
    | 'CRAFTING_FAILED'
    | 'INTERRUPTED'
    | 'INVENTORY_FULL'
    | 'ITEM_NOT_FOUND'
    | 'NAVIGATION_FAILED'
    | 'PLACEMENT_FAILED'
    | 'RESOURCE_MISSING'
    | 'SYNC_ONLY'
    | 'TARGET_NOT_FOUND'
    | 'UNKNOWN'

export class ActionError extends Error {
  public readonly code: ActionErrorCode
  public readonly context?: Record<string, unknown>

  constructor(code: ActionErrorCode, message: string, context?: Record<string, unknown>) {
    super(message)
    this.name = 'ActionError'
    this.code = code
    this.context = context
  }

  public toJSON() {
    return {
      code: this.code,
      context: this.context,
      message: this.message,
    }
  }
}
