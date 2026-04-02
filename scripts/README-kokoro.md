# Kokoro Operations

This repo includes helper scripts to manage the remote Kokoro TTS service running on `atom`.

## Remote Setup

- Host alias: `atom`
- Remote project dir: `/home/ben/AI_PROJECTS/Kokoro-FastAPI`
- Container name: `kokoro-tts`
- Image name: `kokoro-fastapi-gpu-local`
- API base URL: `http://192.168.50.136:8880/v1`

## Local Commands

Run these from `/Users/ben/AI_Project/airi`:

```bash
pnpm kokoro:start
pnpm kokoro:restart
pnpm kokoro:stop
pnpm kokoro:status
pnpm kokoro:logs
pnpm kokoro:rebuild
pnpm kokoro:update
```

## What Each Command Does

- `pnpm kokoro:start`: start the existing remote container, or create it from the built image if needed
- `pnpm kokoro:restart`: restart the remote container
- `pnpm kokoro:stop`: stop the remote container
- `pnpm kokoro:status`: show the remote container status
- `pnpm kokoro:logs`: show recent remote container logs
- `pnpm kokoro:rebuild`: rebuild the GPU image from `/home/ben/AI_PROJECTS/Kokoro-FastAPI` and restart the container
- `pnpm kokoro:update`: `git pull --ff-only`, then rebuild and restart

## Remote Shell Scripts

If you are SSH'ed into `atom`, you can also run:

```bash
cd /home/ben/AI_PROJECTS/Kokoro-FastAPI
./start.sh
./stop.sh
./rebuild.sh
./logs.sh
```

## AIRI Speech Provider Settings

- Provider: OpenAI-compatible
- Base URL: `http://192.168.50.136:8880/v1`
- API key: any non-empty string, for example `not-needed`
- Model: `kokoro`
- Voice example: `zf_xiaoyi`
