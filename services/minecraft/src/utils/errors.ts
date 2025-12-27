export type ActionErrorCode =
  | 'RESOURCE_MISSING'
  | 'CRAFTING_FAILED'
  | 'NAVIGATION_FAILED'
  | 'INTERRUPTED'
  | 'INVENTORY_FULL'
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
      message: this.message,
      code: this.code,
      context: this.context,
    }
  }
}
