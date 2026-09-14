import { errorMessageFrom } from '@moeru/std'

interface AiriClientLike {
  connect: () => Promise<void>
}

interface LoggerLike {
  log: (message: string) => void
  warn: (message: string) => void
  withFields: (fields: Record<string, unknown>) => LoggerLike
}

export function startAiriClientConnection(client: AiriClientLike, deps: {
  logger: LoggerLike
  url: string
}) {
  let unavailableReported = false

  const reportUnavailable = (error: unknown) => {
    if (unavailableReported)
      return

    unavailableReported = true
    deps.logger.withFields({
      url: deps.url,
      error: errorMessageFrom(error) ?? 'Unknown error',
    }).warn('Moeka server is unavailable; continuing startup without Moeka and retrying in background')
  }

  const reportDisconnected = () => {
    deps.logger.withFields({
      url: deps.url,
    }).warn('Moeka server connection closed; retrying in background')
  }

  void client.connect()
    .then(() => {
      deps.logger.withFields({
        url: deps.url,
      }).log(
        unavailableReported
          ? 'Connected to Moeka server after background retry'
          : 'Connected to Moeka server',
      )
      unavailableReported = false
    })
    .catch((error) => {
      deps.logger.withFields({
        url: deps.url,
        error: errorMessageFrom(error) ?? 'Unknown error',
      }).warn('Moeka client stopped retrying')
    })

  return {
    reportUnavailable,
    reportDisconnected,
  }
}
