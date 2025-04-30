<script setup lang="ts">
import ProviderAdvancedSettings from './ProviderAdvancedSettings.vue'
</script>

<template>
  <Story
    title="Advanced Settings"
    group="providers"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="collapsed"
      title="Collapsed (Default)"
    >
      <div>
        <ProviderAdvancedSettings>
          <div class="border border-neutral-200 rounded p-4 dark:border-neutral-800">
            <p>Advanced settings content (initially hidden)</p>
          </div>
        </ProviderAdvancedSettings>
      </div>
    </Variant>

    <Variant
      id="expanded"
      title="Expanded"
    >
      <div>
        <ProviderAdvancedSettings :initial-visible="true">
          <div class="border border-neutral-200 rounded p-4 dark:border-neutral-800">
            <p>Advanced settings content (initially visible)</p>
          </div>
        </ProviderAdvancedSettings>
      </div>
    </Variant>

    <Variant
      id="custom-title"
      title="Custom Title"
    >
      <div>
        <ProviderAdvancedSettings title="Expert Settings">
          <div class="border border-neutral-200 rounded p-4 dark:border-neutral-800">
            <p>Expert settings content</p>
          </div>
        </ProviderAdvancedSettings>
      </div>
    </Variant>
  </Story>
</template>
