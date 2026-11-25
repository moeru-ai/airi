# @proj-airi/realtime-protocol

Eventa contracts that the devices of one account exchange for realtime calls. The package has schemas and event definitions only. It has no transport, UI, or audio code.

## What it does

- `deviceDiscover`, `deviceAnnounce`, `deviceLeave`: the devices of an account find each other.
- `callInvite(hostDeviceId)`, `callEnded`: one device asks a host to join a call, and either side ends the call.
- Each contract has a Valibot schema and a `parse*` function for the receiver.

## How it fits

A call uses two planes. See [the ADR](../../docs/ai/adr/2026-11-11-realtime-call-planes.md).

| Plane | Carries | Implementation |
| --- | --- | --- |
| Message | The contracts of this package | An Eventa context on a WebSocket to the hosted API, which forwards each frame to the other devices of the account |
| Media | Audio tracks | `@proj-airi/realtime-transport-livekit` |

The relay forwards frames and does not read them. To add a capability, add a contract here. The server does not change.

## Use it

```ts
import { defineInvoke } from '@moeru/eventa'
import { callInvite, deviceAnnounce, deviceDiscover, parseDevice } from '@proj-airi/realtime-protocol'

context.on(deviceAnnounce, event => hosts.set(event.body.deviceId, parseDevice(event.body)))
await context.emit(deviceDiscover, { from: deviceId })

const answer = await defineInvoke(context, callInvite(host.deviceId))({ callId, from: deviceId })
```

## Rules for a new contract

- Start the event id with `proj-airi:realtime:`.
- Every device of the account receives every frame. If only one device must answer an invoke, put its device id in the event id, as `callInvite` does.
- Parse every received body. Another app version can send a different shape.
- Keep bodies small JSON. Send audio and video on the media plane.

## Do not use it for

- Events between windows of one device. Use the speech bus in `@proj-airi/stage-ui`.
- Events between a plugin and the stage. Use `@proj-airi/plugin-protocol`.
- Chat message sync. Use `@proj-airi/server-sdk-shared`.
