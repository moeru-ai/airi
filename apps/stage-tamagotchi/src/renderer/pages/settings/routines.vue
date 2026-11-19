<script setup lang="ts">
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'

import RoutinesPanel from '../../components/routines/routines-panel.vue'

import { routinesApply, routinesConfirm, routinesRead } from '../../../shared/eventa/routines'

const read = useElectronEventaInvoke(routinesRead)
const apply = useElectronEventaInvoke(routinesApply)
const confirm = useElectronEventaInvoke(routinesConfirm)
const client = { read, apply, confirm: (id: string) => confirm({ id }) }
</script>

<template>
  <RoutinesPanel :client="client" />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: routines.heading
  descriptionKey: routines.description
  icon: i-solar:calendar-bold-duotone
  settingsEntry: true
  order: 65
</route>
