import type { Component } from 'vue'

export interface BackgroundOption {
  /**
   * Apply blur on render.
   */
  blur?: boolean
  /**
   * Optional component renderer when the background is procedural/pattern-based.
   */
  component?: Component
  description?: string
  /**
   * File for custom uploads; used to derive object URLs and for persistence.
   */
  file?: File
  id: string
  /**
   * Optional kind discriminator forwarded to the consumer.
   */
  kind?: string
  label: string
  /**
   * Whether the background can be removed.
   */
  removable?: boolean
  /**
   * Optional image source used in preview and selection.
   */
  src?: string
}
