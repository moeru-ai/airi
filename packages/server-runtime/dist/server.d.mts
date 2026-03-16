import "./index-CyVnXn1z.mjs";
import { AppOptions } from "./index.mjs";

//#region src/server/index.d.ts
interface ServerOptions extends AppOptions {
  port?: number;
  hostname?: string;
  tlsConfig?: {
    cert?: string;
    key?: string;
    passphrase?: string;
  } | null;
}
interface Server {
  getConnectionHost: () => string[];
  start: () => Promise<void>;
  stop: () => Promise<void>;
  restart: () => Promise<void>;
  updateConfig: (newOptions: ServerOptions) => void;
}
declare function getLocalIPs(): string[];
declare function createServer(opts?: ServerOptions): Server;
//#endregion
export { Server, ServerOptions, createServer, getLocalIPs };