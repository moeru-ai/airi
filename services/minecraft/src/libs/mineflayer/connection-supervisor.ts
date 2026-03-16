import type { Logg } from '@guiiai/logg'

export interface ReconnectOptions {
  enabled?: boolean
  maxRetries?: number
}

export interface ReconnectContext {
  reason: string
  attempt: number
  maxRetries: number
}

export interface ConnectionSupervisorDeps {
  logger: Logg
  reconnect?: ReconnectOptions
  spawnTimeoutMs?: number
  replaceBot: (context: ReconnectContext) => Promise<void>
}

export type ConnectionState = 'idle' | 'awaiting_spawn'

export interface ConnectionSupervisor {
  onDisconnect: (reason: string) => Promise<void> | void
  onSpawn: () => void
  stop: () => void
}

const DEFAULT_RECONNECT_MAX_RETRIES = 5
const DEFAULT_SPAWN_TIMEOUT_MS = 15_000

export function createConnectionSupervisor(deps: ConnectionSupervisorDeps): ConnectionSupervisor {
  let state: ConnectionState = 'idle'
  let attempts = 0
  let stopping = false
  let spawnWatchdogTimer: ReturnType<typeof setTimeout> | null = null
  let transitionQueue: Promise<void> = Promise.resolve()

  function clearSpawnWatchdog(): void {
    if (!spawnWatchdogTimer)
      return

    clearTimeout(spawnWatchdogTimer)
    spawnWatchdogTimer = null
  }

  async function enqueue(task: () => Promise<void>): Promise<void> {
    const nextTask = transitionQueue.then(task)

    transitionQueue = nextTask
      .then(() => undefined)
      .catch(() => undefined)

    return nextTask
  }

  function transitionState(nextState: ConnectionState, reason: string): void {
    if (state === nextState)
      return

    const previousState = state
    state = nextState

    if (nextState !== 'awaiting_spawn') {
      clearSpawnWatchdog()
    }
    else {
      clearSpawnWatchdog()

      const timeoutMs = deps.spawnTimeoutMs ?? DEFAULT_SPAWN_TIMEOUT_MS
      spawnWatchdogTimer = setTimeout(() => {
        void enqueue(async () => {
          if (stopping || state !== 'awaiting_spawn')
            return

          deps.logger.withFields({
            attempt: attempts,
            timeoutMs,
          }).error('Reconnect attempt timed out before spawn')

          transitionState('idle', 'spawn-timeout')
          await handleDisconnect('spawn-timeout')
        })
      }, timeoutMs)
    }

    deps.logger.withFields({
      from: previousState,
      to: nextState,
      reason,
    }).log('Reconnect state transition')
  }

  async function handleDisconnect(reason: string): Promise<void> {
    if (stopping)
      return

    if (!deps.reconnect?.enabled)
      return

    if (state === 'awaiting_spawn') {
      deps.logger.withFields({ reason }).error('Reconnect interrupted before spawn; retrying')
      transitionState('idle', 'interrupted-before-spawn')
    }

    const maxRetries = deps.reconnect.maxRetries ?? DEFAULT_RECONNECT_MAX_RETRIES
    if (attempts >= maxRetries) {
      deps.logger.error(`Max reconnect attempts (${maxRetries}) reached. Giving up.`)
      return
    }

    attempts += 1
    transitionState('awaiting_spawn', reason)

    deps.logger.withFields({
      reason,
      attempt: attempts,
      maxRetries,
    }).log('Reconnecting...')

    try {
      await deps.replaceBot({
        reason,
        attempt: attempts,
        maxRetries,
      })

      deps.logger.log('Reconnect initiated, waiting for spawn...')
    }
    catch (error) {
      deps.logger.errorWithError('Reconnect failed', error as Error)
      transitionState('idle', 'reconnect-error')
      throw error
    }
  }

  const onDisconnect = (reason: string): Promise<void> => {
    return enqueue(async () => {
      await handleDisconnect(reason)
    })
  }

  const onSpawn = (): void => {
    void enqueue(async () => {
      attempts = 0
      transitionState('idle', 'spawn')
    })
  }

  const stop = (): void => {
    if (stopping)
      return

    stopping = true
    attempts = 0
    clearSpawnWatchdog()

    if (state !== 'idle') {
      const previousState = state
      state = 'idle'
      deps.logger.withFields({
        from: previousState,
        to: state,
        reason: 'stop',
      }).log('Reconnect state transition')
    }
  }

  return {
    onDisconnect,
    onSpawn,
    stop,
  }
}
