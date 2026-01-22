export interface ActionInstruction {
  id?: string
  description?: string
  require_feedback?: boolean
  action: string
  params?: Record<string, unknown>
}
