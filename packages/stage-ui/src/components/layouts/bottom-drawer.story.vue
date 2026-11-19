<script setup lang="ts">
import { BottomDrawer, Button, GhostButton, Input } from '@proj-airi/ui'
import { shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const contentOpen = shallowRef(false)
const halfOpen = shallowRef(false)
const closes = shallowRef(0)
const titledOpen = shallowRef(false)
const hiddenTitleOpen = shallowRef(false)
const message = shallowRef('')
const lastAction = shallowRef('')
</script>

<template>
  <Story title="Bottom Drawer" group="dialogs">
    <Variant id="default" title="Visible title and editable input">
      <div :class="['p-5']">
        <BottomDrawer v-model="titledOpen" :title="t('stage.mobile-tools.title')">
          <template #trigger>
            <GhostButton>{{ t('stage.mobile-tools.settings') }}</GhostButton>
          </template>
          <Input v-model="message" :aria-label="t('stage.message')" :placeholder="t('stage.message')" />
        </BottomDrawer>
      </div>
    </Variant>
    <Variant id="hidden-title" title="Accessible hidden title and actions">
      <div :class="['p-5']">
        <BottomDrawer v-model="hiddenTitleOpen" :title="t('stage.mobile-tools.title')" hide-title>
          <template #trigger>
            <GhostButton>{{ t('stage.mobile-tools.settings') }}</GhostButton>
          </template>
          <GhostButton block @click="lastAction = t('stage.mobile-tools.background')">
            {{ t('stage.mobile-tools.background') }}
          </GhostButton>
          <GhostButton disabled block>
            {{ t('stage.mobile-tools.view') }}
          </GhostButton>
          <output :class="['mt-3 block text-sm text-neutral-500 dark:text-neutral-400']">{{ lastAction }}</output>
        </BottomDrawer>
      </div>
    </Variant>
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
