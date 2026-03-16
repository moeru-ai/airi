import { MetadataEventSource, RouteTargetExpression, WebSocketEvent } from "@proj-airi/server-shared/types";

//#region src/types/conn.d.ts
interface Peer {
  /**
   * Unique random [uuid v4](https://developer.mozilla.org/en-US/docs/Glossary/UUID) identifier for the peer.
   */
  get id(): string;
  send: (data: unknown, options?: {
    compress?: boolean;
  }) => number | void | undefined;
  close?: () => void;
  /**
   * WebSocket lifecycle state (mirrors WebSocket.readyState)
   */
  readyState?: number;
}
interface NamedPeer {
  name: string;
  index?: number;
  peer: Peer;
}
interface AuthenticatedPeer extends NamedPeer {
  authenticated: boolean;
  identity?: MetadataEventSource;
  lastHeartbeatAt?: number;
  healthy?: boolean;
  missedHeartbeats?: number;
}
//#endregion
//#region src/middlewares/route.d.ts
type RouteDecision = {
  type: 'drop';
} | {
  type: 'broadcast';
} | {
  type: 'targets';
  targetIds: Set<string>;
};
interface RoutingPolicy {
  allowPlugins?: string[];
  denyPlugins?: string[];
  allowLabels?: string[];
  denyLabels?: string[];
}
interface RouteContext {
  event: WebSocketEvent;
  fromPeer: AuthenticatedPeer;
  peers: Map<string, AuthenticatedPeer>;
  destinations?: Array<string | RouteTargetExpression>;
}
type RouteMiddleware = (context: RouteContext) => RouteDecision | void;
//#endregion
export { RoutingPolicy as n, RouteMiddleware as t };