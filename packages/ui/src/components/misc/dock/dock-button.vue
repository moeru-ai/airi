<script setup lang="ts">
import type { TooltipContentProps } from 'reka-ui'

import { computed } from 'vue'

import BasicButton from '../basic-button.vue'
import Tooltip from '../tooltip.vue'

import { dockItemClasses } from './classes'
import { injectDockContext } from './context'

/**
 * A round icon button of a `Dock`. Its `label` names it and shows as its tooltip.
 *
 * A toggle passes `pressed`. Only the icon of a toggle that is on takes the theme color. A hover shows the same neutral
 * background on every button and keeps the icon color, so a toggle that is off never looks on.
 */
// The root is the tooltip, which renders no element, so attributes such as `class` and listeners go to the button.
// The trigger of a menu can therefore wrap the button.
defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  label: string
  /** The icon class. The default slot replaces the icon. */
  icon?: string
  /** The icon of a toggle that is on. @default the `icon` */
  pressedIcon?: string
  /** The state of a toggle. Leave it unset for a plain action, which has no `aria-pressed`. */
  pressed?: boolean
  /**
   * Shows the label as a tooltip. Turn it off while a menu of the button covers the place of the tooltip.
   * @default true
   */
  tooltip?: boolean
  /** The side of the tooltip. @default the side that the dock gives, or `'bottom'` outside a dock */
  tooltipSide?: TooltipContentProps['side']
  /** @default false */
  disabled?: boolean
  /**
   * Replaces the icon with a spinner and blocks the button.
   * @default false
   */
  loading?: boolean
}>(), {
  icon: undefined,
  pressedIcon: undefined,
  pressed: undefined,
  tooltip: true,
  tooltipSide: undefined,
  disabled: false,
  loading: false,
})

// A button outside a dock uses the defaults of the dock.
const dock = injectDockContext(null)
const size = computed(() => dock?.size.value ?? 'sm')
const variant = computed(() => dock?.variant.value ?? 'default')
const icon = computed(() => props.pressed && props.pressedIcon ? props.pressedIcon : props.icon)
</script>

<template>
  <Tooltip
    v-bind="$attrs"
    :label="props.label"
    :side="props.tooltipSide ?? dock?.tooltipSide.value ?? 'bottom'"
    :variant="variant"
    :opacity="dock?.opacity.value"
    :blur="dock?.blur.value"
    :disabled="!props.tooltip"
  >
    <BasicButton
      type="button"
      size="unset"
      :aria-label="props.label"
      :aria-pressed="props.pressed"
      :disabled="props.disabled"
      :loading="props.loading"
      :class="[
        size === 'md' ? 'size-9' : 'size-7',
        'shrink-0 rounded-full outline-none',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300',
        dockItemClasses(variant, props.pressed),
      ]"
    >
      <slot>
        <span v-if="!props.loading && icon" :class="[icon, size === 'md' ? 'size-5' : 'size-4']" />
      </slot>
    </BasicButton>
  </Tooltip>
</template>
