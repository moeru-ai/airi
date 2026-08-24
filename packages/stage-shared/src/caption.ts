/** A caption update sent through the cross-window caption channel. */
export interface CaptionChannelEvent {
  /** Controls whether the overlay appends text or replaces the current source text. */
  operation?: 'append' | 'replace'
  /** Text rendered by the caption overlay. Empty text clears this source. */
  text: string
  /** Identifies the speaker that owns this caption text. */
  type: 'caption-speaker' | 'caption-assistant'
}
