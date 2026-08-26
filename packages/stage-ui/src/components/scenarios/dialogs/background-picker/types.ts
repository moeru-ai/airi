import type { Component } from 'vue'

export interface BackgroundOption {
  id: string
  label: string
  description?: string
  /**
   * Optional kind discriminator forwarded to the consumer.
   */
  kind?: string
  /**
   * File for custom uploads; used to derive object URLs and for persistence.
   */
  file?: File
  /**
   * Optional image source used in preview and selection.
   */
  src?: string
  /**
   * Apply blur on render.
   */
  blur?: boolean
  /**
   * Optional component renderer when the background is procedural/pattern-based.
   */
  component?: Component
  /**
   * Whether the background can be removed.
   */
  removable?: boolean
}
