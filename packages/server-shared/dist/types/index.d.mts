import { n as __reExport, t as __exportAll } from "../chunk-CtajNgzt.mjs";
import { ModuleIdentity, ProtocolEvents, RouteConfig, WebSocketEventSource } from "@proj-airi/plugin-protocol/types";
export * from "@proj-airi/plugin-protocol/types";

//#region src/types/websocket/events.d.ts
interface WebSocketEventBaseMetadata {
  source?: ModuleIdentity;
  event?: {
    id?: string;
    parentId?: string;
  };
}
interface WebSocketBaseEvent<T, D, S extends string = string> {
  type: T;
  data: D;
  /**
   * @deprecated Prefer metadata.source.
   */
  source?: WebSocketEventSource | S;
  metadata: {
    source: ModuleIdentity;
    event: {
      id: string;
      parentId?: string;
    };
  };
  route?: RouteConfig;
}
interface WebSocketEvents<C = undefined> extends ProtocolEvents<C> {}
type WebSocketEventDataInputs = WebSocketEvents['input:text'] | WebSocketEvents['input:text:voice'] | WebSocketEvents['input:voice'];
type WebSocketEvent<C = undefined> = { [K in keyof WebSocketEvents<C>]: WebSocketBaseEvent<K, WebSocketEvents<C>[K]> }[keyof WebSocketEvents<C>];
type WebSocketEventOptionalSource<C = undefined> = { [K in keyof WebSocketEvents<C>]: Omit<WebSocketBaseEvent<K, WebSocketEvents<C>[K]>, 'metadata'> & {
  metadata?: WebSocketEventBaseMetadata;
} }[keyof WebSocketEvents<C>];
type WebSocketEventOf<E, C = undefined> = E extends keyof WebSocketEvents<C> ? Omit<WebSocketBaseEvent<E, WebSocketEvents<C>[E]>, 'metadata'> & {
  metadata?: WebSocketEventBaseMetadata;
} : never;
type WebSocketEventInputs = WebSocketEventOf<'input:text'> | WebSocketEventOf<'input:text:voice'> | WebSocketEventOf<'input:voice'>;
declare namespace index_d_exports$1 {
  export { WebSocketBaseEvent, WebSocketEvent, WebSocketEventBaseMetadata, WebSocketEventDataInputs, WebSocketEventInputs, WebSocketEventOf, WebSocketEventOptionalSource, WebSocketEvents };
}
declare namespace index_d_exports {
  export { WebSocketBaseEvent, WebSocketEvent, WebSocketEventBaseMetadata, WebSocketEventDataInputs, WebSocketEventInputs, WebSocketEventOf, WebSocketEventOptionalSource, WebSocketEvents };
}
//#endregion
export { WebSocketBaseEvent, WebSocketEvent, WebSocketEventBaseMetadata, WebSocketEventDataInputs, WebSocketEventInputs, WebSocketEventOf, WebSocketEventOptionalSource, WebSocketEvents };
//# sourceMappingURL=index.d.mts.map