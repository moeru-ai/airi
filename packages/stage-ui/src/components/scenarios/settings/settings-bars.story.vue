<script setup lang="ts">
import { Button } from '@proj-airi/ui'
import { shallowRef } from 'vue'

import Bar from './bar.vue'
import ButtonBar from './button-bar.vue'
import CheckBar from './check-bar.vue'

const checked = shallowRef(true)
const clicks = shallowRef(0)
</script>

<template>
  <Story title="Settings Bars" group="misc">
    <Variant id="bars" title="Content, action, and switch">
      <div :class="['flex flex-col gap-4 p-4']">
        <Bar text="settings.wip.title" description="settings.wip.description">
          <Button label="Details" />
        </Bar>
        <ButtonBar text="settings.wip.title" icon="i-solar:info-circle-linear" @click="clicks++">
          Details
        </ButtonBar>
        <CheckBar v-model="checked" text="settings.wip.title" description="settings.wip.description" />
        <CheckBar v-model="checked" text="settings.wip.title" disabled />
        <p>Enabled: {{ checked }}. Action clicks: {{ clicks }}.</p>
      </div>
    </Variant>
  </Story>
</template>
