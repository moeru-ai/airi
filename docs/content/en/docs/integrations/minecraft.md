---
title: Minecraft Agent
description: Run AIRI's local game agent on a trusted Minecraft server
---


The Minecraft integration connects AIRI to a Minecraft server via Mineflayer, letting the agent receive context, perform in-game actions, and report state back. It is aimed at local development and maintenance; the current implementation is planned to migrate to the Fabric runtime, so do not build new long-term features around it.


## Prerequisites


* Dependencies installed at the repository root: **pnpm i**.
* An accessible local or trusted Minecraft server; the connection address and port are provided by environment configuration.
* Usable AIRI and model service configuration.


::: warning Credential Security


API keys, service addresses, and Minecraft server credentials should only be stored in the local **.env.local** file. Do not commit, screenshot, or share these configurations.


:::


## Configuration

~~~bash
cp integrations/minecraft/.env integrations/minecraft/.env.local
~~~


Edit **integrations/minecraft/.env.local** and fill in the configuration required for the Minecraft server, AIRI, and the model service.


## Start

~~~bash
pnpm -F @proj-airi/minecraft-bot dev
~~~


After starting, the agent connects to AIRI and the Minecraft server. In development, you can check the terminal logs to confirm connection and action status.


## Security and Limitations


Do not connect this agent to untrusted public servers. It drives a local Minecraft session and network connection; even if action planning runs in an isolated environment, a malicious server can still cause unexpected behavior.

