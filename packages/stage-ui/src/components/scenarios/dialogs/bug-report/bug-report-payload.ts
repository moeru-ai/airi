export interface BugReportPageContext {
  url: string
  title: string
  userAgent: string
  viewport: string
  language: string
  timeZone: string
  timestamp: string
}

export interface BuildBugReportPayloadOptions {
  description: string
  includeTriageContext?: boolean
  context?: BugReportPageContext | null
  screenshotAttached?: boolean
}

interface WindowLike {
  location?: {
    href?: string
  }
  document?: {
    title?: string
  }
  navigator?: {
    userAgent?: string
    language?: string
  }
  innerWidth?: number
  innerHeight?: number
  Intl?: {
    DateTimeFormat?: () => {
      resolvedOptions?: () => {
        timeZone?: string
      }
    }
  }
  Date?: {
    now?: () => number
  }
}

export function createBugReportPageContext(win: WindowLike | undefined = globalThis.window): BugReportPageContext | null {
  if (!win)
    return null

  const now = win.Date?.now?.() ?? Date.now()
  const timeZone = win.Intl?.DateTimeFormat?.()?.resolvedOptions?.()?.timeZone ?? 'unknown'

  return {
    url: win.location?.href ?? 'unknown',
    title: win.document?.title ?? '',
    userAgent: win.navigator?.userAgent ?? 'unknown',
    viewport: `${win.innerWidth ?? 0}x${win.innerHeight ?? 0}`,
    language: win.navigator?.language ?? 'unknown',
    timeZone,
    timestamp: new Date(now).toISOString(),
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
