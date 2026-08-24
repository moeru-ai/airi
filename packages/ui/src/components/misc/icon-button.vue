<script setup lang="ts">
import type { BasicButtonProps } from './button-types'

import BasicButton from './basic-button.vue'

type IconButtonProps = Pick<BasicButtonProps, 'icon' | 'disabled' | 'loading'>

const props = defineProps<IconButtonProps>()
</script>

<template>
  <BasicButton
    v-bind="props"
    :class="['shrink-0 p-0!']"
  >
    <slot />
  </BasicButton>
</template>
