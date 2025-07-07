<script setup lang="ts">
import { ref } from 'vue'

import PoppinText from './PoppinText.web.vue'

import { popupAnimator } from './animators'

const text = ref('キラキラドキドキ')
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
      id="basic-english"
      title="English Text"
    >
      <div h-50 w-50 p-4>
        <PoppinText :text="text" :animator="popupAnimator" />
      </div>
    </Variant>
  </Story>
</template>
