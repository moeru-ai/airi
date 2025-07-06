<script setup lang="ts">
import Callout from './Callout.vue'
</script>

<template>
  <Story
    title="Callout"
    group="common"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="default"
      title="Default"
    >
      <Callout>
        <div>
          <div>
            Primary theme.
          </div>
          <div>
            The Project AIRI theme, powered by our <a decoration-underline decoration-dashed href="https://github.com/proj-airi/chromatic">Chromatic</a> design system.
          </div>
        </div>
      </Callout>
    </Variant>

    <Variant
      id="theme"
      title="Theme Variants"
    >
      <Callout theme="violet">
        <div>
          <div>
            AIRI is running pure locally in your browser, and we will never steal your credentials for AI / LLM providers. But keep in mind that your API keys are sensitive information. Make sure to keep them safe and do not share them with anyone.
          </div>
          <div>
            AIRI is open sourced at <div inline-flex translate-y-1 items-center gap-1>
              <div i-simple-icons:github inline-block /><a decoration-underline decoration-dashed href="https://github.com/moeru-ai/airi" target="_blank" rel="noopener noreferrer">GitHub</a>
            </div>, if you want to check how we handle your credentials, feel free to inspect our code.
          </div>
        </div>
      </Callout>
    </Variant>

    <Variant
      id="label-props"
      title="With Label"
    >
      <Callout theme="lime" label="Tips!">
        <div>
          Do you know that you can use the <code>label</code> prop to add a label to the callout? This is useful for highlighting important information or tips.
        </div>
      </Callout>
    </Variant>

    <Variant
      id="label-slot"
      title="With Label Slot"
    >
      <Callout theme="orange">
        <template #label>
          <div flex items-center gap-1 font-normal>
            <div i-solar:danger-circle-bold-duotone text-lg />
            <div text-base>
              Before deleting data...
            </div>
          </div>
        </template>
        <div text-base>
          <div>
            This action cannot be undone. Make sure you have a backup of your data before proceeding.
          </div>
        </div>
      </Callout>
    </Variant>
  </Story>
</template>
