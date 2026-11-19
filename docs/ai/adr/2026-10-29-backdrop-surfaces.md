# Backdrop surfaces

Status: accepted

## Context

The desktop app draws native glass behind some elements. #3020 added it for the chat pages, and #3060 reworked the floating chat. The voice inlay uses it too.

The native layer is sound:

- `electronWindowBackdropUpdate` sends a list of `BackdropRegion` values. Each region has a rectangle, a corner radius, an opacity, and clips.
- The main process finds the window from the IPC sender. The renderer never sends a window ID.

The renderer layer, `use-window-backdrop.ts` and `window-backdrop.css`, has these problems:

- `useWindowBackdrop(root, kind)` takes `kind: 'inlay' | 'panel'`. The name comes from the first window that used each mode. The value mixes two things:
  - Which elements get glass. `panel` means the root itself. `inlay` means each descendant with `data-window-backdrop-surface`.
  - Which CSS selector lowers the fill. The composable writes `data-window-backdrop-active="<kind>"` on the root.
- `window-backdrop.css` lowers the fill from outside the component. It sets `--un-bg-opacity` with `!important`:
  - `--un-bg-opacity` is internal to the UnoCSS wind3 preset. The wind4 preset uses `color-mix()`, so the rule stops working without an error.
  - The component cannot see its real fill. `VoicePresence` sets `--un-bg-opacity: 0.95`, but the desktop app draws 0.3 in light mode and 0.45 in dark mode.
  - Chrome DevTools marks the `!important` custom property as overridden by the inline style. The engine applies the `!important` value. So the Styles pane shows a wrong value.
- The rule crosses a package boundary. `VoicePresence` is in stage-ui, but its glass fill is in a stage-tamagotchi stylesheet. The Histoire story copies the values by hand.
- `data-window-backdrop-surface` has two jobs: it marks a region to measure, and it lets the stylesheet change the fill.
- The floating chat needs a special case, `data-window-backdrop-floating-background`, because its fallback is transparent, not opaque.

The `inlay` mode exists because the glass element is inside a shared component. stage-ui cannot import a stage-tamagotchi composable, so the host finds the element with a selector.

## Decision

### A surface is one element

A backdrop surface is one element that the platform can back with native glass. The element's box is the glass area:

- The rectangle and the corner radius come from the element's computed box.
- Ancestor `overflow`, `clip-path`, and `opacity` clip and fade it. The current geometry code already measures these.

The surface has no `kind`, no area option, and no window ID.

### The composable declares the surface

```ts
export function useBackdropSurface(
  element: MaybeRefOrGetter<HTMLElement | null | undefined>,
  options?: { enabled?: MaybeRefOrGetter<boolean> },
): void
```

- The call declares that the element is translucent glass. It returns nothing.
- `element` can change. The surface registers when an element appears and unregisters when it goes. This replaces the descendant search of the `inlay` mode.
- When the platform supports native glass, the host draws it behind the element. Otherwise, nothing happens.
- `enabled` turns the declaration off and on while the element stays mounted.

### The component owns its fill

The backdrop draws only the native blur. It defines no fill, no opacity, and no style.

- Each component paints its own fill with its own classes, as any component does. For example, `VoicePresence` uses `bg-white/80 dark:bg-neutral-900/80`.
- The fill does not change with native glass. A translucent fill that is readable without blur needs no fallback, so the component needs no state.
- No stylesheet changes a component fill from outside. No rule uses `!important` or `--un-bg-opacity`.

### The platform is injected

The native window material is an external boundary. So the implementation is injected:

- stage-ui defines the `BackdropSurfaceHost` interface, its `InjectionKey`, and `useBackdropSurface`.
- Without a host, `useBackdropSurface` does nothing. stage-web and stage-pocket provide no host.
- stage-tamagotchi provides the host at the app root with `createWindowBackdropHost` from `renderer/composables/window-backdrop.ts`. It keeps the `WindowBackdrop` class: one session for each document, which collects the regions of all surfaces and sends them over IPC.
- The Histoire story needs no host. It shows the real fill. A CSS `backdrop-filter` on the card stands in for the native blur.

### Behavior changes

- Each surface shows its own fill on all platforms. Before, native glass lowered the fill to 0.3 or 0.45.
- `VoicePresence` uses a fill between 0.7 and 0.85 opacity. Text stays readable over a busy desktop.
- On a platform without native glass, the floating chat panel shows its own fill. Before, it was transparent.
- The chat page is translucent only on macOS, where the chat window is transparent. On other platforms the window is opaque white, so the page keeps its opaque fill.

### What is removed

- `SurfaceKind`, and the `kind` parameter.
- `data-window-backdrop-surface`, `data-window-backdrop-active`, and `data-window-backdrop-floating-background`.
- `window-backdrop.css`.
- The `--un-bg-opacity` inline style in `VoicePresence`, and the copied CSS in `voice-presence.story.vue`.

The geometry code, the animation tracking, the IPC queue, and the failure latch stay. The `BackdropRegion` contract does not change.

## Migration

1. Add `BackdropSurfaceHost`, its key, and `useBackdropSurface`.
2. Change `WindowBackdrop` to register elements, not roots. Remove the descendant search and the attribute writes.
3. Provide the host in the stage-tamagotchi renderer root.
4. Move each surface to `useBackdropSurface`. Each surface sets its own translucent fill in its own classes:
   - `VoicePresence` registers its card root.
   - `chat-page-shell.vue` registers its root.
   - `chat-floating.vue` registers its panel. It passes `enabled: () => !danmaku.value` and drops its fill in danmaku mode.
5. Remove `window-backdrop.css` and the attributes.
6. Remove the copied CSS from the story.

Steps 2 to 5 land in one change. A partial step leaves a surface with a wrong fill.

## Tests

- `window-backdrop.browser.test.ts`, renamed from `use-window-backdrop.browser.test.ts`, keeps its geometry, animation, queue, and failure cases. Assertions on `data-window-backdrop-active` and on lowered CSS fills are removed. The fill no longer depends on native glass.
- The test for the transparent floating chat fallback is removed, because that fallback no longer exists.
- `voice-inlay.browser.test.ts` asserts `rgba(255, 255, 255, 0.3)` today. It asserts the fill of `VoicePresence` after the change.
- New stage-ui test: without a host, `useBackdropSurface` does nothing. With a host, it registers the element while it is mounted and enabled.

## Open questions

- The package for the interface. It is in stage-ui, because stage-ui holds the current users. Move it to `packages/ui` if primitives use glass later.
