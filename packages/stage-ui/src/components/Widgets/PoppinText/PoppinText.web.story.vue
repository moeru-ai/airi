<script setup lang="ts">
import { ref } from 'vue'

import PoppinText from './PoppinText.web.vue'

import { fadeAnimator, popupAnimator } from './animators'

const text = ref('キラキラドキドキキラキラドキドキキラキラドキドキキラキラドキドキ')
</script>

<template>
  <Story
    title="Poppin'Text"
    group="widgets"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="popup"
      title="Popup"
    >
      <div h-auto w-full p-4>
        <PoppinText :text="text" :animator="popupAnimator" />
      </div>
    </Variant>

    <Variant
      id="fade"
      title="Fade"
    >
      <div h-auto w-full p-4>
        <PoppinText :text="text" :animator="fadeAnimator" />
      </div>
    </Variant>
  </Story>
</template>
