---
title: Factorio
description: Connect AIRI to a trusted Factorio server
---

The Factorio integration lets AIRI connect to an external game service using the server address, port, and player name. AIRI Desktop provides the connection settings, but you must supply a reachable Factorio server and a compatible server-side integration.

## Prerequisites

- A reachable Factorio server.
- Permission from the server administrator for your account and server-side integration to connect.
- The server address, port, and your in-game username.

::: warning Connect only to trusted servers
This integration exchanges context and action requests with the game server. Do not use it with an untrusted public server, and do not expose server addresses, tokens, or account information in public chats, screenshots, or issues.
:::

## Configure in AIRI

1. Open **Settings → Modules → Factorio**.
2. Enable **Factorio Integration**.
3. Enter the server address, port, and your in-game username. The default port is `34197`.
4. Click **Save**. A **configured** status only means that all three fields have values; an actual connection still depends on the server and its server-side integration.

## Troubleshooting

- Check that the device running AIRI can reach the server address and port.
- Confirm that no firewall, VPN, or server allowlist blocks the connection.
- Confirm that the username matches the player name on the server.
- If the settings are saved but AIRI still cannot interact, inspect the server-side integration logs. AIRI Desktop does not include a ready-to-deploy Factorio bot service.
