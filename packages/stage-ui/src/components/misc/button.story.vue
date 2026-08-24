<script setup lang="ts">
import { Button, GhostButton, IconButton, OverlayButton } from '@proj-airi/ui'
import { computed, shallowRef } from 'vue'

const buttonColors = ['neutral', 'primary', 'cyan', 'blue', 'green', 'lime', 'amber', 'red', 'orange', 'purple', 'pink'] as const

const liked = shallowRef(false)
const favorited = shallowRef(false)

const heartIcon = computed(() => liked.value ? 'i-ph:heart-fill' : 'i-ph:heart')
const starIcon = computed(() => favorited.value ? 'i-ph:star-fill' : 'i-ph:star')
</script>

<template>
  <Story
    title="Button"
    group="misc"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant id="variant" title="Variant">
      <div :class="['flex flex-wrap items-center gap-4 p-4']">
        <Button label="Primary" color="primary" variant="primary" />
        <Button label="Secondary" color="primary" variant="secondary" />
      </div>
    </Variant>

    <Variant id="color" title="Color">
      <div :class="['grid grid-cols-2 gap-4 p-4 sm:grid-cols-4']">
        <div
          v-for="color in buttonColors"
          :key="color"
          :class="['flex flex-col gap-3']"
        >
          <Button :label="`${color} primary`" :color="color" variant="primary" />
          <Button :label="`${color} secondary`" :color="color" variant="secondary" />
          <Button :label="`${color} disabled`" :color="color" disabled />
        </div>
      </div>
    </Variant>

    <Variant id="shape" title="Shape">
      <div :class="['flex flex-wrap items-center gap-4 p-4']">
        <Button label="Rect" shape="rect" />
        <Button label="Rounded" shape="rounded" />
        <Button label="Parallelogram" shape="parallelogram" />
        <Button icon="i-ph:plus" shape="circle" aria-label="Circle" />
      </div>
    </Variant>

    <Variant id="states" title="States">
      <div :class="['flex flex-wrap items-center gap-4 p-4']">
        <Button label="Default" />
        <Button label="Disabled" disabled />
        <Button label="Loading" loading />
      </div>
    </Variant>

    <Variant id="size" title="Size">
      <div :class="['flex flex-wrap items-center gap-4 p-4']">
        <Button label="Small" size="sm" />
        <Button label="Medium" size="md" />
        <Button label="Large" size="lg" />
      </div>
    </Variant>

    <Variant id="ghost-button" title="Ghost Button">
      <div :class="['flex flex-wrap items-center gap-4 p-4']">
        <GhostButton label="Action" icon="i-solar:pen-new-square-linear" />
        <GhostButton label="Active" icon="i-solar:check-circle-linear" active />
        <GhostButton label="Disabled" icon="i-solar:forbidden-circle-linear" disabled />
        <GhostButton label="Loading" loading />
      </div>
    </Variant>

    <Variant id="icon-button" title="Icon Button">
      <div :class="['flex flex-wrap items-center gap-4 p-4']">
        <IconButton
          :icon="heartIcon"
          :class="[liked && 'text-red', 'text-2xl']"
          :aria-label="liked ? 'Unlike' : 'Like'"
          :aria-pressed="liked"
          size="unset"
          @click="liked = !liked"
        />
        <IconButton
          :icon="starIcon"
          :class="[favorited && 'text-amber', 'text-2xl']"
          :aria-label="favorited ? 'Remove favorite' : 'Favorite'"
          :aria-pressed="favorited"
          size="unset"
          @click="favorited = !favorited"
        />
        <IconButton icon="i-ph:trash" disabled aria-label="Delete disabled" />
        <IconButton loading aria-label="Loading" />
      </div>
    </Variant>

    <Variant id="overlay-button" title="Overlay Button">
      <div :class="['flex flex-wrap items-center gap-4 p-4']">
        <OverlayButton label="Overlay" icon="i-solar:widget-2-linear" />
        <OverlayButton label="Disabled" icon="i-solar:lock-linear" disabled />
        <OverlayButton label="Loading" loading />
      </div>
    </Variant>
  </Story>
</template>
