<script setup lang="ts">
import { BottomDrawer, Button } from '@proj-airi/ui'
import { shallowRef } from 'vue'

const contentOpen = shallowRef(false)
const halfOpen = shallowRef(false)
const closes = shallowRef(0)
</script>

<template>
  <Story title="Bottom Drawer" group="dialogs">
    <Variant id="content" title="Content height and close event">
      <div :class="['p-4']">
        <BottomDrawer v-model="contentOpen" title="Character details" @after-close="closes++">
          <template #trigger>
            <Button label="Open content drawer" />
          </template>
          <p :class="['mb-4']">
            The drawer follows its content height.
          </p>
          <Button label="Close drawer" @click="contentOpen = false" />
        </BottomDrawer>
        <p>Completed dismissals: {{ closes }}</p>
      </div>
    </Variant>
    <Variant id="half" title="Half height and scrollable content">
      <div :class="['p-4']">
        <BottomDrawer v-model="halfOpen" title="Available models" minimum-height="half">
          <template #trigger>
            <Button label="Open half-height drawer" />
          </template>
          <div :class="['flex flex-col gap-3']">
            <p v-for="row in 20" :key="row">
              Model {{ row }}
            </p>
            <Button label="Close model drawer" @click="halfOpen = false" />
          </div>
        </BottomDrawer>
      </div>
    </Variant>
  </Story>
</template>
