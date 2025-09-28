<script setup lang="ts">
import ProviderAdvancedSettings from './ProviderAdvancedSettings.vue'
import ProviderBasicSettings from './ProviderBasicSettings.vue'
import ProviderSettingsContainer from './ProviderSettingsContainer.vue'
</script>

<template>
  <Story
    title="Settings Container"
    group="providers"
    :layout="{ type: 'grid', width: 800 }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="empty"
      title="Empty"
    >
      <div>
        <ProviderSettingsContainer>
          <div class="p-4">
            <p>Container content goes here</p>
          </div>
        </ProviderSettingsContainer>
      </div>
    </Variant>

    <Variant
      id="with-sections"
      title="With Sections"
    >
      <div>
        <ProviderSettingsContainer>
          <ProviderBasicSettings
            title="Basic"
            description="Essential settings"
          >
            <div class="border border-neutral-200 rounded p-4 dark:border-neutral-800">
              <p>Basic settings content</p>
            </div>
          </ProviderBasicSettings>

          <ProviderAdvancedSettings title="Advanced">
            <div class="border border-neutral-200 rounded p-4 dark:border-neutral-800">
              <p>Advanced settings content</p>
            </div>
          </ProviderAdvancedSettings>
        </ProviderSettingsContainer>
      </div>
    </Variant>
  </Story>
</template>
