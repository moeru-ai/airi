<script setup lang="ts">
import { ref } from 'vue'

import CharacterCard from './CharacterCard.vue'
import characterImage from './relu.png'

const primaryColor = ref('#f0f9fe')
const secondaryColor = ref('#fef1c9')
const backgroundColor = ref('#ffffff')
const textColor = ref('#607aa1')
const textShadowColor = ref('#f9fdff')
const textShadowSize = ref('0px 0px 1px')
const descriptionTextColor = ref('#474c57')
const subtitleTextColor = ref('#6693b6')
</script>

<template>
  <Story
    title="Character Card"
    group="menu"
    :layout="{ type: 'grid', width: 500 }"
  >
    <template #controls>
      <ThemeColorsHueControl />
      <CharacterCardColorControls
        v-model:primary-color="primaryColor"
        v-model:secondary-color="secondaryColor"
        v-model:background-color="backgroundColor"
        v-model:text-color="textColor"
        v-model:text-shadow-color="textShadowColor"
        v-model:text-shadow-size="textShadowSize"
        v-model:description-text-color="descriptionTextColor"
        v-model:subtitle-text-color="subtitleTextColor"
      />
    </template>

    <Variant
      id="default"
      title="Character Card"
    >
      <div p-4>
        <CharacterCard
          title="ReLU"
          subtitle="ReLU-chan"
          description="First awaken cyber consciousness in Project AIRI, quite a bit of a prankster"
          :image="characterImage"
          :primary-color="primaryColor"
          :secondary-color="secondaryColor"
          :background-color="backgroundColor"
          :text-color="textColor"
          :text-shadow-color="textShadowColor"
          :text-shadow-size="textShadowSize"
          :description-text-color="descriptionTextColor"
          :subtitle-text-color="subtitleTextColor"
          :card-height="150"
          :card-width="90"
        />
      </div>
    </Variant>

    <Variant
      id="default-without-image"
      title="Character Card without image"
    >
      <div p-4>
        <CharacterCard
          title="ReLU"
          subtitle="ReLU-chan"
          description="First awaken cyber consciousness in Project AIRI, quite a bit of a prankster"
          :primary-color="primaryColor"
          :secondary-color="secondaryColor"
          :background-color="backgroundColor"
          :text-color="textColor"
          :text-shadow-color="textShadowColor"
          :text-shadow-size="textShadowSize"
          :description-text-color="descriptionTextColor"
          :subtitle-text-color="subtitleTextColor"
          :card-height="150"
          :card-width="90"
        />
      </div>
    </Variant>
  </Story>
</template>
