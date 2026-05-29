# @proj-airi/server-runtime

WebSocket server runtime for AIRI. Provides the HTTP/WebSocket listener, middleware stack, and opt-in mDNS auto-discovery so native clients can locate a server without manual IP/port configuration.

## Usage

```ts
import { createServer } from '@proj-airi/server-runtime/server'

const server = createServer({
  port: 6121,
  hostname: '0.0.0.0',
  mdns: { enabled: true },
})

await server.start()
// ...
await server.stop()
```

## Configuration

| Option | Environment variable | Default | Description |
|---|---|---|---|
| `port` | `PORT` | `6121` | TCP port to listen on |
| `hostname` | `HOST` | `127.0.0.1` | Bind address; use `0.0.0.0` for LAN reachability |
| `mdns.enabled` | `MDNS_ADVERTISE` | `false` | Opt-in mDNS advertisement (see below) |
| `mdns.serviceName` | `MDNS_SERVICE_NAME` | `airi-websocket-server` | DNS-SD instance label |

## Auto-discovery (mDNS)

When enabled, the server advertises itself on the local link via DNS-SD (`_airi._tcp.local`) so native AIRI clients (stage-pocket, stage-tamagotchi) can discover it without manual IP/port entry.

### Enabling

Via environment variable:

```sh
HOST=0.0.0.0 MDNS_ADVERTISE=true node server.js
# or
HOST=0.0.0.0 MDNS_ADVERTISE=1 node server.js
```

`HOST=0.0.0.0` is required for discovery to work. The server defaults to `127.0.0.1`, and mDNS advertisement is skipped automatically for loopback-only listeners because LAN clients cannot reach them.

Via code:

```ts
createServer({ hostname: '0.0.0.0', mdns: { enabled: true } })
```

Both the env variable and the code option are opt-in. The server will never advertise itself unless explicitly configured.

### Service type

```
_airi._tcp.local
```

### TXT record schema

| Key | Values | Description |
|---|---|---|
| `txtvers` | `1` | Schema version. Clients must ignore records with unknown `txtvers`. |
| `path` | `/ws` | WebSocket upgrade path. |
| `proto` | `ws` \| `wss` | Transport scheme (plain or TLS). |
| `auth` | `required` \| `none` | Whether an authentication token is required. |
| `id` | `<nanoid>` | Stable per-process instance identifier for deduplication. |

`txtvers` is bumped on any breaking change to the key set or value semantics. Clients that read TXT records should skip any record with a `txtvers` they do not recognise.

### Hostname conflict handling

The advertiser probes for the chosen name (RFC 6762 §8.1) before claiming it. If `airi-websocket-server.local` is already taken, it falls back to `airi-websocket-server-2.local`, then `-3`, up to ten attempts. The resolved hostname is logged at startup.

### Discovering services

**macOS:**

```sh
dns-sd -B _airi._tcp
```

**Linux (Avahi):**

```sh
avahi-browse -r _airi._tcp
```

**Windows:**

```sh
dns-sd.exe -B _airi._tcp
```

### Platform caveats

- **Mixed content** — web pages served over HTTPS cannot connect to `ws://<name>.local:6121` due to browser mixed-content rules. Native apps and dev-server HTTP pages are unaffected.
- **Chrome Private Network Access** — Chrome may require a CORS preflight for connections from a public context to a private network address. Use a `wss://` server or run the client from an HTTP origin to avoid this.
- **`.local` resolution** — Windows 10+, macOS, and Linux with Avahi installed resolve `.local` natively. Headless Linux setups may need `nss-mdns` (`libnss-mdns` on Debian/Ubuntu).
- **Re-announce interval** — the server re-announces every 75 s with a record TTL of 120 s, per RFC 6762 §10.

## API

### `createServer(options?)`

Creates a server controller. Options extend `AppOptions` from the package root.

```ts
interface ServerOptions {
  port?: number // default: 6121
  hostname?: string // default: '127.0.0.1'
  tlsConfig?: { cert?: string, key?: string, passphrase?: string } | null
  mdns?: {
    enabled?: boolean // default: false
    serviceName?: string // default: 'airi-websocket-server'
  }
}
```

Returns a `Server` handle:

```ts
interface Server {
  start: () => Promise<void>
  stop: () => Promise<void>
  restart: () => Promise<void>
  updateConfig: (newOptions: ServerOptions) => void
  getConnectionHost: () => string[]
}
```

