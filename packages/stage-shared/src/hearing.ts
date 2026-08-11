/** Shared channel name for streaming Hearing text shown in editable chat input. */
export const hearingInputChannelName = 'airi-hearing-input'

/** A streaming Hearing update sent from the microphone owner to a chat window. */
export type HearingInputChannelEvent
  = | {
    /** Removes text owned by the matching Provider utterance. */
    operation: 'clear'
    /** Correlates delayed cleanup with the matching Provider utterance. */
    sourceId: string
  }
  | {
    /** Replaces the current text owned by this Provider utterance. */
    operation: 'replace'
    /** Correlates transcript revisions with the matching Provider utterance. */
    sourceId: string
    /** Contains the complete current utterance. */
    text: string
  }
