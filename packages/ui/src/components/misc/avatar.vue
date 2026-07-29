<script setup lang="ts">
import type { ImgHTMLAttributes } from 'vue'

import { AvatarFallback, AvatarImage, AvatarRoot } from 'reka-ui'

interface AvatarProps {
  /** Image URL. Missing or failed images render the fallback slot. */
  src?: string | null
  /** Accessible description for both the image and fallback. */
  alt?: string
  /** Referrer policy forwarded to the underlying image request. */
  referrerPolicy?: ImgHTMLAttributes['referrerpolicy']
  /** Cross-origin mode forwarded to the underlying image request. */
  crossOrigin?: ImgHTMLAttributes['crossorigin']
}

const props = withDefaults(defineProps<AvatarProps>(), {
  src: null,
  alt: '',
})
</script>

<template>
  <AvatarRoot
    :key="props.src ?? ''"
    :class="['overflow-hidden']"
  >
    <AvatarImage
      v-if="props.src"
      data-avatar-image
      :src="props.src"
      :alt="props.alt"
      :referrer-policy="props.referrerPolicy"
      :cross-origin="props.crossOrigin"
      :class="['size-full object-cover']"
    />
    <AvatarFallback
      data-avatar-fallback
      role="img"
      :aria-label="props.alt || undefined"
      :aria-hidden="props.alt ? undefined : 'true'"
      :class="['size-full flex items-center justify-center']"
    >
      <slot name="fallback">
        <div :class="['i-solar:user-circle-bold-duotone', 'size-1/2 text-neutral-400']" />
      </slot>
    </AvatarFallback>
  </AvatarRoot>
</template>
