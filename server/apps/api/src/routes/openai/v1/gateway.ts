import type { Context, Handler, MiddlewareHandler } from 'hono'

import type { HonoEnv } from '../../../types/hono'
import type { ChatCompletionsOperationRequest } from './operations/chat-completions'
import type { SpeechGenerationOperationRequest } from './operations/speech-generation'
import type { V1RouteDeps } from './types'

import { Hono } from 'hono'

export type GatewayCallback<Name extends V1GatewayOperationName> = (
  context: V1GatewayContext<Name>,
) => Promise<Response>

export type GatewayMiddleware<Name extends V1GatewayOperationName> = (
  context: V1GatewayContext<Name>,
  next: () => Promise<Response>,
) => Promise<Response>

export type V1HttpSurface = 'audio' | 'openai'

export interface V1GatewayOperationInput {
  'chat.completions': ChatCompletionsOperationRequest
  'speech.generate': SpeechGenerationOperationRequest
}

export type V1GatewayOperationName = keyof V1GatewayOperationInput

export type V1GatewayPlugin = (gateway: V1GatewayRuntime) => void

export interface V1GatewayContext<Name extends V1GatewayOperationName> {
  deps: V1RouteDeps
  hono: Context<HonoEnv>
  input: V1GatewayOperationInput[Name]
}

export interface V1GatewayRuntime {
  deps: V1RouteDeps
  handler: <Name extends V1GatewayOperationName>(
    name: Name,
    parse: (hono: Context<HonoEnv>) => V1GatewayOperationInput[Name] | Promise<V1GatewayOperationInput[Name]>,
    callback: GatewayCallback<Name>,
  ) => Handler<HonoEnv>
  route: (surface: V1HttpSurface) => V1GatewayRoute
  use: {
    (plugin: V1GatewayPlugin): V1GatewayRuntime
    <Name extends V1GatewayOperationName>(name: Name, middleware: GatewayMiddleware<Name>): V1GatewayRuntime
  }
  useHono: (surface: V1HttpSurface | '*', path: string, middleware: MiddlewareHandler<HonoEnv>) => V1GatewayRuntime
}

export interface V1GatewayRoute {
  deps: V1RouteDeps
  get: (path: string, handler: Handler<HonoEnv> | V1GatewayRouteHandler) => V1GatewayRoute
  handler: V1GatewayRuntime['handler']
  post: (path: string, handler: Handler<HonoEnv> | V1GatewayRouteHandler) => V1GatewayRoute
  route: Hono<HonoEnv>
  use: <Name extends V1GatewayOperationName>(name: Name, middleware: GatewayMiddleware<Name>) => V1GatewayRoute
  useHono: (path: string, middleware: MiddlewareHandler<HonoEnv>) => V1GatewayRoute
}

const routeHandlerMarker = Symbol('v1-gateway-route-handler')

export interface V1GatewayRouteHandler {
  (scope: Pick<V1GatewayRoute, 'deps' | 'handler'>): Handler<HonoEnv>
  [routeHandlerMarker]: true
}

export function routeHandler(handler: (scope: Pick<V1GatewayRoute, 'deps' | 'handler'>) => Handler<HonoEnv>): V1GatewayRouteHandler {
  return Object.assign(handler, { [routeHandlerMarker]: true as const })
}

interface RegisteredHttpMiddleware {
  middleware: MiddlewareHandler<HonoEnv>
  path: string
  surface: V1HttpSurface | '*'
}

type OperationMiddlewares = {
  [Name in V1GatewayOperationName]: GatewayMiddleware<Name>[]
}

function cloneOperationMiddlewares(input: OperationMiddlewares): OperationMiddlewares {
  return {
    'chat.completions': [...input['chat.completions']],
    'speech.generate': [...input['speech.generate']],
  }
}

/**
 * Runs an OpenAI gateway callback through operation-scoped middleware.
 *
 * Use when:
 * - The middleware needs parsed gateway input such as user id, model, body,
 *   session id, or abort signal.
 * - The behavior is not a generic HTTP concern and should not receive Hono
 *   `Context`.
 *
 * Expects:
 * - `callback` is the concrete gateway business callback.
 * - `middlewares` are ordered from outermost to innermost.
 *
 * Returns:
 * - A response produced by the gateway callback chain.
 */
