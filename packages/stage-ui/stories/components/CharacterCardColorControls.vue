<script setup lang="ts">
import ColorPickerControl from './ColorPickerControl.vue'

const DEFAULT_COLORS: Record<string, string> = {
  primaryColor: '#f0f9fe',
  secondaryColor: '#fef1c9',
  backgroundColor: '#ffffff',
  textColor: '#607aa1',
  textShadowColor: '#f9fdff',
  textShadowSize: '0px 0px 1px',
  descriptionTextColor: '#474c57',
  subtitleTextColor: '#6693b6',
}

const DEFAULT_TEXT_SHADOW_SIZE = '0px 0px 3px'

const primaryColor = defineModel<string>('primaryColor', { required: true })
const secondaryColor = defineModel<string>('secondaryColor', { required: true })
const backgroundColor = defineModel<string>('backgroundColor', { required: true })
const textColor = defineModel<string>('textColor', { required: true })
const textShadowColor = defineModel<string>('textShadowColor', { required: true })
const textShadowSize = defineModel<string>('textShadowSize', { required: true })
const descriptionTextColor = defineModel<string>('descriptionTextColor', { required: true })
const subtitleTextColor = defineModel<string>('subtitleTextColor', { required: true })

// Text shadow size options
const textShadowSizeOptions = [
  { value: '0px 0px 1px', label: 'Small' },
  { value: '0px 0px 3px', label: 'Medium' },
  { value: '0px 0px 5px', label: 'Large' },
  { value: '1px 1px 3px', label: 'Offset' },
]

function resetToDefault() {
  primaryColor.value = DEFAULT_COLORS.primaryColor
  secondaryColor.value = DEFAULT_COLORS.secondaryColor
  backgroundColor.value = DEFAULT_COLORS.backgroundColor
  textColor.value = DEFAULT_COLORS.textColor
  textShadowColor.value = DEFAULT_COLORS.textShadowColor
  textShadowSize.value = DEFAULT_TEXT_SHADOW_SIZE
  descriptionTextColor.value = DEFAULT_COLORS.descriptionTextColor
  subtitleTextColor.value = DEFAULT_COLORS.subtitleTextColor
}
</script>

<template>
  <div px-4 py-2 flex="~ col">
    <div mb-4>
      <h4 mb-2 font-medium>
        Card Colors
      </h4>

      <ColorPickerControl
        v-model:color="primaryColor"
        label="Primary Color"
        name="primaryColor"
      />

      <ColorPickerControl
        v-model:color="secondaryColor"
        label="Secondary Color"
        name="secondaryColor"
      />

      <ColorPickerControl
        v-model:color="backgroundColor"
        label="Background Color"
        name="backgroundColor"
      />

      <h4 mb-2 mt-4 font-medium>
        Text Colors
      </h4>

      <ColorPickerControl
        v-model:color="textColor"
        label="Title Text Color"
        name="textColor"
      />

      <ColorPickerControl
        v-model:color="subtitleTextColor"
        label="Subtitle Text Color"
        name="subtitleTextColor"
      />

      <ColorPickerControl
        v-model:color="descriptionTextColor"
        label="Description Text Color"
        name="descriptionTextColor"
      />

      <h4 mb-2 mt-4 font-medium>
        Text Shadow
      </h4>

      <ColorPickerControl
        v-model:color="textShadowColor"
        label="Shadow Color"
        name="textShadowColor"
      />

      <div mb-3>
        <div mb-1>
          <label text-sm>Shadow Size</label>
        </div>
        <select
          v-model="textShadowSize"
          class="shadow-size-select"
          w-full
          rounded-lg
          border="1 solid neutral-300 dark:neutral-700"
          p-2
          bg="white dark:neutral-800"
          text="neutral-800 dark:neutral-200"
        >
          <option
            v-for="option in textShadowSizeOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </div>
    </div>

    <button
      class="rounded-md px-2 py-1 text-xs transition-colors"
      bg="neutral-200 dark:neutral-800 hover:neutral-200 dark:hover:neutral-700"
      text="neutral-700 dark:neutral-300"
      @click="resetToDefault"
    >
      Reset to Default
    </button>
  </div>
</template>

<style scoped>
.shadow-size-select:focus {
  outline: none;
  border-color: rgb(var(--color-primary-500));
}
</style>
