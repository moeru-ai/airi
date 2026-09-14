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

The main renderer starts with `synced-leader=true`. AIRI creates the onboarding
renderer in a separate native Godot window with `synced-leader=false`. The
window follows Godot's native multi-window and close-request behavior. See the
[Godot Window documentation](https://docs.godotengine.org/en/4.7/classes/class_window.html)
and [Viewport subwindow documentation](https://docs.godotengine.org/en/4.7/classes/class_viewport.html#class-viewport-property-gui-embed-subwindows).

Live2D, VRM, MMD, model assets, model rendering, and model-specific capture are
Spotlight is also deferred and outside the current migration scope.
