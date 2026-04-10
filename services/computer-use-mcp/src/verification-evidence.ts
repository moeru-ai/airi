export type VerificationEvidenceKind =
  | 'foreground_context'
  | 'window_title_match'
  | 'screenshot_capture'
  | 'runtime_fact_summary'
  | 'terminal_result'
  | 'coding_review'
  | 'status_report'

export interface VerificationEvidenceRecord {
  kind: VerificationEvidenceKind
  source: string
  capturedAt: string
  confidence: number
  summary: string
  blockingEligible: boolean
  /** The target or focus of the verification (e.g. selector, pointer_target, etc.) */
  subject?: string
  /** The specific action that triggered the evidence capture. */
  actionKind?: string
  /** Key-value observations captured from the runtime. */
  observed?: Record<string, string | number | boolean | null>
  /** References to runtime facts summarized in this record. */
  relatedRuntimeFacts?: Array<'executionTarget' | 'foregroundContext' | 'displayInfo' | 'terminalState' | 'browserSurfaceAvailability' | 'lastScreenshot'>
}
