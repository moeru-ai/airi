<script setup lang="ts">
import { FieldRange } from '@proj-airi/ui'
import { ref } from 'vue'

import PoppinText from './PoppinText.web.vue'

import { createFadeAnimator, createFloatAnimator, createPopupAnimator } from './animators'

const text = ref('行こう、七色のキラキラドキドキに向かって！')
const duration = ref(750)
</script>

<template>
  <Story
    title="Poppin'Text"
    group="widgets"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <template #controls>
      <FieldRange
        v-model.number="duration"
        :min="50"
        :max="3000"
        :step="50"
        label="Duration"
      />
    </template>

    <Variant
      id="popup"
      title="Popup"
    >
      <div h-auto w-full p-4>
        <PoppinText :text="text" :animator="createPopupAnimator({ duration })" />
      </div>
    </Variant>

    <Variant
      id="fade"
      title="Fade"
    >
      <div h-auto w-full p-4>
        <PoppinText :text="text" :animator="createFadeAnimator({ duration })" />
      </div>
    </Variant>

    <Variant
      id="float"
      title="Float"
    >
      <div h-auto w-full p-4>
        <PoppinText :text="text" :animator="createFloatAnimator({ duration })" />
      </div>
    </Variant>
  </Story>
</template>
