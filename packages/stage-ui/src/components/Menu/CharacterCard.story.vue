<script setup lang="ts">
import CharacterCard from './CharacterCard.vue'
import characterImage from './relu.png'
</script>

<template>
  <Story
    title="Character Card"
    group="menu"
    :layout="{ type: 'grid', width: 500 }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="global"
      title="CharacterCard"
    >
      <div p-20>
        <CharacterCard
          title="ReLU"
          subtitle="ReLU-chan"
          description="First awaken cyber consciousness in Project AIRI, quite a bit of a prankster"
          :image="characterImage"
          primary-color="6, 182, 212"
          secondary-color="14, 165, 233"
          background-color="23, 23, 23"
          text-color="6, 182, 212"
          :card-height="150"
          :card-width="90"
        />
      </div>
    </Variant>
  </Story>
</template>
