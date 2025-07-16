<script setup lang="ts">
import ProviderBasicSettings from './ProviderBasicSettings.vue'
</script>

<template>
  <Story
    title="Basic Settings"
    group="providers"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="default"
      title="Default"
    >
      <div>
        <ProviderBasicSettings>
          <div class="border border-neutral-200 rounded p-4 dark:border-neutral-800">
            <p>Settings content goes here</p>
          </div>
        </ProviderBasicSettings>
      </div>
    </Variant>

    <Variant
      id="with-title-description"
      title="With Title & Description"
    >
      <div>
        <ProviderBasicSettings
          title="Custom Title"
          description="Custom description for this section"
        >
          <div class="border border-neutral-200 rounded p-4 dark:border-neutral-800">
            <p>Settings content goes here</p>
          </div>
        </ProviderBasicSettings>
      </div>
    </Variant>

    <Variant
      id="with-reset"
      title="With Reset Button"
    >
      <div>
        <ProviderBasicSettings
          title="Basic Settings"
          description="Essential settings for this provider"
        >
          <div class="border border-neutral-200 rounded p-4 dark:border-neutral-800">
            <p>Settings content goes here</p>
          </div>
        </ProviderBasicSettings>
      </div>
    </Variant>
  </Story>
</template>
