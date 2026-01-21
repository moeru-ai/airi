# Minecraft Hub (Protocol Relay)

Relay service that accepts Minecraft clients (bot + viewer) and proxies them to a target Minecraft server. The hub owns a single upstream authenticated session, and both clients are downstream-only.

## Usage

```bash
pnpm -F @proj-airi/minecraft-hub dev
```

## Environment Variables

Core:
- `HUB_VERSION` (default: `1.20`)
- `HUB_MOTD` (default: `AIRI Minecraft Hub`)

Viewer listener (debug client):
- `HUB_VIEWER_LISTEN_HOST` (default: `0.0.0.0`)
- `HUB_VIEWER_LISTEN_PORT` (default: `25566`)
- `HUB_VIEWER_ONLINE_MODE` (default: `true`)
- `HUB_VIEWER_USERNAME` (optional, defaults to `HUB_UPSTREAM_USERNAME`)

Bot listener (mineflayer):
- `HUB_BOT_LISTEN_HOST` (default: `0.0.0.0`)
- `HUB_BOT_LISTEN_PORT` (default: `25567`)
- `HUB_BOT_ONLINE_MODE` (default: `false`)
- `HUB_BOT_USERNAME` (default: `airi-bot-mineflayer`)

Target server (real Minecraft server):
- `HUB_UPSTREAM_HOST` (default: `localhost`)
- `HUB_UPSTREAM_PORT` (default: `25565`)
- `HUB_UPSTREAM_AUTH` (default: `offline`) — `offline` | `mojang` | `microsoft`
- `HUB_UPSTREAM_USERNAME` (default: `airi-bot`)
- `HUB_REWRITE_IDENTITY` (default: `false`) — when enabled, rewrites player identity packets for downstream clients
- `HUB_DEBUG_PACKETS` (default: `false`) — log raw/decoded packet flow for debugging
- `HUB_DUMP_PACKETS` (default: `false`) — write raw packet hex dumps to disk
- `HUB_DUMP_DIR` (default: `./packet-dumps`) — dump directory

Mirroring / input filters:
- `HUB_MIRROR_MOVEMENT` (default: `true`)
- `HUB_MIRROR_ACTIONS` (default: `false`)

## Notes

- The hub connects to the target server once and broadcasts server packets to both downstream clients.
- The viewer is input-blocked and acts as a debug view while the bot controls the upstream session.
- The hub rewrites UUIDs in key packets (player info/spawn) so downstream clients can keep their own local identities while the hub owns the upstream account.
