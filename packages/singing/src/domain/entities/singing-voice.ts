/**
 * Domain entity representing a registered singing voice (RVC model).
 */
export interface SingingVoice {
  readonly id: string
  name: string
  description?: string
  /** Path to the .pth model file */
  modelPath: string
  /** Path to the .index file for retrieval */
  indexPath?: string
  createdAt: Date
}
