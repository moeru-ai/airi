# `@proj-airi/discord-companion`

A fresh Discord companion service that lets アイリ listen to a Discord voice
channel and chat with members both through the voice channel's attached text
chat and any additional text channels you configure.

This package is a clean rewrite that lives alongside
[`services/discord-bot`](../discord-bot). The legacy service is kept for
reference only — past refactors of that codebase turned out to be hard to
unwind, so we opted for a new, smaller, functional codebase here.

## What it does

- Joins a Discord voice channel (`/companion-join`) and receives per-user audio.
- Decodes Opus → 16-bit PCM → WAV and sends each speech segment to an
  OpenAI-compatible STT endpoint (e.g. the bundled `services/stt-faster-whisper`).
- Forwards the transcription to AIRI as `input:text:voice` and `input:text`
  events.
- Forwards incoming Discord text messages (voice-attached chat, configured
  channels, or DMs) to AIRI as `input:text` events.
- Sends AIRI's `output:gen-ai:chat:message` responses back to the originating
  Discord channel, chunked for Discord's 2000-character limit.
- Supports remote configuration via AIRI's `module:configure` protocol event
  (module name: `discord-companion`).

## When to use

- You want a minimal, easy-to-reason-about Discord integration and you don't
  need the legacy `services/discord-bot` behaviour.
- You want the companion to live in the same AIRI server channel as other
  modules without clashing with the existing `discord` module registration.

## When **not** to use

- You need features (custom memory, Eliza-style pipelines, etc.) that currently
  only exist in `services/discord-bot`.

## Configuration

Create a `.env.local` next to `.env`:

```shell
cd services/discord-companion
cp .env .env.local
```

Environment variables:

| Variable | Description |
| --- | --- |
| `DISCORD_COMPANION_TOKEN` | Bot token. Falls back to `DISCORD_TOKEN`. |
| `DISCORD_COMPANION_CLIENT_ID` | Application client id. Optional; derived from the bot user when missing. |
| `AIRI_URL` | AIRI server WebSocket URL (default `ws://localhost:6121/ws`). |
| `AIRI_TOKEN` | AIRI channel auth token. |
| `DISCORD_COMPANION_TEXT_CHANNEL_IDS` | Comma-separated extra text channel IDs to listen on. |
| `DISCORD_COMPANION_TEXT_MENTION_ONLY` | `true` (default) forwards only mentions/DMs in listened channels. |
| `DISCORD_COMPANION_AUTO_JOIN` | `guildId:channelId` to auto-join a voice channel on ready. |
| `OPENAI_STT_API_BASE_URL` | OpenAI-compatible transcription base URL. |
| `OPENAI_STT_API_KEY` | API key (any non-empty value for local servers). |
| `OPENAI_STT_MODEL` | Transcription model, e.g. `whisper-1`. |

### Discord portal setup

Enable the following **Privileged Gateway Intents** in the Discord developer
portal:

- Server Members Intent
- Message Content Intent

The bot also needs the `Connect`, `Speak`, `View Channel`, and
`Read Message History` permissions on the relevant guild.

## Running

```shell
pnpm -F @proj-airi/discord-companion start
```

Slash commands:

- `/companion-ping` — health check.
- `/companion-join` — join the voice channel you are currently in.
- `/companion-leave` — leave the current voice channel in this guild.

## Testing

```shell
pnpm -F @proj-airi/discord-companion test
pnpm -F @proj-airi/discord-companion typecheck
```

Tests cover the pure helpers (config parsing, text chunking, WAV header, voice
segmenter, Discord metadata normalization, text-bridge routing).
