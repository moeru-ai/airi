/**
 * Resolves the visual and native input behavior for Auto Hide outside interactive controls.
 * A faded stage must ignore mouse events so its invisible pixels cannot block the app below.
 */
export function resolveFadeOnHoverInteraction(params: {
  cursorInsideWindow: boolean
  enabled: boolean
  transparentForFade: boolean
  transparentForPointer: boolean
}) {
  const fadeStage = params.enabled
    && params.cursorInsideWindow
    && !params.transparentForFade

  // NOTICE:
  // Fade detection deliberately uses a sampled region to avoid flickering around model edges,
  // while native pointer hit-testing uses the exact pixel to keep visible model pixels interactive.
  // Once the whole stage fades, that exact pixel can still report the now-invisible model as opaque,
  // so the fade decision must also enable click-through. This preserves the Auto Hide contract that
  // invisible stage content cannot block the application below it.
  // Source/context: `apps/stage-tamagotchi/src/renderer/pages/index.vue` transparency samplers.
  // Removal condition: the visual fade no longer covers pixels considered interactive by hit-testing.
  return {
    fadeStage,
    ignoreMouseEvents: params.enabled
      && (fadeStage || params.transparentForPointer),
  }
}
