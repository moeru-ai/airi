<h1 align="center">アイリ VTuber</h1>

<p align="center">
  [<a href="https://airi.ayaka.io">Try it</a>]
</p>

> Heavily inspired by [Neuro-sama](https://www.youtube.com/@Neurosama)

## Local Hearing

Stage Pocket exposes Sherpaw models through the shared Vite plugin. The models load from pinned remote URLs when selected.
Chinese and English start with Paraformer. Other languages use an available model that supports them.

Foreground hearing uses the shared Stage controller for continuous input and character calling words.
Pocket owns Capacitor visibility transitions and releases the WebView microphone when the app leaves the foreground.
Each speech segment keeps the session captured at its start. Pending recognition cannot redirect text after a character switch.

## WebSocket Bridge

Stage Pocket adds a host-backed WebSocket bridge for `@proj-airi/server-sdk`.

Design constraints:
- keep page loading on secure origins (`https` or app-hosted local origins) to preserve secure-context web APIs
- only implement the WebSocket bridge needed by `@proj-airi/server-sdk`
- native owns socket I/O; `server-sdk` owns reconnect, heartbeat, authentication, and connection state
- the bridge only forwards `connect`, `send`, `close`, `open`, `message`, `error`, and `close`
