/**
 * Sentry `dataCollection` options for every AIRI client.
 *
 * A report keeps the stack trace and the SDK context. It drops user identity, cookies, HTTP headers and bodies,
 * URL query values, model inputs and outputs, and local variable values. Chats, API keys, and OAuth codes can
 * appear in these fields.
 *
 * Each app passes this object to its own Sentry SDK. The apps use different SDK majors, so this module does not
 * import a Sentry type.
 */
export const errorReportingDataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  genAI: { inputs: false, outputs: false },
  stackFrameVariables: false,
}

/**
 * Default integrations that each AIRI client removes.
 *
 * Session integrations send release health envelopes, and `beforeSend` does not see envelopes. They would send data
 * while the analytics switch is off. `Console` records log lines as breadcrumbs (Sentry JS 11 and Electron main), and
 * logs can hold chat text.
 */
const removedIntegrations = new Set(['BrowserSession', 'MainProcessSession', 'Console'])

/**
 * Selects the Sentry integrations of an AIRI client. Pass it as the `integrations` option.
 *
 * An integration in `extras` replaces the default with the same name, because Sentry keeps a non-default instance.
 * Sentry JS 10 records console breadcrumbs in `Breadcrumbs`, so a client on it passes that integration with
 * `console: false`.
 *
 * @example
 * init({ integrations: defaults => selectErrorReportingIntegrations(defaults, [breadcrumbsIntegration({ console: false })]) })
 */
export function selectErrorReportingIntegrations<TIntegration extends { name: string }>(
  defaults: TIntegration[],
  extras: TIntegration[],
): TIntegration[] {
  return [...defaults.filter(integration => !removedIntegrations.has(integration.name)), ...extras]
}
