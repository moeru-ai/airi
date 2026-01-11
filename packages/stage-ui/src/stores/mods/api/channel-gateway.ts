import type { EventEnvelope } from './events'

export type GatewayEvent = EventEnvelope

export interface GatewayChannel {
  name: string
  in?: ReadableStream<GatewayEvent>
  out?: (event: GatewayEvent) => void
  canHandle?: (event: GatewayEvent) => boolean
}

export interface GatewayRoute {
  match: (event: GatewayEvent) => boolean
  to: string[]
  mode?: 'fan-out' | 'first' | 'all'
}

export interface DispatchOptions {
  origin?: string
}

export interface ChannelGateway {
  register: (channel: GatewayChannel) => void
  unregister: (name: string) => void
  dispatch: (event: GatewayEvent, options?: DispatchOptions) => void
  route: (rule: GatewayRoute) => void
  clearRoutes: () => void
}

export function createChannelGateway(): ChannelGateway {
  const channels = new Map<string, GatewayChannel>()
  const routes: GatewayRoute[] = []
  const readers = new Map<string, ReadableStreamDefaultReader<GatewayEvent>>()

  function dispatch(event: GatewayEvent, options?: DispatchOptions) {
    const matchedRoutes = routes.filter(rule => rule.match(event))

    if (matchedRoutes.length > 0) {
      for (const rule of matchedRoutes) {
        const targets = rule.to
          .map(name => channels.get(name))
          .filter((channel): channel is GatewayChannel => !!channel)

        if (rule.mode === 'first') {
          const target = targets.find(channel => channel.out)
          if (target && target.name !== options?.origin)
            target.out?.(event)
          continue
        }

        for (const target of targets) {
          if (!target.out)
            continue
          if (target.name === options?.origin)
            continue
          target.out(event)
          if (rule.mode === 'all')
            continue
        }
      }
      return
    }

    for (const channel of channels.values()) {
      if (channel.name === options?.origin)
        continue
      if (channel.canHandle && !channel.canHandle(event))
        continue
      channel.out?.(event)
    }
  }

  function register(channel: GatewayChannel) {
    channels.set(channel.name, channel)

    if (!channel.in)
      return

    const reader = channel.in.getReader()
    readers.set(channel.name, reader)

    const pump = async () => {
      try {
        while (true) {
          const result = await reader.read()
          if (result.done)
            break
          dispatch(result.value, { origin: channel.name })
        }
      }
      catch (error) {
        console.warn('Channel gateway stream error:', channel.name, error)
      }
    }

    void pump()
  }

  function unregister(name: string) {
    channels.delete(name)
    const reader = readers.get(name)
    if (reader) {
      reader.cancel().catch(() => undefined)
      readers.delete(name)
    }
  }

  function route(rule: GatewayRoute) {
    routes.push(rule)
  }

  function clearRoutes() {
    routes.length = 0
  }

  return {
    register,
    unregister,
    dispatch,
    route,
    clearRoutes,
  }
}
