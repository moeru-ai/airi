<script setup lang="ts">
import type { PrimitiveProps } from 'reka-ui'

import { Primitive } from 'reka-ui'

import { injectSwipeActionsContext } from './context'

withDefaults(defineProps<PrimitiveProps>(), { as: 'div' })
const { open, side, offset, close, toggle, closeContent } = injectSwipeActionsContext()
</script>

<template>
  <Primitive
    :as="as" :as-child="asChild"
    data-swipe-actions-content
    tabindex="-1"
    :style="{ position: 'relative', zIndex: 1, transform: `translate3d(${-offset}px, 0, 0)` }"
    @click.capture="closeContent"
  >
    <slot :side="side" :open="open" :close="close" :toggle="toggle" />
  </Primitive>
</template>
