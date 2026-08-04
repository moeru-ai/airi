---
title: Factorio
description: Connect AIRI to a trusted Factorio server
---


The Factorio integration lets AIRI connect to an external game service using the server address, port, and player name. The AIRI desktop client provides the connection configuration; you still need to prepare an accessible Factorio server and a matching server-side integration yourself.


## Prerequisites


* An accessible Factorio server.
* The server admin has allowed your account and the server-side integration you use to connect.
* The server address, port, and in-game username.


::: warning Only Connect to Trusted Servers


This integration lets AIRI exchange context and operation requests with the game server. Do not use it on untrusted public servers, and do not expose server addresses, tokens, or account information in public chat, screenshots, or issues.


:::


## Configure in AIRI


1. Open **Settings → Modules → Factorio**.
2. Enable the Factorio integration.
3. Fill in the server address, port, and your in-game username; the default port is `34197`.
4. Click **Save**. The page showing "Configured" only means the three fields are filled in; whether you can actually connect still depends on the server and the server-side integration.


## Troubleshooting


* Check whether the server address and port are reachable from the device running AIRI.
* Confirm the firewall, VPN, and server whitelist do not block the connection.
* Confirm the username matches the player name on the server.
* If the configuration is saved but interaction still does not work, check the server-side integration logs; the AIRI desktop client does not ship with a directly deployable Factorio bot service.

