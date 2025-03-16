<script setup lang="ts">
import ProviderSettingsLayout from './ProviderSettingsLayout.vue'
</script>

<template>
  <Story
    title="Settings Layout"
    group="providers"
    :layout="{ type: 'grid', width: 800 }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="default"
      title="Default"
    >
      <div>
        <ProviderSettingsLayout provider-name="Example Provider">
          <div class="mt-4 rounded-xl bg-neutral-50 p-4 dark:bg-[rgba(0,0,0,0.3)]">
            <p>Provider settings content goes here</p>
          </div>
        </ProviderSettingsLayout>
      </div>
    </Variant>

    <Variant
      id="with-icon"
      title="With Icon"
    >
      <div>
        <ProviderSettingsLayout
          provider-name="OpenAI" provider-icon="i-lobe-icons:openai"
        >
          <div class="mt-4 rounded-xl bg-neutral-50 p-4 dark:bg-[rgba(0,0,0,0.3)]">
            <p>Provider settings content goes here</p>
          </div>
        </ProviderSettingsLayout>
      </div>
    </Variant>

    <Variant
      id="with-icon-color"
      title="With Icon Color"
    >
      <div>
        <ProviderSettingsLayout
          provider-name="Mistral AI" provider-icon-color="i-lobe-icons:mistral-color"
        >
          <div class="mt-4 rounded-xl bg-neutral-50 p-4 dark:bg-[rgba(0,0,0,0.3)]">
            <p>Provider settings content goes here</p>
          </div>
        </ProviderSettingsLayout>
      </div>
    </Variant>
  </Story>
</template>
