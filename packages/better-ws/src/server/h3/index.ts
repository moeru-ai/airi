import type { Hooks } from 'crossws'
import type { EventHandler } from 'h3'
import type { ServerPlugin, ServerRequest } from 'srvx'

import type { WsCrossWsHandlerOptions, WsServer } from '..'

import { plugin as crossWsPlugin } from 'crossws/server'
import { defineWebSocketHandler } from 'h3'

import { toCrossWsHooks } from '..'

export interface H3CrossWsResponse extends Response {
  crossws?: Partial<Hooks>
}

export interface H3CrossWsApp {
  fetch: (request: ServerRequest) => Promise<H3CrossWsResponse>
}

/**
 * Converts a better-ws server into an H3 websocket route handler. The H3
 * application still needs the CrossWS plugin installed so upgrade requests can
 * resolve the route-scoped hooks produced by this adapter.
 */
export function toH3Handler<TMessage = string, TState = unknown>(
  server: WsServer<TMessage, TState>,
  options?: WsCrossWsHandlerOptions<TMessage, TState>,
): EventHandler {
  return defineWebSocketHandler(toCrossWsHooks(server, options))
}

/**
 * Creates the CrossWS plugin resolver used by H3 `serve(...)`.
 */
export function createH3CrossWsPlugin(app: H3CrossWsApp): ServerPlugin {
  return crossWsPlugin({
    resolve: async (request) => {
      const response = await app.fetch(request)
      return response.crossws!
    },
  })
}
