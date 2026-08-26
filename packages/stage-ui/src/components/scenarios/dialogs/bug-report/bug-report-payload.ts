export interface BugReportPageContext {
  language: string
  timestamp: string
  timeZone: string
  title: string
  url: string
  userAgent: string
  viewport: string
}

export interface BuildBugReportPayloadOptions {
  context?: BugReportPageContext | null
  description: string
  includeTriageContext?: boolean
  screenshotAttached?: boolean
}

interface WindowLike {
  Date?: {
    now?: () => number
  }
  document?: {
    title?: string
  }
  innerHeight?: number
  innerWidth?: number
  Intl?: {
    DateTimeFormat?: () => {
      resolvedOptions?: () => {
        timeZone?: string
      }
    }
  }
  location?: {
    href?: string
  }
  navigator?: {
    language?: string
    userAgent?: string
  }
}

export function buildBugReportPayload(options: BuildBugReportPayloadOptions): string {
  const sections: string[] = [
    '## Bug Report',
    '',
    options.description.trim() || '_No description provided._',
  ]

  if (!options.includeTriageContext)
    return sections.join('\n')

  sections.push('', '## Triage Context')

  if (options.context) {
    sections.push(
      `- URL: ${options.context.url}`,
      `- Title: ${options.context.title || 'unknown'}`,
      `- Viewport: ${options.context.viewport}`,
      `- User Agent: ${options.context.userAgent}`,
      `- Language: ${options.context.language}`,
      `- Time Zone: ${options.context.timeZone}`,
      `- Captured At: ${options.context.timestamp}`,
    )
  }
  else {
    sections.push('- Page context unavailable')
  }

  sections.push(`- Screenshot attached: ${options.screenshotAttached ? 'yes' : 'no'}`)

  return sections.join('\n')
}

export function createBugReportPageContext(win: undefined | WindowLike = globalThis.window): BugReportPageContext | null {
  if (!win)
    return null

  const now = win.Date?.now?.() ?? Date.now()
  const timeZone = win.Intl?.DateTimeFormat?.()?.resolvedOptions?.()?.timeZone ?? 'unknown'

  return {
    language: win.navigator?.language ?? 'unknown',
    timestamp: new Date(now).toISOString(),
    timeZone,
    title: win.document?.title ?? '',
    url: win.location?.href ?? 'unknown',
    userAgent: win.navigator?.userAgent ?? 'unknown',
    viewport: `${win.innerWidth ?? 0}x${win.innerHeight ?? 0}`,
  }
}
