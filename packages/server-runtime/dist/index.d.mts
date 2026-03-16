import { n as RoutingPolicy, t as RouteMiddleware } from "./index-CyVnXn1z.mjs";
import { Format, LogLevelString } from "@guiiai/logg";
import { MessageHeartbeat } from "@proj-airi/server-shared/types";
import * as h3 from "h3";
import { H3 } from "h3";
import * as srvx from "srvx";

//#region src/index.d.ts
interface AppOptions {
  instanceId?: string;
  auth?: {
    token: string;
  };
  logger?: {
    app?: {
      level?: LogLevelString;
      format?: Format;
    };
    websocket?: {
      level?: LogLevelString;
      format?: Format;
    };
  };
  routing?: {
    middleware?: RouteMiddleware[];
    allowBypass?: boolean;
    policy?: RoutingPolicy;
  };
  heartbeat?: {
    readTimeout?: number;
    message?: MessageHeartbeat | string;
  };
}
declare function normalizeLoggerConfig(options?: AppOptions): {
  appLogLevel: LogLevelString;
  appLogFormat: Format;
  websocketLogLevel: LogLevelString;
  websocketLogFormat: Format;
};
declare function setupApp(options?: AppOptions): {
  app: H3;
  closeAllPeers: () => void;
};
declare const app: {
    "~rou3": h3.RouterContext;
    request(request: srvx.ServerRequest | URL | string, options?: RequestInit, context?: h3.H3EventContext): Response | Promise<Response>;
    use(route: string, handler: h3.Middleware, opts?: h3.MiddlewareOptions): /*elided*/any;
    use(handler: h3.Middleware, opts?: h3.MiddlewareOptions): /*elided*/any;
    on(method: h3.HTTPMethod | Lowercase<h3.HTTPMethod> | "", route: string, handler: h3.HTTPHandler, opts?: h3.RouteOptions): /*elided*/any;
    register(plugin: h3.H3Plugin): /*elided*/any;
    mount(base: string, input: srvx.FetchHandler | {
      fetch: srvx.FetchHandler;
    } | /*elided*/any): /*elided*/any;
    all(route: string, handler: h3.HTTPHandler, opts?: h3.RouteOptions): /*elided*/any;
    get(route: string, handler: h3.HTTPHandler, opts?: h3.RouteOptions): /*elided*/any;
    post(route: string, handler: h3.HTTPHandler, opts?: h3.RouteOptions): /*elided*/any;
    put(route: string, handler: h3.HTTPHandler, opts?: h3.RouteOptions): /*elided*/any;
    delete(route: string, handler: h3.HTTPHandler, opts?: h3.RouteOptions): /*elided*/any;
    patch(route: string, handler: h3.HTTPHandler, opts?: h3.RouteOptions): /*elided*/any;
    head(route: string, handler: h3.HTTPHandler, opts?: h3.RouteOptions): /*elided*/any;
    options(route: string, handler: h3.HTTPHandler, opts?: h3.RouteOptions): /*elided*/any;
    connect(route: string, handler: h3.HTTPHandler, opts?: h3.RouteOptions): /*elided*/any;
    trace(route: string, handler: h3.HTTPHandler, opts?: h3.RouteOptions): /*elided*/any;
    readonly config: h3.H3Config;
    "~middleware": h3.Middleware[];
    "~routes": h3.H3Route[];
    fetch(_request: srvx.ServerRequest): Response | Promise<Response>;
    handler(event: h3.H3Event): unknown | Promise<unknown>;
    "~request"(request: srvx.ServerRequest, context?: h3.H3EventContext): Response | Promise<Response>;
    "~findRoute"(_event: h3.H3Event): h3.MatchedRoute<h3.H3Route> | void;
    "~getMiddleware"(event: h3.H3Event, route: h3.MatchedRoute<h3.H3Route> | undefined): h3.Middleware[];
    "~addRoute"(_route: h3.H3Route): void;
  }, _: () => void;
//#endregion
export { AppOptions, _, app, normalizeLoggerConfig, setupApp };