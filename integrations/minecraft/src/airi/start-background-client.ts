import { errorMessageFrom } from '@moeru/std'
import { isAuthenticationServerErrorMessage } from '@proj-airi/server-shared'

interface AiriClientLike {
  connect: () => Promise<void>
}

interface LoggerLike {
  log: (message: string) => void
  warn: (message: string) => void
  withFields: (fields: Record<string, unknown>) => LoggerLike
}

/** Starts a background connection and reports each failure category once until the connection succeeds. */
export function startAiriClientConnection(client: AiriClientLike, deps: {
  logger: LoggerLike
  url: string
}) {
  let unavailableReported = false
  let authenticationReported = false

  const reportAuthenticationFailure = (error: unknown) => {
    const message = errorMessageFrom(error) ?? 'Unknown error'
    if (!isAuthenticationServerErrorMessage(message))
      return false

    if (!authenticationReported) {
      authenticationReported = true
      deps.logger.withFields({ url: deps.url, error: message }).warn(
        'AIRI authentication failed. Copy the token from AIRI Settings -> Connection. Set AIRI_WS_TOKEN in integrations/minecraft/.env.local to that token. Then restart the bot.',
      )
    }
    return true
  }

  const reportUnavailable = (error: unknown) => {
    if (reportAuthenticationFailure(error))
      return

    if (unavailableReported)
      return

    unavailableReported = true
    deps.logger.withFields({
      url: deps.url,
      error: errorMessageFrom(error) ?? 'Unknown error',
    }).warn('AIRI server is unavailable. Continuing startup without AIRI and retrying in background')
  }

  const reportDisconnected = () => {
    deps.logger.withFields({
      url: deps.url,
    }).warn('AIRI server connection closed. Retrying in background')
  }

  void client.connect()
    .then(() => {
      deps.logger.withFields({
        url: deps.url,
      }).log(
        unavailableReported
          ? 'Connected to AIRI server after background retry'
          : 'Connected to AIRI server',
      )
      unavailableReported = false
      authenticationReported = false
    })
    .catch((error) => {
      if (reportAuthenticationFailure(error))
        return

      deps.logger.withFields({
        url: deps.url,
        error: errorMessageFrom(error) ?? 'Unknown error',
      }).warn('AIRI client stopped retrying')
    })

  return {
    reportUnavailable,
    reportDisconnected,
  }
}
