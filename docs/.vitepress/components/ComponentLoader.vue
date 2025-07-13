<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

import Spinner from './Spinner.vue'

const props = defineProps<{
  name: string
}>()

const Component = defineAsyncComponent({
  loadingComponent: Spinner,
  loader: () => import(`../../components/demo/${props.name}/tailwind/index.vue`),
  timeout: 5000,
  suspensible: false,
})
</script>

<template>
  <Component :is="Component" />
</template>
