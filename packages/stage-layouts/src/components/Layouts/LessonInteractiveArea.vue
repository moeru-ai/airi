<script setup lang="ts">
import LessonPanel from '../Widgets/LessonPanel.vue'

const props = withDefaults(defineProps<{
  mobile?: boolean
}>(), {
  mobile: false,
})
</script>

<template>
  <div
    :class="[
      'flex h-full min-h-0 w-full flex-col',
      props.mobile ? 'px-3 pb-4' : '',
    ]"
  >
    <LessonPanel :mobile="props.mobile" />
  </div>
</template>
