# Stage Tamagotchi Kirie

This project runs the Stage Tamagotchi Vue renderer in a Godot desktop host.
Kirie provides the WebView and IPC transport. Kirie Platform provides general
desktop capabilities. AIRI C# handlers own application services and windows.

## Setup

Install workspace dependencies and check the local Godot environment:

```sh
mise x -- pnpm install
mise x -- pnpm kirie doctor
```

For desktop development, install the pinned Godot CEF backend:

```sh
mise x -- pnpm kirie doctor --fix godot-cef
```

Start a development session:

```sh
mise x -- pnpm dev
```

Build the web application into `src-web/dist`:

```sh
mise x -- pnpm build
```

The main renderer starts with `synced-leader=true`. AIRI creates onboarding,
settings, chat, and notice renderers in separate native Godot windows with
`synced-leader=false`. These windows follow Godot's native multi-window and
close-request behavior. See the
[Godot Window documentation](https://docs.godotengine.org/en/4.7/classes/class_window.html)
and [Viewport subwindow documentation](https://docs.godotengine.org/en/4.7/classes/class_viewport.html#class-viewport-property-gui-embed-subwindows).

Godot CEF uses its per-request signal policy for browser permissions. AIRI
grants microphone requests only from the main renderer's exact origin. It
denies all other permission types and all requests from secondary windows.
The permission transport and host policy are implemented. Acceptance remains
blocked until Godot CEF shows and resolves a real user permission prompt.

AIRI owns desktop account sign-in. It opens the system browser, uses PKCE, and
accepts the callback through a temporary listener bound only to `127.0.0.1`.
The flow follows [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252.html) and does
not depend on the deferred server sidecar. The renderer supplies its build-time
server URL and client ID to the Godot host before each login attempt.

Live2D, VRM, MMD, model assets, model rendering, and model-specific capture are
outside the current migration scope. Spotlight is also deferred.
