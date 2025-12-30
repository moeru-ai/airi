<script setup lang="ts">
import { BackgroundPickerDialog } from '@proj-airi/stage-ui/components'
import { storeToRefs } from 'pinia'

import { useBackgroundStore } from '../../stores/background'

const show = defineModel<boolean>({ default: false })

const backgroundStore = useBackgroundStore()
const { options, selectedOption } = storeToRefs(backgroundStore)
</script>

<template>
  <BackgroundPickerDialog
    v-model="show"
    :selected="selectedOption"
    :options="options"
    @apply="backgroundStore.applyPickerSelection"
    @remove="option => backgroundStore.removeOption(option.id)"
  />
</template>
