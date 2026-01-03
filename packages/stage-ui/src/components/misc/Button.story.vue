<script setup lang="ts">
import { Button } from '@proj-airi/ui'
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

    <Variant
      id="basic"
      title="Basic Button"
    >
      <div flex flex-col>
        <div class="flex flex-row gap-4 p-2">
          <Button label="Primary Button" />
          <Button label="Secondary Button" variant="secondary" />
          <Button label="Caution Button" variant="caution" />
          <Button label="Danger Button" variant="danger" />
          <Button label="Ghost Button" variant="ghost" />
        </div>
      </div>
    </Variant>

    <Variant
      id="disabled"
      title="Disabled State"
    >
      <div class="flex flex-row gap-4 p-2">
        <Button label="Disabled Primary" disabled />
        <Button label="Disabled Secondary" variant="secondary" disabled />
        <Button label="Disabled Caution" variant="caution" disabled />
        <Button label="Disabled Danger" variant="danger" disabled />
        <Button label="Disabled Ghost" variant="ghost" disabled />
      </div>
    </Variant>

    <Variant
      id="loading"
      title="Loading State"
    >
      <div class="flex flex-row gap-4 p-2">
        <Button label="Loading Primary" loading />
        <Button label="Loading Secondary" variant="secondary" loading />
        <Button label="Loading Caution" variant="caution" loading />
        <Button label="Loading Danger" variant="danger" loading />
        <Button label="Loading Ghost" variant="ghost" loading />
      </div>
    </Variant>

    <Variant
      id="with-icon"
      title="With Icon"
    >
      <div class="flex flex-row gap-4 p-2">
        <Button label="Add Item" icon="i-solar:add-circle-line-duotone" />
        <Button label="Warn" variant="caution" icon="i-solar:danger-triangle-line-duotone" />
        <Button label="Delete Item" variant="danger" icon="i-solar:trash-bin-trash-line-duotone" />
        <Button label="Settings" variant="secondary" icon="i-solar:settings-line-duotone" />
        <Button label="Plain" variant="ghost" icon="i-solar:emoji-funny-circle-line-duotone" />
      </div>
    </Variant>

    <Variant
      id="icon-only"
      title="Icon Only"
    >
      <div class="flex gap-4 p-2">
        <Button icon="i-solar:add-circle-line-duotone" />
        <Button variant="secondary" icon="i-solar:settings-line-duotone" />
        <Button variant="caution" icon="i-solar:danger-triangle-line-duotone" />
        <Button variant="danger" icon="i-solar:trash-bin-trash-line-duotone" />
        <Button variant="ghost" icon="i-solar:neutral-face-outline" />
      </div>
    </Variant>

    <Variant
      id="sizes"
      title="Button Sizes"
    >
      <div class="flex items-center gap-4 p-2">
        <Button label="Small" size="sm" />
        <Button label="Medium" size="md" />
        <Button label="Large" size="lg" />
        <Button label="Caution" variant="caution" />
      </div>
    </Variant>

    <Variant
      id="block"
      title="Block Button"
    >
      <div class="flex flex-col gap-4 p-2">
        <Button label="Block Primary" block />
        <Button label="Block Secondary" variant="secondary" block />
        <Button label="Block Caution" variant="caution" block />
        <Button label="Block Danger" variant="danger" block />
      </div>
    </Variant>

    <Variant
      id="slot"
      title="Using Slot Content"
    >
      <div class="flex flex-row gap-4 p-2">
        <Button>Custom Content</Button>
        <Button variant="secondary">
          <div class="flex items-center gap-2">
            <div i-solar:star-line-duotone />
            Complex Content
          </div>
        </Button>
      </div>
    </Variant>
  </Story>
</template>
