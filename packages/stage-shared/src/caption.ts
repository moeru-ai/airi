/** A caption update sent through the cross-window caption channel. */
export interface CaptionChannelEvent {
  /** Controls whether the overlay appends text or replaces the current source text. */
  operation?: 'append' | 'replace'
  /** Text rendered by the caption overlay. Empty text clears this source. */
  text: string
  /**
   * Identifies the speaker that owns this caption text.
   *
   * `caption-assistant-translation` carries the translated line produced by
   * the bilingual subtitle feature. It never reaches the speech engine, so it
   * is posted directly instead of being derived from playback.
   */
  type: 'caption-speaker' | 'caption-assistant' | 'caption-assistant-translation'
  /** Optional language label rendered before the text, e.g. `中文`. */
  label?: string
}
