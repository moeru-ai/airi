/**
 * Moeru-AI Character Card Markdown Extension
 */
export interface Ext {
  /** Placeholder for future extension properties */
  readonly _brand?: 'Ext'
}

export const defineExt = (ext: Ext) => ext
