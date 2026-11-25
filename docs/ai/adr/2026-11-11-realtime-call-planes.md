# Realtime calls use a message plane and a media plane

Status: proposed

## Context

A user wants to call AIRI from a phone that is away from home. The home computer runs the agent and the models.

Today one window owns the full voice pipeline. `Stage.vue` builds the playback, `useVoiceController` reads the local microphone, and other windows reach the voice host through a `BroadcastChannel`. Nothing leaves the device.

The voice input layers ADR left three questions open. Which transport carries events to another device? How does a device detect a lost connection? Does the device keep a local fallback policy?

The constraints:

- The phone is usually on a mobile network. Neither side can accept an inbound connection.
- One structure must serve every case: home Wi-Fi, mobile network, home inference, and later cloud inference.
- The desktop app must stay light. It does not embed a media server.
- The agent must not know where the audio comes from.

## Decision

### Two planes

A call uses two connections. The traffic type selects the plane. The network or the scenario does not.

| Plane | Carries | Transport | Reason |
| --- | --- | --- | --- |
| Media | Continuous audio, later camera and screen video | LiveKit tracks (WebRTC) | Realtime, tolerates loss, needs jitter handling and echo cancellation |
| Message | Device discovery, call control, later captions, chat, and inference requests | Eventa contracts on a WebSocket | Reliable, ordered, no size problem, works without a call |

### Three layers

| Layer | Package | A change adds |
| --- | --- | --- |
| Contract | `@proj-airi/realtime-protocol` | A capability. The server does not change. |
| Carrier | The hosted API route `/ws/v1/realtime` and its client in `stage-ui` | A way to reach the devices of an account |
| Media | `@proj-airi/realtime-transport-livekit` | A track kind |

### The message plane is an account-wide Eventa context

- Each device opens a WebSocket to the hosted API and authenticates with its access token in the first frame.
- After authentication, the server forwards each frame to the other connections of the same user. It does not read the frame.
- The devices of an account therefore share one Eventa context, as windows share the speech bus on one device.
- Every device receives every frame. An invoke for one device has that device id in its event id.
- Presence has no server record. A device sends `deviceDiscover` and collects `deviceAnnounce` answers.
- Both devices must be signed in to the same account.

`server-runtime` does not carry this plane. It has one shared token and no account identity, and the Pocket bridge to it reaches the local network only.

### The host runs the unchanged voice pipeline

The device that owns the agent is the host. The device that the user holds is the endpoint.

- The endpoint publishes its microphone track and plays the track of the host. It renders the avatar and the lip sync from the received audio.
- The host converts the remote track into an `AudioInput` with `mediaStreamSource` and gives it to the `VoiceController`.
- The host routes the speech output of `Stage.vue` into a `MediaStreamAudioDestinationNode` and publishes that track.
- Policy, voice activity detection, transcription, the agent, and speech synthesis run on the host with no change.
- The endpoint runs no voice controller during a remote call.

This answers the open questions of the voice input layers ADR for this phase. No policy runs away from its runtime, so no voice event crosses the network. Migration steps 4 to 6 of that ADR are not a precondition.

### A call is a mode of a chat session

A call has no conversation of its own. The host puts speech into the chat session that is active on the host. Text and images that a user sends during a call use `chat.submit`, as outside a call.

### One endpoint speaks

Only one endpoint is in a call with a host. A host that is in a call answers `busy`. To move a call to another device, the user must press a control on that device. No automatic transfer occurs.

### Connection loss

- The media connection reports `reconnecting`. Each side keeps the call for a limited time and then ends it.
- A side that leaves on purpose sends `callEnded`. A side that loses its connection cannot send it. Each side therefore also ends the call when the other participant leaves the media room.
- The message connection can drop during a call without an effect on the audio. The client reconnects and announces the device again.
- The endpoint keeps no fallback policy. When the host is not reachable, the call ends.

### Media server

The hosted API issues a LiveKit access token for a room that belongs to the user. The LiveKit server is self-hosted. The API reads its URL, key, and secret from the environment, so a managed LiveKit project also works.

## Consequences

- Interruption is decided on the host. Its delay is the network round trip plus the jitter buffer. A later phase adds a local interruption on the endpoint.
- The host hears the endpoint through an Opus track. Speaker recognition and wake words that need unprocessed audio do not apply to a remote call.
- All media passes through the media server, also when both devices are on one local network.
- The relay sends each frame to every device of the account. Bodies must stay small. Large data needs its own contract or an HTTP upload.

## Not in this phase

- Local interruption on the endpoint.
- Captions and expression tokens on the endpoint.
- Text and images from the endpoint during a call.
- Call transfer between endpoints.
- Inference requests to the home computer from a device that runs its own agent.
- Background calls with native audio sessions.
- Video tracks.

## Test plan

- Schema tests for each contract.
- Relay tests on the server: authentication, isolation between users, the frame limit, and delivery across instances.
- Store tests for the host and endpoint call state with a fake media session and an in-memory message context.
- An end-to-end run with two browsers, a local LiveKit server, and the local backend.
- A measurement of the interruption delay. Record the result in this document.
