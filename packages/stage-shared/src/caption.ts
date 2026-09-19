/** Assistant spoken caption. The translation type adds the bilingual second line. */
export type CaptionChannelType
  = | 'caption-speaker'
    | 'caption-assistant'
    | 'caption-assistant-translation'

/** A caption update sent through the cross-window caption channel. */
export interface CaptionChannelEvent {
  /** Controls whether the overlay appends text or replaces the current source text. */
  operation?: 'append' | 'replace'
  /** Text rendered by the caption overlay. Empty text clears this source. */
  text: string
  /** Identifies the speaker that owns this caption text. */
  type: CaptionChannelType
  /**
   * Native language name for the translation line, for example `中文`.
   * Present only for `caption-assistant-translation`.
   */
  label?: string
}
