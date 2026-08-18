import type { BugReportPageContext } from './bug-report-payload'

export interface BugReportDialogSubmitPayload {
  description: string
  includeTriageContext: boolean
  context: BugReportPageContext | null
  screenshotAttached: boolean
  screenshotFiles: File[]
  formattedReport: string
}
