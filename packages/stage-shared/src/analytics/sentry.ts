/**
 * The Sentry project of each AIRI client, in the organization `proj-airi`. A DSN is public: it only allows sending
 * events. `./sentry-vite` keeps the project slugs for the source map upload.
 */
export const SENTRY_PROJECTS = {
  desktop: { dsn: 'https://707a0d53d3bdc5dd83d2fc1ca894e450@o4512400996827136.ingest.us.sentry.io/4512401048797184' },
  web: { dsn: 'https://d1f8d44162b7d48c41fb553988e48c93@o4512400996827136.ingest.us.sentry.io/4512401048928256' },
  mobile: { dsn: 'https://168e3e93cd7df3da42b2b449c7f52058@o4512400996827136.ingest.us.sentry.io/4512401048993792' },
} as const

/**
 * Session integrations send release health envelopes. `beforeSend` does not see envelopes, so they would still go
 * out while the analytics switch is off. Electron main and the browser SDKs use these names.
 */
const sessionIntegrations = new Set(['BrowserSession', 'MainProcessSession'])

/**
 * Sentry options that every AIRI client shares, also Electron main.
 *
 * A report keeps the stack trace and the SDK context. It drops user identity that the SDK infers, cookies, HTTP
 * headers and bodies, URL query values, model inputs and outputs, local variables, and log lines. Chats, API keys,
 * and OAuth codes can appear in these fields. An AIRI user id set with `setUser` is still sent.
 *
 * The clients use different Sentry majors, so this object imports no Sentry type. Each SDK checks it at `init`.
 */
export const sharedSentryOptions = {
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    genAI: { inputs: false, outputs: false },
    stackFrameVariables: false,
  },
  integrations: <TIntegration extends { name: string }>(defaults: TIntegration[]) =>
    defaults.filter(integration => !sessionIntegrations.has(integration.name)),
  // Log lines can hold chat text. Sentry JS 10 records them in `Breadcrumbs`, Sentry JS 11 and Electron main in `Console`.
  beforeBreadcrumb: <TBreadcrumb extends { category?: string }>(breadcrumb: TBreadcrumb) =>
    breadcrumb.category === 'console' ? null : breadcrumb,
  // Client reports skip `beforeSend`, so they would still go out while the switch is off.
  sendClientReports: false,
}
