/**
 * Resolves the visual fade and the native click-through state for the stage window.
 *
 * The two are independent decisions. Auto Hide (`enabled`) only chooses whether a
 * hovered model fades. Click-through follows the pointer hit test, so the blank area
 * around the model lets clicks reach the application below it.
 */
export function resolveFadeOnHoverInteraction(params: {
  /** Whether the stage window is pinned above other windows. */
  alwaysOnTop: boolean
  cursorInsideWindow: boolean
  /** Whether Auto Hide is on. Drives the fade, never the blank-area click-through. */
  enabled: boolean
  /** Whether the stage paints an opaque layer of its own, such as a scene background. */
  stageHasOpaqueBackground: boolean
  transparentForFade: boolean
  transparentForPointer: boolean
}) {
  const fadeStage = params.enabled
    && params.cursorInsideWindow
    && !params.transparentForFade

  // The pin gates this: an unpinned window that passes a click through sinks behind
  // the app it activates. Auto Hide lifts that, since what it hides must not block
  // the app below either way.
  const transparentPixelsClickThrough = params.enabled || params.alwaysOnTop

  // NOTICE:
  // Fade sampling reads a region, hit-testing reads one pixel, so a faded stage still
  // reports opaque pixels. `fadeStage` must enable click-through itself: invisible
  // content cannot block the app below.
  // Source: `apps/stage-tamagotchi/src/renderer/pages/index.vue` samplers.
  // Removal: when the fade stops covering pixels hit-testing calls opaque.
  // A scene fills the window behind the model, so a painted pixel is not see-through
  // even where the canvas is empty. It cannot veto the fade: fading takes the scene
  // with it, and what is invisible must not block the app below.
  return {
    fadeStage,
    ignoreMouseEvents: fadeStage
      || (!params.stageHasOpaqueBackground && transparentPixelsClickThrough && params.transparentForPointer),
  }
}
