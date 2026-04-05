# `@proj-airi/visual-chat-ops`

CLI helpers for AIRI visual chat environment checks, local bridge lifecycle, and remote phone sharing.

## What It Does

- checks whether the local Ollama backend is reachable
- checks whether the fixed MiniCPM-V 4.5 model is installed
- starts the local AIRI gateway and MiniCPM-o worker bridge
- generates desktop and phone entry hints for LAN or remote access
- surfaces secure-context warnings early
- exposes remote HTTPS/WSS phone entry URLs without requiring a separate tunnel binary

## When To Use It

- you want the 16GB-friendly local path with Ollama and MiniCPM-V 4.5
- you want to run AIRI's local realtime gateway and worker bridge from one command
- you need quick diagnostics before opening the Visual Chat settings page
- you want the fixed AIRI pipeline with persisted conversation records and rolling scene memory

## When Not To Use It

- you expect this package to install or run the official MiniCPM-o PyTorch backend for you
- you want llama.cpp-style backends
- you need phone camera access from an insecure `http://` frontend origin

## Main Commands

```bash
pnpm -F @proj-airi/visual-chat-ops doctor:visual-chat
pnpm -F @proj-airi/visual-chat-ops start:local
pnpm dev:tamagotchi
```

## Important Environment Variables

```bash
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_MODEL=openbmb/minicpm-v4.5:latest
AIRI_VISUAL_CHAT_FRONTEND_URL=https://your-airi-web-host.example.com
AIRI_VISUAL_CHAT_START_FRONTEND=auto
VISUAL_CHAT_PORT=6200
WORKER_PORT=6201
```

## Startup Flow

`start:local` now does the following in order:

1. checks the local Ollama backend and fixed model
2. starts or reuses the AIRI worker bridge
3. starts or reuses the AIRI gateway
4. starts the local `apps/stage-web` dev server when no frontend is already reachable
5. prints desktop settings and phone page URLs
6. warns when the frontend/gateway combination will break phone media capture or mixed-content rules

## Tamagotchi Remote Dev

For the Electron desktop route, the default root command now starts:

- `apps/stage-tamagotchi`
- the visual chat gateway
- the visual chat worker
- a remote phone sharing bridge that writes public frontend and gateway URLs into AIRI diagnostics

Use:

```bash
pnpm dev:tamagotchi
```

This command keeps the desktop `Phone entry` field pointed at a phone-reachable URL:

- on the same network, the phone can still use the LAN URL
- on different networks, AIRI upgrades to a public HTTPS/WSS pair automatically

If you only want the local-only dev flow, use:

```bash
pnpm dev:tamagotchi:local
```

## 16GB Path

For a simpler local setup that stays within a 16GB-class GPU budget, use:

```bash
pnpm -F @proj-airi/visual-chat-ops setup-engine
pnpm -F @proj-airi/visual-chat-ops pull-models --model openbmb/minicpm-v4.5:latest
pnpm -F @proj-airi/visual-chat-ops start:local
```

This path keeps:

- continuous desktop and phone camera or screen streaming through the AIRI gateway
- session history, rolling scene memory, and source switching in AIRI
- typed text input and persisted conversation records

## Phone Capture Notes

- Phone camera capture typically requires an HTTPS frontend origin.
- If the phone page is served over HTTPS, the gateway should also be exposed through HTTPS/WSS or a same-origin reverse proxy.
- Desktop camera and screen capture are handled by the AIRI frontend.
- Set `AIRI_VISUAL_CHAT_START_FRONTEND=0` if you want to manage the web frontend separately.
