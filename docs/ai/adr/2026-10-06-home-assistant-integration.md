# Home Assistant connection

Status: accepted

## Context

Issue #1491 asks AIRI to read and control Home Assistant. A user wants to say
"turn off the living room light" and have AIRI do it.

`plugins/airi-plugin-homeassistant` was a scaffold. Commit `4401b96c9`
(2025-12-29) added a `package.json`, a `tsconfig.json`, a tsdown config, and a
single `src/index.ts` that held `console.warn('WIP')`. The scaffold depended on
`@proj-airi/server-sdk`, which suggests a channel plugin was the starting idea.
`plugins/airi-plugin-bilibili-laplace` arrived the same day in the same shape.
Nothing imported the package, and this work removes it, because the integration
lives in the application instead of in a process of its own.

## Decision

Home Assistant is a first-class service of the Stage Tamagotchi Electron main
process, behind typed tools that the renderer mounts for the model.

| Concern | Location |
| --- | --- |
| Address, token, and every outbound request | `apps/stage-tamagotchi/src/main/services/airi/home-assistant/` |
| IPC contract | `apps/stage-tamagotchi/src/shared/eventa/home-assistant.ts` |
| Home Assistant API client and its validation | `packages/stage-ui/src/libs/home-assistant/client.ts` |
| Tool definitions | `packages/stage-ui/src/tools/home-assistant.ts` |
| Tool mounting and the settings page | `apps/stage-tamagotchi/src/renderer/` |

The mechanism follows `computer-use` and `mcp-servers`, which are the two
existing main-process services that hand tools to the model.

### Why not a channel plugin

A channel plugin answers a tool call before the plugin starts any work.
`builtIn_emitSparkCommand` reaches a module through a typed envelope whose action
is untyped text, and it returns `spark:command sent (id) to ...` as soon as the
socket accepts the event. The model therefore cannot read the result of a Home
Assistant call, and the tool result claims a success that nobody verified.

The protocol carries an ack shape, `spark:emit` with the command `eventId`, and
`handleSparkEmit` in
`packages/stage-ui/src/stores/character/orchestrator/store.ts` is an empty
function. A result can only arrive later, through `context:update` or
`spark:notify`, which is a different turn.

A channel plugin also asks the user to start a process by hand, and the channel
server stores no configuration, so the plugin must persist its own settings and
the settings page can only push a live update.

### Why not an extension

`@proj-airi/plugin-sdk` gives a typed tool with a real return value, so it meets
the same requirement. Three facts decide against it here.

- No extension can receive configuration. `ExtensionSetupContext` carries only
  `extension`, `subscriptions`, `kits`, and `modules`, and the manifest parser
  rejects unknown fields, so a base URL and a token have no path in.
- Extension code runs in the Electron main process with no sandbox and no
  process boundary, and the main process has no `uncaughtException` handler. A
  throw after `setup` can end the application.
- `packages/plugin-sdk/src/index.ts` states that the API can change without
  warning, and no example extension registers a tool. The path is unproven.

### Why not the MCP tool chain

The model already has typed `builtIn_mcpListTools` and `builtIn_mcpCallTool`
tools, and the main process runs stdio MCP servers from `mcp.json`. Home
Assistant ships an MCP server of its own, so a user can wire one up today with no
code from this repository.

That path stays available and this record does not replace it. It needs a remote
transport, because Home Assistant serves MCP over HTTP, and it hands entity
resolution to the model. This integration exists to give the model a real
Home Assistant tool, and to resolve "the living room light" in the plugin rather
than in a prompt.

## What the model calls

Three typed tools arrive in the model's tool list, and the model reads each
result in the same turn:

| Tool | Arguments | Result |
| --- | --- | --- |
| `home_assistant_list_entities` | `domain` | Entities and their states, capped |
| `home_assistant_get_state` | `entity_id` | State and attributes |
| `home_assistant_call_service` | `domain`, `service`, `entity_id`, `data` | The states Home Assistant changed |

`data` is a JSON object string. The same constraint appears beside
`builtIn_mcpCallTool`: `z.record()` emits `propertyNames`, which OpenAI rejects.

The tools mount only while an address and a token are stored. An unconfigured
integration stays invisible to the model, because every call would fail.

## Configuration and credentials

The main process owns the address and the token, in
`home-assistant-v1.json` under the Electron user data directory. The renderer
reads back the address and whether a token exists, and never the token.

An empty token field in the settings page keeps the stored token, so a user can
correct the address without pasting the secret again.

The token is stored in plain text. Every other settings file in this repository
stores its secrets the same way, and no code here uses Electron `safeStorage`.
The settings page states that the token stays on the device.

## The request boundary

The renderer sends a path, and the main process applies the address and the
token. That makes the request handler the only place that decides where a
request lands, so it accepts three shapes and nothing else:

| Method | Path |
| --- | --- |
| `GET` | `/api/states` |
| `GET` | `/api/states/{domain}.{object_id}` |
| `POST` | `/api/services/{domain}/{service}` |

Two shapes outside that list matter. `POST /api/template` runs arbitrary Jinja on
the Home Assistant host, and `POST /api/states/{id}` writes a state. Measurement
determined that the stored token reached both. The client builds neither shape.

Every segment the client builds matches `[a-z0-9_.]`, so the patterns also reject
a percent escape, a `..` segment, a doubled slash, and whitespace. After the URL
is built, the resolved `pathname` must still sit under the base path, because a
reverse proxy can serve Home Assistant under a subpath.

A second rule covers the address. A token belongs to one Home Assistant
instance, so no update can move the address while the stored token stays behind.
Without that rule, a renderer moves the address to a server it controls and the
next request sends the token there.

## Platform scope

Stage Tamagotchi. Stage Web waits.

A browser page cannot reach a Home Assistant instance on `http://192.168.x.x`
without `cors_allowed_origins` on the Home Assistant side, and a page served over
https is blocked by mixed content. Stage Pocket waits for an iOS device to test
on.

The client already takes a transport, so another platform adds a transport rather
than a second client.

## Alternatives this record leaves open

- A channel plugin for Stage Web. It shares the same client, and it returns no
  result to the model.
- An extension, once the plugin SDK carries configuration and has a working
  example.
- The MCP route, which needs no code here at all.

## Non-goals

- No entity allowlist and no per-entity permission model in the first phase.
- No Stage Web work.
- No channel plugin. The scaffold under `plugins/` is gone, and a later Stage Web
  change adds a package back if it needs one.
- No event subscription. The first phase reads and writes on request. A device
  that changes state on its own is a later feature.

## Open questions

- Does the tool set need `requiresExplicitSelection` for `call_service`, the way
  `computer_use` has it? The shared composer sends no `tools` field, so the gate
  only works in the Tamagotchi renderer.
- Does an entity alias map belong in the settings page, so "the living room
  light" resolves without the model reading the entity list?
- Does the token move to Electron `safeStorage`?
- Does the Home Assistant set of tools grow to areas and scenes?
