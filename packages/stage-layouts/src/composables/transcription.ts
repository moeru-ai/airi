/** Routes page-owned voice input into the draft of its originating chat session. */
export interface ComposerTranscription {
  sessionId: string
  kind: 'start' | 'stop' | 'interim' | 'final' | 'clear'
  text: string
}
