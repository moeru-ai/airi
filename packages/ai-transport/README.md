# AI HTTP transport

This package carries Fetch requests across a trusted application boundary. It has no Electron, Vue, or provider dependency.

## Use

Run `pnpm -F @proj-airi/ai-transport build` before starting a consumer. Runtime exports use compiled JavaScript in `dist`.

Create one `RequestSession` per caller. Inject the host's HTTP implementation into its constructor.
Expose its `start`, `read`, and `cancel` methods through the host's authenticated RPC boundary.
Pass those methods to `createTransportFetch` in the client.

```ts
const host = new RequestSession(nativeFetch)
const fetch = createTransportFetch(host)
const response = await fetch('http://localhost:8000/v1/models')
const models = await response.json()
await host.dispose()
```

The example runs both sides together. Electron binds the methods through Eventa and owns window authorization outside this package.

## Behavior

- Response headers arrive before body reads. Each consumer read requests one binary chunk.
- Request serialization preserves JSON, text, URL-encoded forms, Blob, ArrayBuffer, and multipart boundaries.
- Uploads are buffered without a proxy size limit. Streaming uploads are not supported. Available memory and upstream limits still apply.
- Cancel, abort, EOF, network errors, and disposal release requests. Unused requests expire after 120 seconds.
- HTTP errors retain their status and body. The transport never retries a request.
- Only HTTP and HTTPS reach the host. The client reads `data:` and `blob:` resources in its own environment.
- Browser Cookie, Origin, and Referer headers are removed. Cross-origin redirects retain only Accept and Content-Type headers.
- The host must dispose its session when its caller navigates, closes, or disconnects.

## When to use it

Use this package for AI HTTP requests that need the desktop application's network stack.
Keep provider request and response conversion outside the transport.

## When not to use it

Do not use this package for WebSocket, browser inference, cloud configuration synchronization, or a public HTTP proxy.
It does not repair authentication, rate limits, invalid certificates, or unreachable services.

## Checks

Run `pnpm -F @proj-airi/ai-transport typecheck` and `pnpm -F @proj-airi/ai-transport test:run`.
The Electron integration fixture is in `apps/stage-tamagotchi/scripts/ai-transport-smoke.ts`.
