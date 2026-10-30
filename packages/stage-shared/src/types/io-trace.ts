/** Runtime state of the trace hub that the Electron main process owns. */
export interface IOTraceHubState {
  /** When true, the hub keeps recent records in memory, so a tracer window that opens later can show them. */
  collecting: boolean
  /** Number of records in the event buffer. Series points are in separate rings. */
  bufferedRecords: number
  /** JSON bytes of the event buffer. */
  bufferedBytes: number
  /** The hub drops the oldest records when the buffer has more bytes than this. */
  maxBytes: number
  /** The hub drops records that it received earlier than this many milliseconds ago. */
  maxAgeMs: number
  /** Records that arrived after the watermark of their source. */
  late: number
  /** Records that failed the schema check. */
  dropped: number
}

/** Runtime state for Electron-owned trace recording. */
export interface IOTraceRecordingState {
  directory: string
  enabled: boolean
  error?: string
  filePath?: string
}