export function runGatewayMiddlewares<Name extends V1GatewayOperationName>(
  context: V1GatewayContext<Name>,
  callback: GatewayCallback<Name>,
  middlewares: GatewayMiddleware<Name>[],
): Promise<Response> {
  const runnable = middlewares.reduceRight<GatewayCallback<Name>>(
    (next, middleware) => ctx => middleware(ctx, () => next(ctx)),
    callback,
  )
  return runnable(context)
}

export function createV1Gateway(deps: V1RouteDeps): V1GatewayRuntime {
  const httpMiddlewares: RegisteredHttpMiddleware[] = []
  const operationMiddlewares: OperationMiddlewares = {
    'chat.completions': [],
    'speech.generate': [],
  }

  let gateway: V1GatewayRuntime

  function use(plugin: V1GatewayPlugin): V1GatewayRuntime
  function use<Name extends V1GatewayOperationName>(name: Name, middleware: GatewayMiddleware<Name>): V1GatewayRuntime
  function use<Name extends V1GatewayOperationName>(
    arg1: V1GatewayPlugin | Name,
    arg2?: GatewayMiddleware<Name>,
  ): V1GatewayRuntime {
    if (typeof arg1 === 'function') {
      arg1(gateway)
    }
    else if (arg2) {
      operationMiddlewares[arg1].push(arg2)
    }
    return gateway
  }

  function handlerWithMiddlewares<Name extends V1GatewayOperationName>(
    middlewares: OperationMiddlewares,
    name: Name,
    parse: (hono: Context<HonoEnv>) => V1GatewayOperationInput[Name] | Promise<V1GatewayOperationInput[Name]>,
    callback: GatewayCallback<Name>,
  ): Handler<HonoEnv> {
    return async (hono) => {
      const input = await parse(hono)
      return runGatewayMiddlewares(
        { deps, hono, input },
        callback,
        middlewares[name],
      )
    }
  }

  function createRoute(surface: V1HttpSurface): V1GatewayRoute {
    const route = new Hono<HonoEnv>()

    for (const registered of httpMiddlewares) {
      if (registered.surface === '*' || registered.surface === surface)
        route.use(registered.path, registered.middleware)
    }

    function makeBuilder(scopedOperationMiddlewares: OperationMiddlewares): V1GatewayRoute {
      let builder: V1GatewayRoute

      function register(method: 'get' | 'post', path: string, handler: Handler<HonoEnv> | V1GatewayRouteHandler): V1GatewayRoute {
        route[method](path, resolveRouteHandler(builder, handler))
        return builder
      }

      builder = {
        deps,
        get: (path, handler) => register('get', path, handler),
        handler(name, parse, callback) {
          return handlerWithMiddlewares(scopedOperationMiddlewares, name, parse, callback)
        },
        post: (path, handler) => register('post', path, handler),
        route,
        use(name, middleware) {
          const nextMiddlewares = cloneOperationMiddlewares(scopedOperationMiddlewares)
          nextMiddlewares[name].push(middleware)
          return makeBuilder(nextMiddlewares)
        },
        useHono(path, middleware) {
          route.use(path, middleware)
          return builder
        },
      }

      return builder
    }

    return makeBuilder(cloneOperationMiddlewares(operationMiddlewares))
  }

  gateway = {
    deps,
    handler(name, parse, callback) {
      return handlerWithMiddlewares(operationMiddlewares, name, parse, callback)
    },
    route: createRoute,
    use,
    useHono(surface, path, middleware) {
      httpMiddlewares.push({ surface, path, middleware })
      return gateway
    },
  }

  return gateway
}

function resolveRouteHandler(scope: V1GatewayRoute, handler: Handler<HonoEnv> | V1GatewayRouteHandler): Handler<HonoEnv> {
  if (routeHandlerMarker in handler)
    return (handler as V1GatewayRouteHandler)(scope)
  return handler as Handler<HonoEnv>
}
