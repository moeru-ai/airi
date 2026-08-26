import type { BugReportPageContext } from './bug-report-payload'

export interface BugReportDialogSubmitPayload {
  context: BugReportPageContext | null
  description: string
  formattedReport: string
  includeTriageContext: boolean
  screenshotAttached: boolean
  screenshotFiles: File[]
}
