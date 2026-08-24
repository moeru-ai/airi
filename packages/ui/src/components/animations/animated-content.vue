<script lang="ts">
import type { PrimitiveProps } from 'reka-ui'

import { Primitive } from 'reka-ui'

/**
 * A polymorphic content container animated by an external presence lifecycle.
 *
 * The lifecycle owner must apply `data-state="open"` or `data-state="closed"`
 * to the rendered root and keep it mounted until the closing animation ends.
 */
export interface AnimatedContentProps {
  /**
   * Element or component rendered as the animated outer container.
   *
   * @default 'div'
   */
  as?: PrimitiveProps['as']
}
</script>

<script setup lang="ts">
const props = withDefaults(defineProps<AnimatedContentProps>(), {
  as: 'div',
})
</script>

<template>
  <Primitive
    :as="props.as"
    class="animated-content"
  >
    <div class="animated-content__inner">
      <slot />
    </div>
  </Primitive>
</template>

<style>
/*
 * Motion references and intentional differences:
 *
 * - drawesome's MorphBar measures the active panel's `scrollHeight` or
 *   `scrollWidth`, keeps that measurement current with `ResizeObserver`, and
 *   transitions the resulting numeric container size:
 *   `https://github.com/benjitaylor/drawesome/blob/df6ad3efcf24bb05a37b9fcfe8d4fa021aa8c8cd/packages/draw/src/components/MorphBar.tsx#L33-L77`
 *   `https://github.com/benjitaylor/drawesome/blob/df6ad3efcf24bb05a37b9fcfe8d4fa021aa8c8cd/packages/draw/src/components/MorphBar.module.css#L24-L33`
 *
 * - drawesome also separates the container's shape transition from the
 *   content's opacity/filter/scale transition. In particular, its panel starts
 *   at `blur(8px)` and focuses independently while the container resizes:
 *   `https://github.com/benjitaylor/drawesome/blob/df6ad3efcf24bb05a37b9fcfe8d4fa021aa8c8cd/packages/draw/src/components/MorphBar.module.css#L139-L177`
 *
 * - Video.js v10 uses the same separation for popups: the popup host transitions
 *   opacity/filter/transform/scale, while settings menus add width and height
 *   only when changing between submenu views:
 *   `https://github.com/videojs/v10/blob/35616db5a38d193f1fc114da4af68a79f08093f1/packages/skins/src/default/tailwind/components/popup.ts#L3-L17`
 *   `https://github.com/videojs/v10/blob/35616db5a38d193f1fc114da4af68a79f08093f1/packages/skins/src/default/tailwind/components/menu.ts#L69-L90`
 *   Its generated CSS shows the concrete popup `blur(4px)` and menu-panel
 *   `blur(8px)` values:
 *   `https://github.com/videojs/v10/blob/35616db5a38d193f1fc114da4af68a79f08093f1/packages/skins/src/default/css/components/popup.css#L13-L35`
 *   `https://github.com/videojs/v10/blob/35616db5a38d193f1fc114da4af68a79f08093f1/packages/skins/src/default/css/components/menus.css#L25-L77`
 *
 * This primitive follows those projects by resizing the outer box and focusing
 * an inner content layer separately. It deliberately does not copy drawesome's
 * JavaScript measurement: AIRI's Electron Chromium supports native intrinsic
 * size interpolation, so `interpolate-size: allow-keywords` can animate from
 * `0` to `auto` without layout observers. The feature query keeps opacity and
 * translation as a fallback for other browsers. Browser behavior reference:
 * `https://developer.chrome.com/docs/css-ui/animate-to-height-auto`
 *
 * Presence owners such as Reka keep closing content mounted and expose their
 * lifecycle as `data-state="open|closed"`. Consuming that state avoids a second
 * Vue source of truth and allows the closing keyframes to finish:
 * `https://github.com/unovue/reka-ui/blob/47c433a84ad819eb6becbffc0cc7419e282cf07e/packages/core/src/Menu/MenuContent.vue#L19-L47`
 * `https://github.com/unovue/reka-ui/blob/47c433a84ad819eb6becbffc0cc7419e282cf07e/packages/core/src/Menu/MenuContentImpl.vue#L375-L383`
 *
 * The 220ms/160ms timings, 6px blur, and easing curves are AIRI-specific tuning,
 * not copied constants. Blur stays on the inner wrapper so it cannot blur the
 * caller's border or shadow. `overflow: clip` clips only descendants during the
 * height animation; the root's own box-shadow remains visible from frame one.
 *
 * This primitive may be teleported by its lifecycle owner. The component-owned
 * classes keep the selectors reliable outside the caller's scope.
 */
.animated-content {
  overflow: clip;
}

.animated-content[data-state="open"] {
  animation: animated-content-fade-expand 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

.animated-content[data-state="closed"] {
  animation: animated-content-fade-collapse 160ms ease-in;
}

.animated-content[data-state="open"] .animated-content__inner {
  animation: animated-content-inner-focus-in 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

.animated-content[data-state="closed"] .animated-content__inner {
  animation: animated-content-inner-focus-out 160ms ease-in;
}

@supports (interpolate-size: allow-keywords) {
  .animated-content {
    height: auto;
    interpolate-size: allow-keywords;
  }

  .animated-content[data-state="open"] {
    animation-name: animated-content-size-expand;
  }

  .animated-content[data-state="closed"] {
    animation-name: animated-content-size-collapse;
  }
}

@keyframes animated-content-fade-expand {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes animated-content-fade-collapse {
  from {
    opacity: 1;
    transform: translateY(0);
  }

  to {
    opacity: 0;
    transform: translateY(-4px);
  }
}

@keyframes animated-content-size-expand {
  from {
    height: 0;
    opacity: 0;
    transform: translateY(-4px);
  }

  to {
    height: auto;
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes animated-content-size-collapse {
  from {
    height: auto;
    opacity: 1;
    transform: translateY(0);
  }

  to {
    height: 0;
    opacity: 0;
    transform: translateY(-4px);
  }
}

@keyframes animated-content-inner-focus-in {
  from {
    filter: blur(6px);
  }

  to {
    filter: blur(0);
  }
}

@keyframes animated-content-inner-focus-out {
  from {
    filter: blur(0);
  }

  to {
    filter: blur(6px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .animated-content[data-state],
  .animated-content[data-state] .animated-content__inner {
    animation: none;
  }
}
</style>
