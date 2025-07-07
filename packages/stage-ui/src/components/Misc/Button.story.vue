<script setup lang="ts">
import Button from './Button.vue'
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
          <Button label="Danger Button" variant="danger" />
        </div>
        <!-- <div class="flex flex-row gap-4 p-2">
          <Button label="Primary Button" theme="dimmed" />
          <Button label="Secondary Button" variant="secondary" theme="dimmed" />
          <Button label="Danger Button" variant="danger" theme="dimmed" />
        </div> -->
        <!-- <div class="flex flex-row gap-4 p-2">
          <Button label="Primary Button" theme="lightened" />
          <Button label="Secondary Button" variant="secondary" theme="lightened" />
          <Button label="Danger Button" variant="danger" theme="lightened" />
        </div> -->
      </div>
    </Variant>

    <Variant
      id="disabled"
      title="Disabled State"
    >
      <div class="flex flex-row gap-4 p-2">
        <Button label="Disabled Primary" disabled />
        <Button label="Disabled Secondary" variant="secondary" disabled />
        <Button label="Disabled Danger" variant="danger" disabled />
      </div>
    </Variant>

    <Variant
      id="loading"
      title="Loading State"
    >
      <div class="flex flex-row gap-4 p-2">
        <Button label="Loading Primary" loading />
        <Button label="Loading Secondary" variant="secondary" loading />
        <Button label="Loading Danger" variant="danger" loading />
      </div>
    </Variant>

    <Variant
      id="with-icon"
      title="With Icon"
    >
      <div class="flex flex-row gap-4 p-2">
        <Button label="Add Item" icon="i-solar:add-circle-line-duotone" />
        <Button label="Delete Item" variant="danger" icon="i-solar:trash-bin-trash-line-duotone" />
        <Button label="Settings" variant="secondary" icon="i-solar:settings-line-duotone" />
      </div>
    </Variant>

    <Variant
      id="icon-only"
      title="Icon Only"
    >
      <div class="flex gap-4 p-2">
        <Button icon="i-solar:add-circle-line-duotone" />
        <Button variant="secondary" icon="i-solar:settings-line-duotone" />
        <Button variant="danger" icon="i-solar:trash-bin-trash-line-duotone" />
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
      </div>
    </Variant>

    <Variant
      id="block"
      title="Block Button"
    >
      <div class="flex flex-col gap-4 p-2">
        <Button label="Block Primary" block />
        <Button label="Block Secondary" variant="secondary" block />
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
