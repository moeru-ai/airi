<script setup lang="ts">
import { BasicButton, dockItemClasses } from '@proj-airi/ui'

/**
 * A round icon button of the Controls Island. The Island draws the only fill, so the button has none at rest.
 *
 * A hover, and a button that is on, show the neutral background of a blurry `Dock` item.
 */
const props = defineProps<{
  /** The size classes of the button. */
  buttonStyle?: string
  /** Shows the background of a button that is on, for example while its menu is open. */
  on?: boolean
}>()
</script>

<template>
  <BasicButton
    type="button"
    size="unset"
    :class="[
      'shrink-0 rounded-full outline-none',
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300',
      dockItemClasses('blurry'),
      props.on ? 'bg-neutral-900/8 dark:bg-white/10' : '',
      props.buttonStyle,
    ]"
  >
    <slot />
  </BasicButton>
</template>
