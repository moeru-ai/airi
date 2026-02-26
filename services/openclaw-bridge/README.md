# OpenClaw Bridge

Connects [AIRI](https://github.com/moeru-ai/airi) to the [OpenClaw](https://github.com/openclaw/openclaw) gateway so OpenClaw is the character’s “brain” (LLM + agent) and AIRI handles the body (VRM, voice, Stage).

---

## Quick start (three processes)

You need **three** things running. Start them in this order (each in its own terminal from the AIRI repo root, except the OpenClaw gateway which runs from your OpenClaw install):

### 1. AIRI server (WebSocket for Stage and the bridge)

From the **AIRI repo** root, in one terminal, start the server that serves the Stage WebSocket (default port 6121):

```bash
pnpm dev:server
```

Then start Stage (e.g. in a second terminal):

```bash
pnpm dev:web
```

Stage will connect to `ws://localhost:6121/ws` by default. The bridge must use the same URL (that’s the default).

### 2. OpenClaw gateway

From your **OpenClaw** install, start the gateway on the default port (or note the port you use):

```bash
openclaw gateway --port 18789
```

The bridge defaults to `ws://127.0.0.1:18789`. If your gateway uses a token (`OPENCLAW_GATEWAY_TOKEN` or `--token`), set `OPENCLAW_AUTH_TOKEN` in the bridge to the same value (see [OpenClaw gateway security](#openclaw-gateway-security)).

### 3. OpenClaw bridge (this service)

From the **AIRI repo** root:

```bash
pnpm --filter @proj-airi/openclaw-bridge start
```

No `.env` file is required. Defaults:

- **AIRI server:** `ws://localhost:6121/ws`
- **OpenClaw gateway:** `ws://127.0.0.1:18789`
- **Session key:** `main`

Then open Stage (e.g. `http://localhost:5173`), choose the **OpenClaw** provider, and send a message. The bridge will receive it from the AIRI server, send it to the OpenClaw gateway, and send the reply back to Stage.

---

## Optional config

To override defaults, create a `.env` file in `services/openclaw-bridge/` (or copy from `.env.example`):

```bash
cd services/openclaw-bridge
cp .env.example .env
# Edit .env if needed
```

| Variable | Default | Description |
|----------|---------|-------------|
| `AIRI_URL` | `ws://localhost:6121/ws` | WebSocket URL of the AIRI server. Must match the URL Stage uses. |
| `AIRI_TOKEN` | (none) | Token if the AIRI server requires module auth. |
| `OPENCLAW_GATEWAY_WS_URL` | `ws://127.0.0.1:18789` | WebSocket URL of the OpenClaw gateway. |
| `OPENCLAW_AUTH_TOKEN` | (none) | **Required** if the gateway has auth enabled (`OPENCLAW_GATEWAY_TOKEN` or `--token`). Must match the gateway token. |
| `OPENCLAW_GATEWAY_CLIENT_ID` | `gateway-client` | Gateway protocol client id (allowlist: e.g. `gateway-client`, `openclaw-control-ui`, `test`, `cli`). See [OpenClaw gateway security](#openclaw-gateway-security) below. |
| `OPENCLAW_SESSION_KEY` | `main` | Session key used for chat. |

---

## OpenClaw gateway security

OpenClaw’s gateway is strict about **authentication** and **device identity**:

- **Client id:** The bridge must use a client id from the gateway’s allowlist (e.g. `gateway-client`). Unknown ids are rejected with “invalid connect params”.
- **Token:** If the gateway is started with a token (`OPENCLAW_GATEWAY_TOKEN` or `openclaw gateway --token …`), set `OPENCLAW_AUTH_TOKEN` in the bridge to the same value. Otherwise the gateway closes the connection as unauthorized.
- **Device identity and scopes:** The gateway requires **device identity** for operator clients unless the Control UI bypass is enabled. Without device identity, the gateway accepts the connect but **clears requested scopes**, so `chat.send` then fails with “missing scope: operator.write”.

**Options:**

1. **Local/dev with Control UI bypass (easiest):** (1) In your OpenClaw config (e.g. `.openclaw/openclaw.json`), under `gateway` add `"controlUi": { "dangerouslyDisableDeviceAuth": true }`. Restart the gateway. (2) In the bridge `.env` or `.env.local` set `OPENCLAW_GATEWAY_CLIENT_ID=openclaw-control-ui` and `OPENCLAW_AUTH_TOKEN` to match the gateway token. The bridge will connect as Control UI and keep `operator.write` for `chat.send`.
2. **Production:** Use device identity (pair a device with the gateway and connect with a signed device payload). The bridge does not implement device auth yet; for now use (1) or run the gateway without token for local-only testing (if your OpenClaw build allows it).

---

## How it works

- **Stage** sends `input:text` to the **AIRI server** (no local LLM when OpenClaw is selected).
- The **AIRI server** broadcasts that event to all connected clients, including this **bridge**.
- The **bridge** connects to the **OpenClaw gateway**, sends the message via `chat.send`, waits for the reply, then sends `output:gen-ai:chat:message` and `output:gen-ai:chat:complete` back to the AIRI server.
- **Stage** receives those events and shows the reply (and can drive TTS/VRM).

Stage does **not** talk to the OpenClaw gateway directly; the bridge sits between the AIRI server and the gateway.

---

## Troubleshooting

| Symptom | What to check |
|--------|----------------|
| Bridge won’t start: “.env not found” | You don’t need a `.env` file; the start script now treats it as optional. If you still see errors, run from the AIRI repo root: `pnpm --filter @proj-airi/openclaw-bridge start`. |
| Gateway never receives messages | 1) AIRI server running? 2) Bridge running and showing “AIRI connected” on start? 3) Bridge and Stage using the same `AIRI_URL`? 4) OpenClaw gateway running at the URL in `OPENCLAW_GATEWAY_WS_URL` (default `ws://127.0.0.1:18789`)? |
| Browser: `[OpenClaw] Sending input:text` with `connected: false` | Stage’s WebSocket to the AIRI server isn’t connected yet. Wait for the app to finish loading and ensure the AIRI server is running. |
| Bridge never logs “input:text received” | The bridge isn’t getting events from the AIRI server. Check: (1) Bridge logs “AIRI event received” with `type: "input:text"` when you send from Stage—if you see other types (e.g. `module:authenticated`) but never `input:text`, Stage is either not sending or not connected to the same server. (2) `AIRI_URL` must match the URL Stage uses (see Stage settings or `VITE_AIRI_WS_URL`). (3) If the server runs on a different port (e.g. `PORT=8321`), set `AIRI_URL=ws://localhost:8321/ws` and the same URL in Stage. |
| Bridge logs “OpenClaw gateway connect failed” or “sendAndWaitForReply failed” | **Connect:** Wrong URL/port, invalid client id, or protocol mismatch (bridge uses protocol 3). **Auth:** If the gateway uses a token, set `OPENCLAW_AUTH_TOKEN` to match. **Scopes:** If you see “missing scope: operator.write”, the gateway cleared scopes because the bridge has no device identity—see [OpenClaw gateway security](#openclaw-gateway-security) (use Control UI bypass for dev or implement device auth). |

---

## Scope

- **Stage Web + desktop only** in this integration; streaming, Spark, and other clients (e.g. Discord/Telegram) are out of scope for the initial PR.
- No streaming: the bridge waits for the full assistant reply before sending the output events.
