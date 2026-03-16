import { ContextUpdateStrategy, MessageHeartbeat, MetadataEventSource, ModuleConfigSchema, ModuleDependency, WebSocketBaseEvent, WebSocketEvent, WebSocketEventOptionalSource, WebSocketEventSource, WebSocketEvents } from "@proj-airi/server-shared/types";
export * from "@proj-airi/server-shared/types";

//#region src/client.d.ts
interface ClientOptions<C = undefined> {
  url?: string;
  name: string;
  possibleEvents?: Array<keyof WebSocketEvents<C>>;
  token?: string;
  identity?: MetadataEventSource;
  dependencies?: ModuleDependency[];
  configSchema?: ModuleConfigSchema;
  heartbeat?: {
    readTimeout?: number;
    message?: MessageHeartbeat | string;
  };
  onError?: (error: unknown) => void;
  onClose?: () => void;
  autoConnect?: boolean;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  onAnyMessage?: (data: WebSocketEvent<C>) => void;
  onAnySend?: (data: WebSocketEvent<C>) => void;
}
declare class Client<C = undefined> {
  private connected;
  private connecting;
  private websocket?;
  private shouldClose;
  private connectAttempt?;
  private connectTask?;
  private heartbeatTimer?;
  private readonly identity;
  private readonly opts;
  private readonly eventListeners;
  constructor(options: ClientOptions<C>);
  private retryWithExponentialBackoff;
  private tryReconnectWithExponentialBackoff;
  private _connect;
  connect(): Promise<void>;
  private tryAnnounce;
  private tryAuthenticate;
  private readonly handleMessageBound;
  private handleMessage;
  onEvent<E extends keyof WebSocketEvents<C>>(event: E, callback: (data: WebSocketBaseEvent<E, WebSocketEvents<C>[E]>) => void | Promise<void>): void;
  offEvent<E extends keyof WebSocketEvents<C>>(event: E, callback?: (data: WebSocketBaseEvent<E, WebSocketEvents<C>[E]>) => void): void;
  send(data: WebSocketEventOptionalSource<C>): void;
  sendRaw(data: string | ArrayBufferLike | ArrayBufferView): void;
  close(): void;
  private startHeartbeat;
  private stopHeartbeat;
  private sendNativeHeartbeat;
  private sendHeartbeatPing;
  private sendHeartbeatPong;
  private _reconnectDueToUnauthorized;
}
//#endregion
export { Client, ClientOptions, ContextUpdateStrategy, WebSocketEventSource };
//# sourceMappingURL=index.d.mts.map