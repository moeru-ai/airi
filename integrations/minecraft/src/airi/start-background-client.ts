import { errorMessageFrom } from '@moeru/std'
import { parseServerErrorMessage } from '@proj-airi/server-shared'

interface AiriClientLike {
  connect: () => Promise<void>
}

interface LoggerLike {
  log: (message: string) => void
  warn: (message: string) => void
  withFields: (fields: Record<string, unknown>) => LoggerLike
}

type ReportedFailureKind = 'authentication-retrying' | 'authentication-terminal' | 'connection'

export function startAiriClientConnection(client: AiriClientLike, deps: {
  logger: LoggerLike
  url: string
}) {
  let connectionInterrupted = false
  let reportedFailureKind: ReportedFailureKind | undefined

  const reportError = (error: unknown) => {
    const errorMessage = errorMessageFrom(error) ?? 'Unknown error'
    const serverError = parseServerErrorMessage(errorMessage)
    let failureKind: ReportedFailureKind = 'connection'
    if (serverError.authentication) {
      failureKind = serverError.terminal ? 'authentication-terminal' : 'authentication-retrying'
    }

    if (reportedFailureKind === failureKind)
      return

    connectionInterrupted = true
    reportedFailureKind = failureKind

    if (serverError.authentication) {
      deps.logger.withFields({
        url: deps.url,
        error: errorMessage,
        retrying: !serverError.terminal,
      }).warn(
        serverError.terminal
          ? 'AIRI server authentication failed. Check AIRI_WS_TOKEN before restarting the service'
          : 'AIRI server authentication failed. Set AIRI_WS_TOKEN to the desktop server Auth Token. The client will retry in background',
      )
      return
    }

    deps.logger.withFields({
      url: deps.url,
      error: errorMessage,
      retrying: true,
    }).warn('AIRI server is unavailable. The service will continue startup and retry in background')
  }

  const reportDisconnected = () => {
    connectionInterrupted = true
    reportedFailureKind = 'connection'
    deps.logger.withFields({
      url: deps.url,
      retrying: true,
    }).warn('AIRI server connection closed. The client will retry in background')
  }

  const reportConnected = () => {
    deps.logger.withFields({
      url: deps.url,
    }).log(
      connectionInterrupted
        ? 'Connected to AIRI server after background retry'
        : 'Connected to AIRI server',
    )
    connectionInterrupted = false
    reportedFailureKind = undefined
  }

  void client.connect().catch(reportError)

  return {
    reportConnected,
    reportDisconnected,
    reportError,
  }
}
