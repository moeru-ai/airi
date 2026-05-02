# Visual Chat Quickstart

## What You Get

A fully local realtime visual chat pipeline in AIRI:

- **Video input**: desktop camera, desktop screen capture, or phone camera
- **Text input**: typed messages from desktop or phone
- **Response output**: shared realtime conversation stream
- **Session state**: rolling scene memory, persisted conversation records, session continuity

## Fixed Pipeline

| Component | Value |
|-----------|-------|
| Backend | Ollama |
| Model | `openbmb/minicpm-v4.5:latest` |
| Interaction mode | `vision-text-realtime` |
| Context window | Last 6 dialogue turns + 800-char rolling scene memory |
| Target hardware | 16 GB VRAM (GPU) or 16 GB RAM (CPU-only, slower) |

## Prerequisites

- Node.js >= 18
- pnpm >= 10

Ollama is installed automatically by the setup pipeline if not already present.

## Setup Paths

### Path A: Desktop App (Recommended)

```bash
pnpm dev:tamagotchi
```

This single command:

1. Builds and starts the Electron desktop app (`stage-tamagotchi`)
2. Starts the gateway (`:6200`) and worker (`:6201`) services
3. Detects/installs Ollama and pulls the model on first run
4. Generates public HTTPS/WSS phone entry URLs via Cloudflare quick tunnel
5. Clears stale processes and endpoint files from previous runs

Open `Settings -> Modules -> Visual Chat` in the desktop app. The **Setup Checklist** shows the status of each component. Click **Run Setup** if any step is not ready.

For LAN-only (no public tunnel):

```bash
pnpm dev:tamagotchi:local
```

### Path B: CLI Manual Setup

#### 1. Check Environment

```bash
pnpm -F @proj-airi/visual-chat-ops doctor:visual-chat
```

#### 2. Install Ollama + Pull Model

```bash
pnpm -F @proj-airi/visual-chat-ops setup-engine
pnpm -F @proj-airi/visual-chat-ops pull-models --model openbmb/minicpm-v4.5:latest
```

#### 3. Configure Environment

Copy `.env.example` in `services/visual-chat-gateway/` and `services/visual-chat-worker-minicpmo/` to `.env`.

Key variables:

```bash
OLLAMA_HOST=http://127.0.0.1:11434
```

`OLLAMA_MODEL` is intentionally fixed to `openbmb/minicpm-v4.5:latest` in the current shipped worker path.

`LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` are only needed if you are explicitly using the room/token/webhook integration surfaces. The core desktop + phone visual chat flow runs through the AIRI gateway session websocket and fixed Ollama worker path.

#### 4. Start Services

```bash
pnpm -F @proj-airi/visual-chat-ops start:local
```

This starts Ollama, the gateway, and the worker, then prints URLs.

## Phone Access

Three ways to connect a phone:

1. **Same WiFi (LAN)**: The desktop page shows a LAN IP under *Phone entry*. Works if both devices are on the same network. Phone camera access may still require HTTPS depending on the browser.
2. **Cloudflare Quick Tunnel**: `pnpm dev:tamagotchi` auto-creates a `*.trycloudflare.com` HTTPS URL. No registration needed. URL changes on restart.
3. **Fixed host override**: In the *Session* section, set a fixed IP/hostname under *Fixed host override* to lock the phone URL across restarts.

## Platform Support

| OS | GPU | CPU-only | Notes |
|----|-----|----------|-------|
| Windows 10/11 | NVIDIA (CUDA), AMD (ROCm) | Yes | Ollama handles GPU detection |
| macOS (Apple Silicon) | Metal | Yes | Native Ollama support |
| macOS (Intel) | - | Yes | CPU inference only |
| Linux | NVIDIA (CUDA), AMD (ROCm) | Yes | Ollama handles GPU detection |

GPU is recommended for acceptable response latency. CPU-only works but inference is significantly slower.

## UI Sections

All sections in the desktop and phone UIs are collapsible:

| Section | Description |
|---------|-------------|
| Setup Checklist | Pre-flight checks for gateway, model, session, input source |
| Desktop Setup | Electron auto-setup pipeline status and controls |
| Session | Create/join/leave sessions, phone entry URL, participant info |
| Saved Conversations | Persisted conversation records with restore and per-record delete |
| Input Mode | Camera/screen/phone source selection with device pickers |
| Rolling Scene Memory | Hidden memory updated by continuous observation |
| Context State | Live history window (last 6 turns) + session record metadata |

## Context Management

The context sent to the model for each inference:

- **System prompt**: role + visual source hint + scene memory (~4 lines)
- **Rolling scene memory**: up to 800 characters of factual scene notes
- **Dialogue history**: last 6 user/assistant turns
- **Current frame**: the newest video frame as a base64 image

Memory timeline keeps up to 4 snapshots. Scene memory is deduplicated so unchanged observations are not re-inserted.

## Connection Stability

The WebSocket connection between the UI and gateway uses exponential backoff reconnection (1s, 2s, 4s, ... up to 30s). On reconnect, the client re-subscribes to the active session and re-hydrates message history. A "Reconnecting..." indicator appears in both desktop and phone UIs during reconnection.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sessions` | Create new session |
| GET | `/api/sessions` | List sessions |
| GET | `/api/sessions/:id` | Get session details |
| GET | `/api/sessions/:id/messages` | Get session messages |
| DELETE | `/api/sessions/:id` | End session |
| DELETE | `/api/sessions/:id/record` | Delete persisted conversation record |
| POST | `/api/sessions/:id/switch-source` | Switch active source |
| GET | `/api/session-records` | List persisted conversation records |
| POST | `/api/session-records/:id/restore` | Restore a persisted conversation |
| GET | `/api/worker/health` | Worker bridge health check |
| POST | `/api/worker/infer-stream` | Streaming worker proxy |
| GET | `/health` | Gateway health check |
| GET | `/api/diagnostics` | System diagnostics |
| WS | `/ws` | Realtime session control/state |

## Runtime Notes

- Phone camera access requires HTTPS or a secure webview.
- The current shipped input path is camera/screen frames plus typed text prompts. Raw browser microphone audio is not streamed into the worker.
- Continuous Observation updates the hidden rolling scene memory without filling the visible conversation.
- Screen capture becomes the active inference source when desktop screen mode is selected.
- Persisted conversations can be restored and continued, not just viewed.
- Admin endpoints such as diagnostics, session record management, and worker proxy routes require a local gateway access token. Shared phone entry URLs carry session-scoped access only.
