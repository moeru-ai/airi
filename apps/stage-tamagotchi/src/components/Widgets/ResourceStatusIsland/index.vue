<script setup lang="ts">
import { storeToRefs } from 'pinia'

import { useResourcesStore } from '../../../stores/resources'
import LoadingProgress from './LoadingProgress.vue'

const { resources } = storeToRefs(useResourcesStore())
</script>

<template>
  <LoadingProgress :progress-info="resources" />
</template>
